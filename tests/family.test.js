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

test('mergeFamilies always leaves at least one active child, even if each device removed a different one', () => {
  const T3 = new Date('2026-11-19T17:00:00.000Z');
  const base = FAM.addChild(FAM.emptyFamily(), 'Maya', '🐰', T1, 'kid-b');
  const a = FAM.removeChild(base, 'kid-b', T2);
  const b = FAM.removeChild(base, FAM.FIRST_CHILD_ID, T3);
  for (const merged of [FAM.mergeFamilies(a, b), FAM.mergeFamilies(b, a)]) {
    assert.equal(FAM.isValidFamily(merged), true);
    assert.deepEqual(FAM.activeChildren(merged).map((c) => c.id), ['kid-b']); // most recently created comes back
    assert.equal(typeof FAM.chooseActiveChild(merged, null), 'string');
  }
});

/** A family whose first child has a name and (optionally) one pick. */
function firstNamed(name, withPick = true, at = T1) {
  return FAM.updateChild(FAM.emptyFamily(), FAM.FIRST_CHILD_ID, (c) => {
    const named = PB.setChildName(c, name, at);
    return withPick ? PB.pickActivity(named, '2026-11-19', 'move', 'run', at) : named;
  });
}

test('firstChildConflict: two different, named, used first children', () => {
  assert.deepEqual(FAM.firstChildConflict(firstNamed('Sam'), firstNamed('Maya', true, T2)), { localName: 'Sam', incomingName: 'Maya' });
  // the same name (any case, extra spaces) is the same child
  assert.equal(FAM.firstChildConflict(firstNamed('Sam'), firstNamed('  sam ')), null);
  // a nameless or unused side is just a fresh device: nothing to ask
  assert.equal(FAM.firstChildConflict(firstNamed('Sam'), firstNamed('')), null);
  assert.equal(FAM.firstChildConflict(firstNamed('Sam'), firstNamed('Maya', false)), null);
  assert.equal(FAM.firstChildConflict(firstNamed('Sam', false), firstNamed('Maya')), null);
  assert.equal(FAM.firstChildConflict(FAM.emptyFamily(), firstNamed('Maya')), null);
  // a removed child-1 on either side is not a conflict
  const removed = FAM.removeChild(FAM.addChild(firstNamed('Maya'), 'Leo', '🦁', T1, 'kid-l'), FAM.FIRST_CHILD_ID, T2);
  assert.equal(FAM.firstChildConflict(firstNamed('Sam'), removed), null);
});

test('separateFirstChild re-ids child-1 and keeps everything else, so a merge keeps both children', () => {
  const sam = firstNamed('Sam');
  const maya = FAM.addChild(firstNamed('Maya', true, T2), 'Leo', '🦁', T2, 'kid-l');
  const apart = FAM.separateFirstChild(maya, 'kid-maya');
  assert.deepEqual(apart.children.map((c) => c.id), ['kid-maya', 'kid-l']);
  assert.deepEqual({ ...FAM.getChild(apart, 'kid-maya'), id: FAM.FIRST_CHILD_ID }, FAM.getChild(maya, FAM.FIRST_CHILD_ID));
  assert.equal(FAM.getChild(maya, FAM.FIRST_CHILD_ID).settings.childName, 'Maya'); // input untouched
  const merged = FAM.mergeFamilies(sam, apart);
  assert.deepEqual(FAM.activeChildren(merged).map((c) => c.settings.childName).sort(), ['Leo', 'Maya', 'Sam']);
  assert.equal(FAM.isValidFamily(merged), true);
  assert.match(FAM.separateFirstChild(maya).children[0].id, /^child-./);
  assert.notEqual(FAM.separateFirstChild(maya).children[0].id, FAM.FIRST_CHILD_ID);
});
