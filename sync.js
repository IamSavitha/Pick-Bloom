/* Pick&Bloom sync: keeps one Supabase row per account in step with this device by merging the whole family. */
(function (root) {
  'use strict';

  const PB = (typeof module === 'object' && module.exports)
    ? { ...require('./store.js'), ...require('./family.js') } : root.PB;
  const TABLE = 'pickbloom_state';
  const LINKED_KEY = 'pickbloom.syncLinked'; // the account this device's family belongs to
  const SET_ASIDE_PREFIX = 'pickbloom.v1.account-'; // another account's family, kept on this device until it signs in again
  const DEVICE_KEY = 'pickbloom.v1.device'; // this device's own children, kept out of a login the grown-up said no to

  /** JSON with object keys sorted, so two equal families always serialize the same way. */
  function stableJson(value) {
    if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().filter((k) => value[k] !== undefined)
        .map((k) => JSON.stringify(k) + ':' + stableJson(value[k])).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  /**
   * Nothing here talks to the server unless someone is signed in: start() only reads the session
   * this device already has, and syncNow() does nothing without a signed-in user.
   *
   * @param {object} opts
   * @param opts.client  a Supabase client (or a fake with the same shape)
   * @param opts.getState () => the current local family
   * @param opts.setState (family, info?) => boolean|void — replace the local family (the caller saves and re-renders).
   *        info.renamed = { from, to } when this device's first child was given a new id (see below);
   *        info.switched = true when a different account signed in and its own family replaced this one.
   * @param opts.onStatus ({kind:'signed-out'|'syncing'|'synced'|'error', at?, message?}) => void
   * @param opts.onFirstChildConflict ({localName, incomingName}) => boolean|Promise<boolean>
   *        asked once per account per device, when this device's first child and the account's first child look
   *        like different children. true = the same child (combine them), false = different children (keep both).
   * @param opts.onClaimDevice ({names, email}) => boolean|Promise<boolean>
   *        asked when an account first syncs on a device that has its own children with progress but no account yet:
   *        true = they belong to this login (combine), false = keep them on this device, apart from the login.
   * @param opts.storage optional localStorage-like store: remembers which account this device's family belongs to,
   *        and keeps another account's family aside (never uploaded to a different account).
   */
  function createSync({ client, getState, setState, onStatus, onFirstChildConflict = () => true, onClaimDevice = () => true, storage = null }) {
    let user = null;
    let running = null;
    let again = false;
    let signingIn = false;
    let switched = false;      // this device changed account in this session (for a note in the Sync tab)
    let linkedInMemory = null;
    const asideInMemory = {};  // used only when there is no storage

    function linkedAccount() {
      try { if (storage) { const id = storage.getItem(LINKED_KEY); if (id) return id; } } catch (e) { /* use memory */ }
      return linkedInMemory;
    }
    function markLinked(id) {
      linkedInMemory = id;
      try { if (storage) storage.setItem(LINKED_KEY, id); } catch (e) { /* memory is enough for now */ }
    }

    function unlink() {
      linkedInMemory = null;
      try { if (storage) storage.removeItem(LINKED_KEY); } catch (e) { /* memory is cleared */ }
    }

    // A family kept aside on this device: another account's (SET_ASIDE_PREFIX + id) or the device's own (DEVICE_KEY).
    /** Throws if it can't be kept, so nothing gets replaced. */
    function setAside(key, family) {
      const text = JSON.stringify(family);
      if (!storage) { asideInMemory[key] = text; return; }
      storage.setItem(key, text);
      if (storage.getItem(key) !== text) throw new Error("progress on this device couldn't be kept safely");
    }
    function setAsideFamily(key) {
      let text = null;
      try { text = storage ? storage.getItem(key) : asideInMemory[key] || null; } catch (e) { text = null; }
      if (!text) return null;
      try { const f = PB.upgradeFamily(JSON.parse(text)); return PB.isValidFamily(f) ? f : null; } catch (e) { return null; }
    }
    function dropSetAside(key) {
      delete asideInMemory[key];
      try { if (storage) storage.removeItem(key); } catch (e) { /* harmless: merged again next time */ }
    }

    const hasProgress = (family) => family.children.some((c) => c.entries.length > 0);
    const namesOf = (family) => PB.activeChildren(family).map((c, i) => c.settings.childName || `Child ${i + 1}`);

    async function pullMergePush() {
      const me = user;
      onStatus({ kind: 'syncing' });
      try {
        const { data, error } = await client.from(TABLE).select('state').eq('user_id', me.id).maybeSingle();
        if (error) throw error;
        const upgraded = data ? PB.upgradeFamily(data.state) : null;
        const remote = upgraded && PB.isValidFamily(upgraded) ? upgraded : null;
        const linked = linkedAccount();
        // The family on this device belongs to another account: never merge it into this one. It is kept aside
        // (and comes back when that account signs in here again); this account gets its own family.
        const otherAccount = !!linked && linked !== me.id;
        // No account yet, but this device has children with progress: ask before adding them to this login.
        let keepDeviceApart = false;
        if (!linked && hasProgress(getState())) {
          keepDeviceApart = !(await onClaimDevice({ names: namesOf(getState()), email: me.email || '' }));
        }
        // Joining an account for the first time on this device: is our first child the account's first child?
        // If not, this device's child gets a new id, so the account's other devices keep theirs.
        let renamed = null;
        if (remote && !linked && !keepDeviceApart) {
          const conflict = PB.firstChildConflict(getState(), remote);
          if (conflict && !(await onFirstChildConflict(conflict))) renamed = { from: PB.FIRST_CHILD_ID, to: PB.newChildId() };
        }
        if (user !== me) return; // signed out while we were waiting: don't upload
        const apart = otherAccount || keepDeviceApart; // this device's family stays out of this account
        const ours = (f) => (renamed ? PB.separateFirstChild(f, renamed.to) : f);
        const mine = setAsideFamily(SET_ASIDE_PREFIX + me.id); // this account's family, if it was set aside here
        const base = apart ? (mine || PB.emptyFamily()) : ours(getState());
        const local = !apart && mine ? PB.mergeFamilies(base, mine) : base;
        const merged = remote ? PB.mergeFamilies(local, remote) : local;
        if (!PB.isValidFamily(merged)) throw new Error("this device's progress couldn't be combined with the synced copy");
        if (!remote || stableJson(merged) !== stableJson(remote)) { // nothing new for the server: skip the upload
          const { error: upError } = await client.from(TABLE).upsert({ user_id: me.id, state: merged, updated_at: new Date().toISOString() });
          if (upError) throw upError;
        }
        if (user !== me) return;
        let kept;
        if (apart) {
          // the latest, including taps made while we waited on the network
          if (otherAccount) setAside(SET_ASIDE_PREFIX + linked, getState());
          else {
            const earlier = setAsideFamily(DEVICE_KEY);
            setAside(DEVICE_KEY, earlier ? PB.mergeFamilies(earlier, getState()) : getState());
          }
          kept = setState(merged, { switched: true });
          if (kept !== false) switched = true;
        } else {
          // Merge again with whatever the child did while we were waiting on the network.
          kept = setState(PB.mergeFamilies(ours(getState()), merged), renamed ? { renamed } : {});
        }
        if (kept === false) throw new Error("the synced copy couldn't be shown on this device");
        markLinked(me.id);
        if (mine) dropSetAside(SET_ASIDE_PREFIX + me.id);
        onStatus({ kind: 'synced', at: new Date() });
      } catch (err) {
        if (user === me) onStatus({ kind: 'error', message: (err && err.message) || 'Sync failed' });
      }
    }

    /** Signed out, and this device's own children were kept apart from a login earlier: are they still here? */
    const hasDeviceFamily = () => !user && !!setAsideFamily(DEVICE_KEY);

    /**
     * Bring this device's earlier children back (signed out only). The login's family now on screen is kept aside
     * for that login, and the device is no longer tied to it, so the next sign-in asks again.
     */
    function restoreDeviceFamily() {
      if (user) return false;
      const device = setAsideFamily(DEVICE_KEY);
      if (!device) return false;
      const linked = linkedAccount();
      try {
        if (linked) {
          const theirs = setAsideFamily(SET_ASIDE_PREFIX + linked);
          setAside(SET_ASIDE_PREFIX + linked, theirs ? PB.mergeFamilies(theirs, getState()) : getState());
        }
        if (setState(device, { switched: true }) === false) return false;
      } catch (e) { return false; }
      unlink();
      dropSetAside(DEVICE_KEY);
      switched = false;
      return true;
    }

    function syncNow() {
      if (!user) return Promise.resolve();
      if (running) { again = true; return running; }
      running = pullMergePush().finally(() => {
        running = null;
        if (again) { again = false; syncNow(); }
      });
      return running;
    }

    function signedOut() {
      user = null;
      again = false;
      onStatus({ kind: 'signed-out' });
    }

    // The real client tells us when a session ends on its own (expired, or signed out in another tab).
    // Only plain assignments here: Supabase asks that this callback not call back into the client.
    if (client.auth && typeof client.auth.onAuthStateChange === 'function') {
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' && user) signedOut();
        else if (event === 'SIGNED_IN' && !user && !signingIn && session && session.user) {
          user = session.user; // signed in in another tab: sync here too (outside this callback)
          setTimeout(() => { syncNow(); }, 0);
        } else if (session && session.user && user && session.user.id === user.id) user = session.user;
      });
    }

    async function start() {
      let data = null;
      try { ({ data } = await client.auth.getSession()); } catch (e) { data = null; }
      user = data && data.session ? data.session.user : null;
      if (!user) { onStatus({ kind: 'signed-out' }); return; }
      await syncNow();
    }

    async function signIn(email, password) {
      let result;
      signingIn = true;
      try {
        result = await client.auth.signInWithPassword({ email, password });
      } catch (err) {
        return { ok: false, error: (err && err.message) || 'Sign-in failed' };
      } finally {
        signingIn = false;
      }
      const { data, error } = result;
      if (error) return { ok: false, error: error.message || 'Sign-in failed' };
      user = data.user;
      switched = false;
      await syncNow();
      return { ok: true };
    }

    /** Stops syncing on this device only (other devices stay signed in). Everything saved here stays here. */
    async function signOut() {
      user = null;
      switched = false;
      try { await client.auth.signOut({ scope: 'local' }); } catch (e) { /* the local session is gone either way */ }
      signedOut();
    }

    return { start, signIn, signOut, syncNow, isSignedIn: () => !!user, email: () => (user ? user.email : null),
      switchedAccount: () => switched, hasDeviceFamily, restoreDeviceFamily };
  }

  const api = { createSync, stableJson };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PB = Object.assign(root.PB || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
