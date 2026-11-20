const test = require('node:test');
const assert = require('node:assert/strict');
const PB = require('../store.js');
const FAM = require('../family.js');
const { createSync } = require('../sync.js');

const T1 = new Date('2026-11-19T15:00:00.000Z');
const T2 = new Date('2026-11-19T16:00:00.000Z');
const DAY = '2026-11-19';
const FIRST = FAM.FIRST_CHILD_ID;

/** A family whose first child picked one activity. */
function picked(familyId, activityId, at, family = FAM.emptyFamily()) {
  return FAM.updateChild(family, FIRST, (c) => PB.pickActivity(c, DAY, familyId, activityId, at));
}
const first = (family) => FAM.getChild(family, FIRST);

function fakeClient({ remote = null, signedIn = true, failSelect = false } = {}) {
  const db = { row: remote ? { user_id: 'u1', state: remote } : null, upserts: 0, calls: 0 };
  let session = signedIn ? { user: { id: 'u1', email: 'parent@example.com' } } : null;
  const listeners = [];
  return {
    db,
    signOuts: [],
    expire() { session = null; listeners.forEach((fn) => fn('SIGNED_OUT', null)); },
    auth: {
      async getSession() { return { data: { session } }; },
      async signInWithPassword({ email, password }) {
        if (password !== 'right') return { data: {}, error: { message: 'Invalid login credentials' } };
        session = { user: { id: 'u1', email } };
        return { data: { user: session.user, session }, error: null };
      },
      async signOut(opts) { this.lastSignOut = opts; session = null; return { error: null }; },
      onAuthStateChange(fn) { listeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
    },
    from(table) {
      db.calls += 1;
      assert.equal(table, 'pickbloom_state');
      return {
        select() { return { eq(col, val) { assert.equal(col, 'user_id'); assert.equal(val, 'u1'); return {
          async maybeSingle() {
            if (failSelect) return { data: null, error: { message: 'Failed to fetch' } };
            return { data: db.row ? { state: db.row.state } : null, error: null };
          } }; } }; },
        async upsert(row) { db.upserts += 1; db.row = row; return { error: null }; },
      };
    },
  };
}

function harness(client, local) {
  let state = local;
  const statuses = [];
  const sync = createSync({ client, getState: () => state, setState: (s) => { state = s; }, onStatus: (s) => statuses.push(s) });
  return { sync, statuses, get state() { return state; } };
}

test('start() with a session merges remote into local and uploads the result', async () => {
  const remote = picked('move', 'run', T1);
  const local = picked('calm', 'rest', T2);
  const client = fakeClient({ remote });
  const h = harness(client, local);
  await h.sync.start();
  assert.deepEqual(Object.keys(PB.entriesForDate(first(h.state), DAY)).sort(), ['calm', 'move']);
  assert.deepEqual(client.db.row.state, h.state);
  assert.equal(client.db.row.user_id, 'u1');
  assert.equal(h.statuses.at(-1).kind, 'synced');
  assert.equal(h.sync.email(), 'parent@example.com');
});

test('children added on another device arrive, and children here are uploaded', async () => {
  const remote = FAM.addChild(FAM.emptyFamily(), 'Mia', '🦊', T1, 'child-mia');
  const local = FAM.addChild(picked('move', 'run', T2), 'Leo', '🐻', T2, 'child-leo');
  const client = fakeClient({ remote });
  const h = harness(client, local);
  await h.sync.start();
  assert.deepEqual(FAM.activeChildren(h.state).map((c) => c.id).sort(), ['child-1', 'child-leo', 'child-mia']);
  assert.equal(PB.entriesForDate(first(h.state), DAY).move[0].activityId, 'run');
  assert.deepEqual(client.db.row.state, h.state);
});

test('first sync with no remote row uploads local state', async () => {
  const local = picked('move', 'run', T1);
  const client = fakeClient();
  const h = harness(client, local);
  await h.sync.start();
  assert.deepEqual(client.db.row.state, local);
});

test('an older single-child remote row is upgraded and merged', async () => {
  const remote = PB.pickActivity(PB.emptyState(), DAY, 'move', 'run', T1); // a v2 save, before children existed
  const local = picked('calm', 'rest', T2);
  const client = fakeClient({ remote });
  const h = harness(client, local);
  await h.sync.start();
  assert.deepEqual(Object.keys(PB.entriesForDate(first(h.state), DAY)).sort(), ['calm', 'move']);
  assert.equal(FAM.isValidFamily(client.db.row.state), true);
});

test('signed out: start() reports signed-out and does not touch the server', async () => {
  const client = fakeClient({ signedIn: false });
  const h = harness(client, FAM.emptyFamily());
  await h.sync.start();
  assert.equal(h.statuses.at(-1).kind, 'signed-out');
  await h.sync.syncNow();
  await h.sync.syncNow();
  assert.equal(client.db.calls, 0);
  assert.equal(client.db.upserts, 0);
  assert.equal(h.sync.isSignedIn(), false);
});

test('signIn with a wrong password returns the error; the right one syncs', async () => {
  const client = fakeClient({ signedIn: false });
  const h = harness(client, FAM.emptyFamily());
  await h.sync.start();
  assert.deepEqual(await h.sync.signIn('parent@example.com', 'wrong'), { ok: false, error: 'Invalid login credentials' });
  assert.equal(client.db.calls, 0);
  assert.deepEqual(await h.sync.signIn('parent@example.com', 'right'), { ok: true });
  assert.equal(client.db.upserts, 1);
  await h.sync.signOut();
  assert.equal(h.sync.isSignedIn(), false);
  assert.equal(h.statuses.at(-1).kind, 'signed-out');
  assert.deepEqual(client.auth.lastSignOut, { scope: 'local' }); // other devices stay signed in
});

test('a sign-in that throws (offline) is reported, not thrown', async () => {
  const client = fakeClient({ signedIn: false });
  client.auth.signInWithPassword = async () => { throw new Error('Failed to fetch'); };
  const h = harness(client, FAM.emptyFamily());
  assert.deepEqual(await h.sync.signIn('parent@example.com', 'right'), { ok: false, error: 'Failed to fetch' });
});

test('signing out keeps everything on this device', async () => {
  const local = picked('move', 'run', T1);
  const client = fakeClient();
  const h = harness(client, local);
  await h.sync.start();
  const before = h.state;
  await h.sync.signOut();
  assert.equal(h.state, before);
  assert.equal(PB.entriesForDate(first(h.state), DAY).move[0].activityId, 'run');
});

test('a session that ends on its own stops syncing', async () => {
  const client = fakeClient();
  const h = harness(client, FAM.emptyFamily());
  await h.sync.start();
  const calls = client.db.calls;
  client.expire();
  assert.equal(h.sync.isSignedIn(), false);
  assert.equal(h.statuses.at(-1).kind, 'signed-out');
  await h.sync.syncNow();
  assert.equal(client.db.calls, calls);
});

test('network errors are reported, and local data is kept', async () => {
  const local = picked('move', 'run', T1);
  const client = fakeClient({ failSelect: true });
  const h = harness(client, local);
  await h.sync.start();
  assert.equal(h.statuses.at(-1).kind, 'error');
  assert.equal(h.statuses.at(-1).message, 'Failed to fetch');
  assert.equal(h.state, local);
  assert.equal(client.db.upserts, 0);
});

test('edits made while a sync is in flight are kept', async () => {
  const client = fakeClient();
  let state = FAM.emptyFamily();
  const sync = createSync({ client, getState: () => state, setState: (s) => { state = s; }, onStatus() {} });
  await sync.start();
  const p = sync.syncNow();
  state = picked('move', 'run', T2, state); // child taps during the sync
  await p;
  assert.equal(PB.entriesForDate(first(state), DAY).move[0].activityId, 'run');
});

test('a corrupt remote row is ignored and overwritten by valid local state', async () => {
  const client = fakeClient({ remote: { junk: true } });
  const local = picked('move', 'run', T1);
  const h = harness(client, local);
  await h.sync.start();
  assert.deepEqual(client.db.row.state, local);
});

// ---------- the first child on a device joining an account ----------
function named(name, at) {
  return FAM.updateChild(FAM.emptyFamily(), FIRST, (c) => PB.pickActivity(PB.setChildName(c, name, at), DAY, 'move', 'run', at));
}
function memoryStorage() {
  const data = {};
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}
function conflictHarness(answer, { storage = memoryStorage() } = {}) {
  const client = fakeClient({ remote: named('Sam', T1) }); // the account already holds the iPad's Sam
  let state = named('Maya', T2);                           // this laptop was set up separately for Maya
  const asked = [];
  const infos = [];
  const sync = createSync({
    client, storage, getState: () => state,
    setState: (s, info) => { state = s; infos.push(info); return true; },
    onStatus() {},
    onFirstChildConflict: async (c) => { asked.push(c); return answer; },
  });
  return { client, sync, asked, infos, storage, get state() { return state; } };
}

test('first sync on a new device: "same child" combines the two first children', async () => {
  const h = conflictHarness(true);
  await h.sync.start();
  assert.deepEqual(h.asked, [{ localName: 'Maya', incomingName: 'Sam' }]);
  assert.deepEqual(FAM.activeChildren(h.state).map((c) => c.id), [FIRST]);
  assert.equal(first(h.state).settings.childName, 'Maya'); // newer name wins, as with any setting
  assert.deepEqual(h.infos.at(-1), {});
  assert.equal(h.storage.data['pickbloom.syncLinked'], 'u1');
});

test('first sync on a new device: "different children" keeps both, and this device\'s child gets the new id', async () => {
  const h = conflictHarness(false);
  await h.sync.start();
  assert.equal(h.asked.length, 1);
  const kids = FAM.activeChildren(h.state);
  assert.deepEqual(kids.map((c) => c.settings.childName).sort(), ['Maya', 'Sam']);
  assert.equal(first(h.state).settings.childName, 'Sam'); // the account's child-1 keeps its id on every device
  const maya = kids.find((c) => c.settings.childName === 'Maya');
  assert.notEqual(maya.id, FIRST);
  assert.equal(PB.entriesForDate(maya, DAY).move[0].activityId, 'run');
  assert.deepEqual(h.infos.at(-1), { renamed: { from: FIRST, to: maya.id } });
  assert.deepEqual(h.client.db.row.state, h.state);
  // later syncs don't ask again and don't split anything further
  await h.sync.syncNow();
  assert.equal(h.asked.length, 1);
  assert.equal(FAM.activeChildren(h.state).length, 2);
});

test('the question is asked once per account per device (remembered in storage)', async () => {
  const storage = memoryStorage();
  storage.setItem('pickbloom.syncLinked', 'u1');
  const h = conflictHarness(false, { storage });
  await h.sync.start();
  assert.equal(h.asked.length, 0);
  assert.deepEqual(FAM.activeChildren(h.state).map((c) => c.id), [FIRST]);
});

test('no question when the first children have the same name, and none by default', async () => {
  const client = fakeClient({ remote: named('sam', T1) });
  let asked = 0;
  let state = named('Sam ', T2);
  const sync = createSync({ client, getState: () => state, setState: (s) => { state = s; }, onStatus() {}, onFirstChildConflict: () => { asked += 1; return false; } });
  await sync.start();
  assert.equal(asked, 0);
  // without a callback, a conflict is treated as the same child (the old behavior)
  const c2 = fakeClient({ remote: named('Sam', T1) });
  let s2 = named('Maya', T2);
  await createSync({ client: c2, getState: () => s2, setState: (s) => { s2 = s; }, onStatus() {} }).start();
  assert.deepEqual(FAM.activeChildren(s2).map((c) => c.id), [FIRST]);
});

test('if the app refuses the synced family, the status is an error (not "synced")', async () => {
  const client = fakeClient({ remote: picked('move', 'run', T1) });
  const statuses = [];
  let state = picked('calm', 'rest', T2);
  const sync = createSync({ client, getState: () => state, setState: () => false, onStatus: (s) => statuses.push(s) });
  await sync.start();
  assert.equal(statuses.at(-1).kind, 'error');
});

// ---------- a different account on the same device ----------
/** A fake server holding one row per user, and a client that can sign in as any of them. */
function multiAccountClient(rows = {}) {
  const db = { rows: { ...rows }, upserts: [] };
  let session = null;
  return {
    db,
    auth: {
      async getSession() { return { data: { session } }; },
      async signInWithPassword({ email }) {
        const id = email.split('@')[0];
        session = { user: { id, email } };
        return { data: { user: session.user, session }, error: null };
      },
      async signOut() { session = null; return { error: null }; },
    },
    from() {
      return {
        select() { return { eq(col, id) { return { async maybeSingle() { return { data: db.rows[id] ? { state: db.rows[id] } : null, error: null }; } }; } }; },
        async upsert(row) { db.upserts.push(row.user_id); db.rows[row.user_id] = row.state; return { error: null }; },
      };
    },
  };
}
const kidNames = (f) => FAM.activeChildren(f).map((c) => c.settings.childName || c.id).sort();
function accountHarness(client, local) {
  const storage = memoryStorage();
  storage.removeItem = (k) => { delete storage.data[k]; };
  let state = local;
  const infos = [];
  const sync = createSync({ client, storage, getState: () => state, setState: (s, info) => { state = s; infos.push(info); return true; }, onStatus() {} });
  return { sync, storage, infos, get state() { return state; }, set state(s) { state = s; } };
}

test('signing in as a different account never uploads the first account\'s children; they are kept aside', async () => {
  const bFamily = FAM.addChild(FAM.emptyFamily(), 'Bea', '🦊', T1, 'kid-bea');
  const client = multiAccountClient({ u2: bFamily });
  const h = accountHarness(client, FAM.addChild(named('Sam', T1), 'Mia', '🐰', T1, 'kid-mia'));
  await h.sync.signIn('u1@example.com', 'x');
  assert.deepEqual(kidNames(client.db.rows.u1), ['Mia', 'Sam']);
  h.state = picked('calm', 'rest', T2, h.state); // Sam plays while signed in as u1...
  await h.sync.signOut();
  h.state = FAM.updateChild(h.state, FIRST, (c) => PB.pickActivity(c, DAY, 'play', 'tag', T2)); // ...and signed out
  await h.sync.signIn('u2@example.com', 'x');
  assert.deepEqual(kidNames(client.db.rows.u2), ['Bea', 'child-1']); // none of u1's children
  assert.deepEqual(kidNames(h.state), ['Bea', 'child-1']);
  assert.equal(h.sync.switchedAccount(), true);
  assert.deepEqual(h.infos.at(-1), { switched: true });
  assert.equal(h.storage.data['pickbloom.syncLinked'], 'u2');
  const aside = JSON.parse(h.storage.data['pickbloom.v1.account-u1']);
  assert.deepEqual(kidNames(aside), ['Mia', 'Sam']);
  assert.deepEqual(Object.keys(PB.entriesForDate(FAM.getChild(aside, FIRST), DAY)).sort(), ['calm', 'move', 'play']);
  assert.ok(!JSON.stringify(client.db.rows.u2).includes('Sam'));
});

test('when the first account signs in again, its kept-aside family comes back, merged with its row', async () => {
  const client = multiAccountClient({ u2: FAM.emptyFamily() });
  const h = accountHarness(client, named('Sam', T1));
  await h.sync.signIn('u1@example.com', 'x');
  await h.sync.signOut();
  h.state = picked('calm', 'rest', T2, h.state);     // picked on this device while signed out
  await h.sync.signIn('u2@example.com', 'x');
  await h.sync.signOut();
  // meanwhile, another of u1's devices added Leo
  client.db.rows.u1 = FAM.addChild(client.db.rows.u1, 'Leo', '🦁', T2, 'kid-leo');
  await h.sync.signIn('u1@example.com', 'x');
  assert.deepEqual(kidNames(h.state), ['Leo', 'Sam']);
  assert.deepEqual(Object.keys(PB.entriesForDate(first(h.state), DAY)).sort(), ['calm', 'move']);
  assert.deepEqual(kidNames(client.db.rows.u1), ['Leo', 'Sam']);
  assert.equal(h.storage.data['pickbloom.v1.account-u1'], undefined); // restored, so no longer kept aside
  assert.deepEqual(kidNames(JSON.parse(h.storage.data['pickbloom.v1.account-u2'])), ['child-1']);
  assert.equal(h.storage.data['pickbloom.syncLinked'], 'u1');
});

test('the same account signing in again merges as usual', async () => {
  const client = multiAccountClient();
  const h = accountHarness(client, named('Sam', T1));
  await h.sync.signIn('u1@example.com', 'x');
  await h.sync.signOut();
  h.state = picked('calm', 'rest', T2, h.state);
  await h.sync.signIn('u1@example.com', 'x');
  assert.equal(h.sync.switchedAccount(), false);
  assert.deepEqual(Object.keys(PB.entriesForDate(first(client.db.rows.u1), DAY)).sort(), ['calm', 'move']);
  assert.equal(Object.keys(h.storage.data).some((k) => k.startsWith('pickbloom.v1.account-')), false);
});

test('a sync with nothing new makes no upload', async () => {
  const client = fakeClient({ remote: picked('move', 'run', T1) });
  const h = harness(client, picked('move', 'run', T1));
  await h.sync.start();
  assert.equal(client.db.upserts, 0); // identical to the server's copy
  const c2 = fakeClient({ remote: picked('move', 'run', T1) });
  const h2 = harness(c2, picked('calm', 'rest', T2));
  await h2.sync.start();
  assert.equal(c2.db.upserts, 1);
  await h2.sync.syncNow();
  await h2.sync.syncNow();
  assert.equal(c2.db.upserts, 1);
  assert.equal(h2.statuses.at(-1).kind, 'synced');
});

test('signed in in another tab: this tab starts syncing too (after the callback)', async () => {
  const client = fakeClient({ signedIn: false });
  let fire;
  client.auth.onAuthStateChange = (fn) => { fire = fn; return { data: { subscription: { unsubscribe() {} } } }; };
  const h = harness(client, picked('move', 'run', T1));
  await h.sync.start();
  fire('SIGNED_IN', { user: { id: 'u1', email: 'parent@example.com' } });
  assert.equal(client.db.calls, 0); // nothing inside the callback itself
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(h.sync.isSignedIn(), true);
  assert.equal(client.db.upserts, 1);
});
