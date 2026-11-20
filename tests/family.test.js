const test = require('node:test');
const assert = require('node:assert/strict');
const PB = require('../store.js');
const FAM = require('../family.js');

const T1 = new Date('2026-11-19T15:00:00.000Z');
const T2 = new Date('2026-11-19T16:00:00.000Z');

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

test('a new family has exactly one child with the shared first id', () => {
  const f = FAM.emptyFamily();
  assert.equal(f.version, 3);
  assert.deepEqual(FAM.activeChildren(f).map((c) => c.id), [FAM.FIRST_CHILD_ID]);
  assert.equal(FAM.isValidFamily(f), true);
});

test('avatar is a per-child setting with a default, set via setAvatar', () => {
  assert.equal(PB.emptyState().settings.avatar, '🙂');
  const s = PB.setAvatar(PB.emptyState(), ' 🦖 ', T1);
  assert.equal(s.settings.avatar, '🦖');
  assert.equal(PB.setAvatar(s, '   ', T2), s);
});

test('addChild creates a separate child with its own name, avatar, settings and picks', () => {
  let f = FAM.addChild(FAM.emptyFamily(), 'Maya', '🐰', T1, 'kid-b');
  f = FAM.updateChild(f, FAM.FIRST_CHILD_ID, (c) => PB.pickActivity(c, '2026-11-19', 'move', 'run', T1));
  const [a, b] = FAM.activeChildren(f);
  assert.equal(a.id, FAM.FIRST_CHILD_ID);
  assert.deepEqual([b.id, b.settings.childName, b.settings.avatar], ['kid-b', 'Maya', '🐰']);
  assert.equal(PB.activeEntries(a).length, 1);
  assert.equal(PB.activeEntries(b).length, 0);
  assert.equal(FAM.isValidFamily(f), true);
});

test('addChild ignores blank names', () => {
  const f = FAM.emptyFamily();
  assert.equal(FAM.addChild(f, '   ', '🐰', T1, 'x'), f);
});

test('updateChild keeps identity fields and returns the same family when nothing changed', () => {
  const f = FAM.emptyFamily();
  assert.equal(FAM.updateChild(f, FAM.FIRST_CHILD_ID, (c) => c), f);
  assert.equal(FAM.updateChild(f, 'missing', (c) => PB.setChildName(c, 'X', T1)), f);
  const g = FAM.updateChild(f, FAM.FIRST_CHILD_ID, (c) => PB.setChildName(c, 'Arjun', T1));
  const c = FAM.getChild(g, FAM.FIRST_CHILD_ID);
  assert.deepEqual([c.id, c.removed, c.settings.childName], [FAM.FIRST_CHILD_ID, false, 'Arjun']);
});

test('removeChild hides a child (tombstone) but never the last one', () => {
  let f = FAM.addChild(FAM.emptyFamily(), 'Maya', '🐰', T1, 'kid-b');
  f = FAM.removeChild(f, 'kid-b', T2);
  assert.deepEqual(FAM.activeChildren(f).map((c) => c.id), [FAM.FIRST_CHILD_ID]);
  assert.equal(FAM.getChild(f, 'kid-b').removed, true);
  assert.equal(FAM.removeChild(f, FAM.FIRST_CHILD_ID, T2), f);
});

test('chooseActiveChild uses the remembered id if that child is still active, else the first child', () => {
  let f = FAM.addChild(FAM.emptyFamily(), 'Maya', '🐰', T1, 'kid-b');
  assert.equal(FAM.chooseActiveChild(f, 'kid-b'), 'kid-b');
  assert.equal(FAM.chooseActiveChild(f, null), FAM.FIRST_CHILD_ID);
  f = FAM.removeChild(f, 'kid-b', T2);
  assert.equal(FAM.chooseActiveChild(f, 'kid-b'), FAM.FIRST_CHILD_ID);
});

test('upgradeFamily turns an existing single-child save (v1 or v2) into the first child', () => {
  const v2 = PB.pickActivity(PB.setChildName(PB.emptyState(), 'Arjun', T1), '2026-11-19', 'move', 'run', T1);
  delete v2.settings.avatar; // saved before avatars existed
  const f = FAM.upgradeFamily(v2);
  assert.equal(FAM.isValidFamily(f), true);
  const c = FAM.getChild(f, FAM.FIRST_CHILD_ID);
  assert.deepEqual([c.settings.childName, c.settings.avatar, PB.activeEntries(c).length], ['Arjun', '🙂', 1]);
  const v1 = { version: 1, settings: PB.emptyState().settings, entries: [] };
  assert.equal(FAM.isValidFamily(FAM.upgradeFamily(v1)), true);
});

test('loadFamily / saveFamily round-trip; old single-child saves load; junk is set aside', () => {
  const storage = memoryStorage();
  const f = FAM.addChild(FAM.emptyFamily(), 'Maya', '🐰', T1, 'kid-b');
  assert.equal(FAM.saveFamily(storage, f), true);
  assert.deepEqual(FAM.loadFamily(storage).family, f);

  const old = memoryStorage({ [PB.STORAGE_KEY]: JSON.stringify(PB.setChildName(PB.emptyState(), 'Arjun', T1)) });
  const r = FAM.loadFamily(old);
  assert.equal(r.recovered, false);
  assert.equal(FAM.getChild(r.family, FAM.FIRST_CHILD_ID).settings.childName, 'Arjun');

  const junk = memoryStorage({ [PB.STORAGE_KEY]: '{nope' });
  const j = FAM.loadFamily(junk);
  assert.equal(j.recovered, true);
  assert.equal(junk.data[PB.STORAGE_KEY + '.corrupt'], '{nope');
  assert.equal(FAM.loadFamily(null).persistent, false);
});

test('mergeFamilies merges each child by id, keeps children from both sides, and honours newer removals', () => {
  const base = FAM.addChild(FAM.emptyFamily(), 'Maya', '🐰', T1, 'kid-b');
  const ipad = FAM.updateChild(base, FAM.FIRST_CHILD_ID, (c) => PB.pickActivity(c, '2026-11-19', 'move', 'run', T1));
  let phone = FAM.updateChild(base, 'kid-b', (c) => PB.pickActivity(c, '2026-11-19', 'calm', 'rest', T1));
  phone = FAM.addChild(phone, 'Leo', '🦊', T2, 'kid-c');
  const merged = FAM.mergeFamilies(ipad, phone);
  assert.deepEqual(FAM.activeChildren(merged).map((c) => c.id), [FAM.FIRST_CHILD_ID, 'kid-b', 'kid-c']);
  assert.equal(PB.activeEntries(FAM.getChild(merged, FAM.FIRST_CHILD_ID)).length, 1);
  assert.equal(PB.activeEntries(FAM.getChild(merged, 'kid-b')).length, 1);
  assert.deepEqual(FAM.mergeFamilies(phone, ipad), merged);

  const removed = FAM.removeChild(base, 'kid-b', T2);
  assert.equal(FAM.getChild(FAM.mergeFamilies(base, removed), 'kid-b').removed, true);
  assert.equal(FAM.getChild(FAM.mergeFamilies(removed, base), 'kid-b').removed, true);
});

test('family backups round-trip, and old single-child backups import as the first child', () => {
  const f = FAM.addChild(FAM.emptyFamily(), 'Maya', '🐰', T1, 'kid-b');
  const r = FAM.importFamilyBackup(FAM.exportFamilyBackup(f, T2));
  assert.deepEqual(r, { ok: true, family: f });
  const old = PB.exportBackup(PB.setChildName(PB.emptyState(), 'Arjun', T1), T2);
  const o = FAM.importFamilyBackup(old);
  assert.equal(o.ok, true);
  assert.equal(FAM.getChild(o.family, FAM.FIRST_CHILD_ID).settings.childName, 'Arjun');
  assert.equal(FAM.importFamilyBackup('nope').ok, false);
  assert.match(FAM.importFamilyBackup('{"app":"pick-and-bloom","state":{}}').error, /not a Pick&Bloom backup/);
});
