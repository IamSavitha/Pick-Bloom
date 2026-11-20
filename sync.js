/* Pick&Bloom sync: keeps one Supabase row per account in step with this device by merging the whole family. */
(function (root) {
  'use strict';

  const PB = (typeof module === 'object' && module.exports)
    ? { ...require('./store.js'), ...require('./family.js') } : root.PB;
  const TABLE = 'pickbloom_state';
  const LINKED_KEY = 'pickbloom.syncLinked'; // which account this device has already joined (asked once)

  /**
   * Nothing here talks to the server unless someone is signed in: start() only reads the session
   * this device already has, and syncNow() does nothing without a signed-in user.
   *
   * @param {object} opts
   * @param opts.client  a Supabase client (or a fake with the same shape)
   * @param opts.getState () => the current local family
   * @param opts.setState (family, info?) => boolean|void — replace the local family (the caller saves and re-renders).
   *        info.renamed = { from, to } when this device's first child was given a new id (see below).
   * @param opts.onStatus ({kind:'signed-out'|'syncing'|'synced'|'error', at?, message?}) => void
   * @param opts.onFirstChildConflict ({localName, incomingName}) => boolean|Promise<boolean>
   *        asked once per account per device, when this device's first child and the account's first child look
   *        like different children. true = the same child (combine them), false = different children (keep both).
   * @param opts.storage optional localStorage-like store that remembers which account this device has joined
   */
  function createSync({ client, getState, setState, onStatus, onFirstChildConflict = () => true, storage = null }) {
    let user = null;
    let running = null;
    let again = false;
    let linkedInMemory = null;

    function isLinked(id) {
      try { if (storage && storage.getItem(LINKED_KEY) === id) return true; } catch (e) { /* use memory */ }
      return linkedInMemory === id;
    }
    function markLinked(id) {
      linkedInMemory = id;
      try { if (storage) storage.setItem(LINKED_KEY, id); } catch (e) { /* memory is enough for now */ }
    }

    async function pullMergePush() {
      const me = user;
      onStatus({ kind: 'syncing' });
      try {
        const { data, error } = await client.from(TABLE).select('state').eq('user_id', me.id).maybeSingle();
        if (error) throw error;
        const upgraded = data ? PB.upgradeFamily(data.state) : null;
        const remote = upgraded && PB.isValidFamily(upgraded) ? upgraded : null;
        // Joining this account for the first time on this device: is our first child the account's first child?
        // If not, this device's child gets a new id, so the account's other devices keep theirs.
        let renamed = null;
        if (remote && !isLinked(me.id)) {
          const conflict = PB.firstChildConflict(getState(), remote);
          if (conflict && !(await onFirstChildConflict(conflict))) renamed = { from: PB.FIRST_CHILD_ID, to: PB.newChildId() };
        }
        if (user !== me) return; // signed out while we were waiting: don't upload
        const ours = (f) => (renamed ? PB.separateFirstChild(f, renamed.to) : f);
        const local = ours(getState());
        const merged = remote ? PB.mergeFamilies(local, remote) : local;
        if (!PB.isValidFamily(merged)) throw new Error("this device's progress couldn't be combined with the synced copy");
        const { error: upError } = await client.from(TABLE).upsert({ user_id: me.id, state: merged, updated_at: new Date().toISOString() });
        if (upError) throw upError;
        markLinked(me.id);
        // Merge again with whatever the child did while we were waiting on the network.
        const kept = setState(PB.mergeFamilies(ours(getState()), merged), renamed ? { renamed } : {});
        if (kept === false) throw new Error("the synced copy couldn't be shown on this device");
        if (user === me) onStatus({ kind: 'synced', at: new Date() });
      } catch (err) {
        if (user === me) onStatus({ kind: 'error', message: (err && err.message) || 'Sync failed' });
      }
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
        else if (session && session.user && user && session.user.id === user.id) user = session.user;
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
      try {
        result = await client.auth.signInWithPassword({ email, password });
      } catch (err) {
        return { ok: false, error: (err && err.message) || 'Sign-in failed' };
      }
      const { data, error } = result;
      if (error) return { ok: false, error: error.message || 'Sign-in failed' };
      user = data.user;
      await syncNow();
      return { ok: true };
    }

    /** Stops syncing on this device only (other devices stay signed in). Everything saved here stays here. */
    async function signOut() {
      user = null;
      try { await client.auth.signOut({ scope: 'local' }); } catch (e) { /* the local session is gone either way */ }
      signedOut();
    }

    return { start, signIn, signOut, syncNow, isSignedIn: () => !!user, email: () => (user ? user.email : null) };
  }

  const api = { createSync };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PB = Object.assign(root.PB || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
