/* Pick&Bloom sync: keeps one Supabase row per account in step with this device by merging the whole family. */
(function (root) {
  'use strict';

  const PB = (typeof module === 'object' && module.exports)
    ? { ...require('./store.js'), ...require('./family.js') } : root.PB;
  const TABLE = 'pickbloom_state';

  /**
   * Nothing here talks to the server unless someone is signed in: start() only reads the session
   * this device already has, and syncNow() does nothing without a signed-in user.
   *
   * @param {object} opts
   * @param opts.client  a Supabase client (or a fake with the same shape)
   * @param opts.getState () => the current local family
   * @param opts.setState (family) => void — replace the local family (the caller saves and re-renders)
   * @param opts.onStatus ({kind:'signed-out'|'syncing'|'synced'|'error', at?, message?}) => void
   */
  function createSync({ client, getState, setState, onStatus }) {
    let user = null;
    let running = null;
    let again = false;

    async function pullMergePush() {
      const me = user;
      onStatus({ kind: 'syncing' });
      try {
        const { data, error } = await client.from(TABLE).select('state').eq('user_id', me.id).maybeSingle();
        if (error) throw error;
        const local = getState();
        const remote = data ? PB.upgradeFamily(data.state) : null;
        const merged = remote && PB.isValidFamily(remote) ? PB.mergeFamilies(local, remote) : local;
        if (user !== me) return; // signed out while we were waiting: don't upload
        const { error: upError } = await client.from(TABLE).upsert({ user_id: me.id, state: merged, updated_at: new Date().toISOString() });
        if (upError) throw upError;
        // Merge again with whatever the child did while we were waiting on the network.
        setState(PB.mergeFamilies(getState(), merged));
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
