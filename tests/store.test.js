const test = require('node:test');
const assert = require('node:assert/strict');
const PB = require('../store.js');

const T1 = new Date('2026-11-19T15:00:00.000Z');
const T2 = new Date('2026-11-19T16:00:00.000Z');
const BASE = [
  { id: 'move', name: 'Move My Body', color: '#000000', light: '#ffffff', activities: [
    { id: 'run', label: 'Run', emoji: '🏃' }, { id: 'swim', label: 'Swim', emoji: '🏊' },
  ] },
  { id: 'calm', name: 'Calm My Body', color: '#000000', light: '#ffffff', activities: [
    { id: 'rest', label: 'Rest', emoji: '😌' },
  ] },
];

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

const brokenStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};

// --- dates
test('dateKey formats local dates; addDays and daysBetween work across months', () => {
  assert.equal(PB.dateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(PB.addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(PB.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(PB.daysBetween('2026-11-10', '2026-11-19'), 9);
});

// --- storage
test('loadState returns an empty, persistent state when nothing is saved', () => {
  const r = PB.loadState(memoryStorage());
  assert.deepEqual(r.state, PB.emptyState());
  assert.equal(r.persistent, true);
  assert.equal(r.recovered, false);
});

test('saveState then loadState round-trips', () => {
  const storage = memoryStorage();
  const s = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  assert.equal(PB.saveState(storage, s), true);
  assert.deepEqual(PB.loadState(storage).state, s);
});

test('loadState marks state non-persistent when storage is missing or throws', () => {
  assert.equal(PB.loadState(null).persistent, false);
  assert.equal(PB.loadState(brokenStorage).persistent, false);
  assert.equal(PB.saveState(brokenStorage, PB.emptyState()), false);
});

test('corrupt saved data is set aside and the app starts fresh', () => {
  const storage = memoryStorage({ [PB.STORAGE_KEY]: '{not json' });
  const r = PB.loadState(storage);
  assert.equal(r.recovered, true);
  assert.deepEqual(r.state, PB.emptyState());
  assert.equal(storage.data[PB.STORAGE_KEY + '.corrupt'], '{not json');
});

test('valid JSON with the wrong shape is also treated as corrupt', () => {
  const storage = memoryStorage({ [PB.STORAGE_KEY]: JSON.stringify({ version: 1, entries: 'nope' }) });
  assert.equal(PB.loadState(storage).recovered, true);
});

// --- picks (a child may pick one or more activities per family per day)
test('pickActivity adds picks; several per family are allowed; picking the same one twice is a no-op', () => {
  let s = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  s = PB.pickActivity(s, '2026-11-19', 'move', 'swim', T2);
  assert.equal(PB.pickActivity(s, '2026-11-19', 'move', 'run', T2), s);
  assert.deepEqual(s.entries, [
    { date: '2026-11-19', familyId: 'move', activityId: 'run', pickedAt: T1.toISOString(), doneAt: null, feeling: null, removed: false, updatedAt: T1.toISOString() },
    { date: '2026-11-19', familyId: 'move', activityId: 'swim', pickedAt: T2.toISOString(), doneAt: null, feeling: null, removed: false, updatedAt: T2.toISOString() },
  ]);
});

test('markDone records the feeling for one activity; a done pick cannot be unpicked or re-done', () => {
  let s = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  s = PB.pickActivity(s, '2026-11-19', 'move', 'swim', T1);
  s = PB.markDone(s, '2026-11-19', 'move', 'run', 'loved', T2);
  const today = PB.entriesForDate(s, '2026-11-19').move;
  assert.deepEqual(today.map((e) => [e.activityId, e.doneAt, e.feeling]), [['run', T2.toISOString(), 'loved'], ['swim', null, null]]);
  assert.equal(PB.unpickActivity(s, '2026-11-19', 'move', 'run', T2), s);
  assert.equal(PB.markDone(s, '2026-11-19', 'move', 'run', 'okay', T2), s);
  assert.equal(PB.pickActivity(s, '2026-11-19', 'move', 'run', T2), s);
});

test('markDone rejects unknown feelings and ignores activities that are not picked', () => {
  const s = PB.emptyState();
  assert.throws(() => PB.markDone(s, '2026-11-19', 'move', 'run', 'grumpy', T1), /Unknown feeling/);
  assert.equal(PB.markDone(s, '2026-11-19', 'move', 'run', 'okay', T1), s);
});

test('unpickActivity keeps a tombstone (removed: true) that entriesForDate ignores; picking again revives it', () => {
  let s = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  s = PB.unpickActivity(s, '2026-11-19', 'move', 'run', T2);
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].removed, true);
  assert.equal(s.entries[0].updatedAt, T2.toISOString());
  assert.deepEqual(PB.entriesForDate(s, '2026-11-19'), {});
  assert.deepEqual(PB.activeEntries(s), []);
  assert.equal(PB.markDone(s, '2026-11-19', 'move', 'run', 'okay', T2), s);
  s = PB.pickActivity(s, '2026-11-19', 'move', 'run', T2);
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].removed, false);
});

test('entriesForDate maps familyId to that day\'s picks, oldest pick first', () => {
  let s = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'swim', T2);
  s = PB.pickActivity(s, '2026-11-19', 'move', 'run', T1);
  s = PB.pickActivity(s, '2026-11-18', 'calm', 'rest', T1);
  const today = PB.entriesForDate(s, '2026-11-19');
  assert.deepEqual(Object.keys(today), ['move']);
  assert.deepEqual(today.move.map((e) => e.activityId), ['run', 'swim']);
});

test('upgradeState turns v1 saves (one pick per family, null = cleared) into v2', () => {
  const v1 = { version: 1, settings: PB.emptyState().settings, entries: [
    { date: '2026-11-18', familyId: 'move', activityId: 'run', pickedAt: T1.toISOString(), doneAt: T1.toISOString(), feeling: 'loved', updatedAt: T1.toISOString() },
    { date: '2026-11-18', familyId: 'calm', activityId: null, pickedAt: T1.toISOString(), doneAt: null, feeling: null, updatedAt: T1.toISOString() },
  ] };
  const up = PB.upgradeState(v1);
  assert.equal(PB.isValidState(up), true);
  assert.deepEqual(up.entries.map((e) => [e.familyId, e.removed]), [['move', false]]);
  const storage = memoryStorage({ [PB.STORAGE_KEY]: JSON.stringify(v1) });
  assert.equal(PB.loadState(storage).recovered, false);
  assert.equal(PB.importBackup(JSON.stringify({ app: 'pick-and-bloom', state: v1 })).ok, true);
});

// --- settings
test('setChildName trims and caps length; setReadAloud stores a boolean; both bump updatedAt', () => {
  let s = PB.setChildName(PB.emptyState(), '   Arjun   ', T1);
  assert.equal(s.settings.childName, 'Arjun');
  assert.equal(s.settings.updatedAt, T1.toISOString());
  assert.equal(PB.setChildName(s, 'x'.repeat(50), T1).settings.childName.length, 30);
  assert.equal(PB.setReadAloud(s, false, T2).settings.readAloud, false);
});

test('visibleFamilies hides hidden families and hidden activities; toggling twice restores', () => {
  let s = PB.toggleFamilyHidden(PB.emptyState(), 'calm', T1);
  s = PB.toggleActivityHidden(s, 'move', 'swim', T1);
  const vis = PB.visibleFamilies(BASE, s);
  assert.deepEqual(vis.map((f) => f.id), ['move']);
  assert.deepEqual(vis[0].activities.map((a) => a.id), ['run']);
  s = PB.toggleFamilyHidden(s, 'calm', T2);
  s = PB.toggleActivityHidden(s, 'move', 'swim', T2);
  assert.equal(PB.visibleFamilies(BASE, s).length, 2);
});

test('addCustomActivity adds a uniquely-id\'d button and ignores blank labels', () => {
  let s = PB.addCustomActivity(PB.emptyState(), BASE, 'move', '  Trampoline ', '', T1);
  s = PB.addCustomActivity(s, BASE, 'move', 'Trampoline', '🤸', T1);
  assert.deepEqual(s.settings.customActivities, [
    { familyId: 'move', id: 'custom-trampoline', label: 'Trampoline', emoji: '⭐' },
    { familyId: 'move', id: 'custom-trampoline-2', label: 'Trampoline', emoji: '🤸' },
  ]);
  assert.equal(PB.addCustomActivity(s, BASE, 'move', '   ', '🤸', T1), s);
  assert.equal(PB.addCustomActivity(s, BASE, 'nope', 'X', '🤸', T1), s);
  const move = PB.familiesWithSettings(BASE, s)[0];
  assert.deepEqual(move.activities.map((a) => [a.id, a.custom, a.hidden]), [
    ['run', false, false], ['swim', false, false],
    ['custom-trampoline', true, false], ['custom-trampoline-2', true, false],
  ]);
});

test('findActivity falls back gracefully for unknown ids', () => {
  assert.equal(PB.findActivity(BASE, 'move', 'run').label, 'Run');
  assert.deepEqual(PB.findActivity(BASE, 'move', 'gone'), { id: 'gone', label: 'gone', emoji: '⭐' });
});

// --- backup
test('exportBackup / importBackup round-trip', () => {
  const s = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  const r = PB.importBackup(PB.exportBackup(s, T2));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state, s);
});

test('importBackup rejects junk with a friendly error', () => {
  assert.equal(PB.importBackup('not json').ok, false);
  assert.match(PB.importBackup('{"app":"pick-and-bloom","state":{}}').error, /not a Pick&Bloom backup/);
});

// --- merge (sync)
test('mergeStates keeps picks from both sides and prefers done, then newer, per activity', () => {
  const ipad = PB.markDone(PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1), '2026-11-19', 'move', 'run', 'loved', T1);
  let laptop = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T2); // newer but not done
  laptop = PB.pickActivity(laptop, '2026-11-19', 'move', 'swim', T1);
  laptop = PB.pickActivity(laptop, '2026-11-19', 'calm', 'rest', T1);
  const merged = PB.mergeStates(laptop, ipad);
  const today = PB.entriesForDate(merged, '2026-11-19');
  assert.deepEqual(today.move.map((e) => [e.activityId, e.feeling]), [['run', 'loved'], ['swim', null]]);
  assert.equal(today.calm[0].activityId, 'rest');
  assert.deepEqual(PB.mergeStates(ipad, laptop).entries, merged.entries);
});

test('mergeStates: a newer unpick beats an older pick; newer settings win', () => {
  const picked = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  const unpicked = PB.unpickActivity(picked, '2026-11-19', 'move', 'run', T2);
  assert.deepEqual(PB.entriesForDate(PB.mergeStates(picked, unpicked), '2026-11-19'), {});
  const named = PB.setChildName(PB.emptyState(), 'Arjun', T2);
  const old = PB.setChildName(PB.emptyState(), 'Old', T1);
  assert.equal(PB.mergeStates(old, named).settings.childName, 'Arjun');
  assert.equal(PB.mergeStates(named, old).settings.childName, 'Arjun');
});

// --- grown-up corrections and button editing
test('removePick (grown-up) takes away a pick even after it was done; the child can pick it again fresh', () => {
  let s = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  s = PB.markDone(s, '2026-11-19', 'move', 'run', 'loved', T1);
  s = PB.removePick(s, '2026-11-19', 'move', 'run', T2);
  assert.deepEqual(PB.entriesForDate(s, '2026-11-19'), {});
  assert.equal(s.entries[0].removed, true);
  assert.equal(PB.removePick(s, '2026-11-19', 'move', 'run', T2), s);
  assert.equal(PB.removePick(s, '2026-11-19', 'move', 'swim', T2), s);
  const T3 = new Date('2026-11-19T17:00:00.000Z');
  s = PB.pickActivity(s, '2026-11-19', 'move', 'run', T3);
  assert.deepEqual(PB.entriesForDate(s, '2026-11-19').move.map((e) => [e.activityId, e.doneAt]), [['run', null]]);
});

test('mergeStates: a stale plain pick never undoes a finished one, but grown-up removals and later re-picks win', () => {
  const T3 = new Date('2026-11-19T17:00:00.000Z');
  const done = PB.markDone(PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1), '2026-11-19', 'move', 'run', 'loved', T1);
  const stalePick = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T2);
  assert.equal(PB.entriesForDate(PB.mergeStates(stalePick, done), '2026-11-19').move[0].feeling, 'loved');
  const removed = PB.removePick(done, '2026-11-19', 'move', 'run', T2);
  assert.deepEqual(PB.entriesForDate(PB.mergeStates(done, removed), '2026-11-19'), {});
  assert.deepEqual(PB.entriesForDate(PB.mergeStates(removed, done), '2026-11-19'), {});
  const repicked = PB.pickActivity(removed, '2026-11-19', 'move', 'run', T3);
  const merged = PB.entriesForDate(PB.mergeStates(removed, repicked), '2026-11-19');
  assert.deepEqual(merged.move.map((e) => [e.activityId, e.doneAt]), [['run', null]]);
});

test('renameActivity changes the name and emoji of built-in and custom buttons; resetActivity undoes it', () => {
  let s = PB.renameActivity(PB.emptyState(), BASE, 'move', 'run', '  Zoom Run ', '🏎️', T1);
  s = PB.addCustomActivity(s, BASE, 'move', 'Kite', '🪁', T1);
  s = PB.renameActivity(s, BASE, 'move', 'custom-kite', 'Big Kite', '', T1); // blank emoji keeps the current one
  const move = PB.visibleFamilies(BASE, s)[0];
  assert.deepEqual(move.activities.map((a) => [a.id, a.label, a.emoji, a.renamed]), [
    ['run', 'Zoom Run', '🏎️', true], ['swim', 'Swim', '🏊', false], ['custom-kite', 'Big Kite', '🪁', true],
  ]);
  assert.equal(PB.renameActivity(s, BASE, 'move', 'run', '   ', '🏎️', T2), s);
  assert.equal(PB.renameActivity(s, BASE, 'move', 'nope', 'X', '', T2), s);
  s = PB.resetActivity(s, 'move', 'run', T2);
  assert.equal(PB.visibleFamilies(BASE, s)[0].activities[0].label, 'Run');
  assert.equal(s.settings.updatedAt, T2.toISOString());
});

test('upgradeState fills in settings added after a save was made (activityOverrides)', () => {
  const s = PB.emptyState();
  delete s.settings.activityOverrides;
  assert.equal(PB.isValidState(s), false);
  assert.equal(PB.isValidState(PB.upgradeState(s)), true);
  const storage = memoryStorage({ [PB.STORAGE_KEY]: JSON.stringify(s) });
  assert.equal(PB.loadState(storage).recovered, false);
});

test('reward symbol: five choices, flower by default; setReward ignores unknown ids', () => {
  assert.deepEqual(PB.REWARDS.map((r) => r.id), ['flower', 'star', 'sun', 'candy', 'balloon']);
  for (const r of PB.REWARDS) assert.ok(r.emoji && r.one && r.many, r.id);
  assert.equal(PB.emptyState().settings.reward, 'flower');
  let s = PB.setReward(PB.emptyState(), 'candy', T1);
  assert.equal(s.settings.reward, 'candy');
  assert.equal(s.settings.updatedAt, T1.toISOString());
  assert.equal(PB.setReward(s, 'unicorn', T2), s);
  assert.equal(PB.rewardOf(s).many, 'candies');
  assert.equal(PB.rewardOf({ settings: { reward: 'gone' } }).id, 'flower');
});

test('upgradeState fills in a missing reward setting with flower', () => {
  const s = PB.emptyState();
  delete s.settings.reward;
  assert.equal(PB.isValidState(s), false);
  assert.equal(PB.upgradeState(s).settings.reward, 'flower');
  const bad = PB.emptyState();
  bad.settings.reward = 'unicorn';
  assert.equal(PB.isValidState(bad), false);
});


test('mergeStates keeps grown-up-added buttons and renames from both sides even when the other settings are newer', () => {
  let laptop = PB.addCustomActivity(PB.emptyState(), BASE, 'move', 'Kite', '🪁', T1);
  laptop = PB.renameActivity(laptop, BASE, 'move', 'run', 'Zoom', '🏎️', T1);
  let ipad = PB.addCustomActivity(PB.emptyState(), BASE, 'calm', 'Hug', '🤗', T1);
  ipad = PB.setChildName(ipad, 'Arjun', T2); // newer settings
  for (const merged of [PB.mergeStates(laptop, ipad), PB.mergeStates(ipad, laptop)]) {
    assert.equal(merged.settings.childName, 'Arjun');
    assert.deepEqual(merged.settings.customActivities.map((a) => a.id).sort(), ['custom-hug', 'custom-kite']);
    assert.equal(merged.settings.activityOverrides['move/run'].label, 'Zoom');
    assert.equal(PB.isValidState(merged), true);
  }
});

// --- families a grown-up adds, renames and removes
test('addCustomFamily adds a family with a unique id and a palette color; blank names are ignored', () => {
  let s = PB.emptyState();
  assert.equal(PB.addCustomFamily(s, BASE, '   ', 'blue', T1), s);
  s = PB.addCustomFamily(s, BASE, 'Kind Hands', 'blue', T1);
  s = PB.addCustomFamily(s, BASE, 'Kind Hands', 'nope', T2); // unknown color falls back to the palette
  const fams = PB.familiesWithSettings(BASE, s);
  assert.deepEqual(fams.map((f) => f.id), ['move', 'calm', 'custom-kind-hands', 'custom-kind-hands-2']);
  const added = fams[2];
  assert.equal(added.name, 'Kind Hands');
  assert.equal(added.custom, true);
  assert.equal(added.color, '#1f6aa5');
  assert.deepEqual(added.activities, []);
  assert.equal(fams[0].custom, false);
  assert.ok(PB.isValidState(s));
});

test('a new family takes buttons, can be picked and finished, renamed, reset and hidden', () => {
  let s = PB.addCustomFamily(PB.emptyState(), BASE, 'Kind Hands', 'pink', T1);
  s = PB.addCustomActivity(s, BASE, 'custom-kind-hands', 'Hug', '🤗', T1);
  const fam = PB.visibleFamilies(BASE, s).find((f) => f.id === 'custom-kind-hands');
  assert.deepEqual(fam.activities.map((a) => a.label), ['Hug']);
  const act = fam.activities[0].id;
  s = PB.pickActivity(s, '2026-11-19', 'custom-kind-hands', act, T1);
  s = PB.markDone(s, '2026-11-19', 'custom-kind-hands', act, 'loved', T2);
  assert.equal(PB.rewardTotal(s.entries), 1);

  s = PB.renameFamily(s, BASE, 'custom-kind-hands', '  Helping  ', T2);
  s = PB.renameFamily(s, BASE, 'move', 'Wiggle', T2);
  assert.equal(PB.renameFamily(s, BASE, 'nope', 'X', T2), s);
  assert.equal(PB.renameFamily(s, BASE, 'move', '  ', T2), s);
  let fams = PB.familiesWithSettings(BASE, s);
  assert.equal(fams.find((f) => f.id === 'custom-kind-hands').name, 'Helping');
  assert.equal(fams.find((f) => f.id === 'move').name, 'Wiggle');
  assert.equal(fams.find((f) => f.id === 'move').renamed, true);
  s = PB.resetFamily(s, 'move', T2);
  assert.equal(PB.familiesWithSettings(BASE, s).find((f) => f.id === 'move').name, 'Move My Body');

  s = PB.toggleFamilyHidden(s, 'custom-kind-hands', T2);
  assert.ok(!PB.visibleFamilies(BASE, s).some((f) => f.id === 'custom-kind-hands'));
  assert.equal(PB.rewardTotal(s.entries), 1, 'hiding a family keeps what was earned');
  assert.ok(PB.isValidState(s));
});

test('a custom family id never collides with a built-in one', () => {
  const base = [...BASE, { id: 'custom-art', name: 'Art', color: '#000000', light: '#ffffff', activities: [] }];
  const s = PB.addCustomFamily(PB.emptyState(), base, 'Art', 'green', T1);
  assert.equal(s.settings.customFamilies[0].id, 'custom-art-2');
});

// --- reward counts
test('reward counts: 1 by default, a family count, and a button count that beats its family', () => {
  let s = PB.emptyState();
  assert.equal(PB.pointsFor(s, 'move', 'run'), 1);
  s = PB.setRewardPoints(s, 'move', 2, T1);
  s = PB.setRewardPoints(s, 'move/swim', 3, T1);
  assert.equal(PB.pointsFor(s, 'move', 'run'), 2);
  assert.equal(PB.pointsFor(s, 'move', 'swim'), 3);
  assert.equal(PB.pointsFor(s, 'calm', 'rest'), 1);
  const move = PB.familiesWithSettings(BASE, s).find((f) => f.id === 'move');
  assert.equal(move.points, 2);
  assert.deepEqual(move.activities.map((a) => [a.id, a.points, a.ownPoints]), [['run', 2, false], ['swim', 3, true]]);
  // invalid counts are ignored; null clears back to the family
  assert.equal(PB.setRewardPoints(s, 'move', 0, T2), s);
  assert.equal(PB.setRewardPoints(s, 'move', 6, T2), s);
  assert.equal(PB.setRewardPoints(s, 'move', 1.5, T2), s);
  s = PB.setRewardPoints(s, 'move/swim', null, T2);
  assert.equal(PB.pointsFor(s, 'move', 'swim'), 2);
  assert.ok(PB.isValidState(s));
});

test('finishing keeps the count it earned, even if a grown-up changes the count later', () => {
  let s = PB.setRewardPoints(PB.emptyState(), 'move/run', 3, T1);
  s = PB.pickActivity(s, '2026-11-19', 'move', 'run', T1);
  s = PB.pickActivity(s, '2026-11-19', 'calm', 'rest', T1);
  s = PB.markDone(s, '2026-11-19', 'move', 'run', 'loved', T2);
  s = PB.markDone(s, '2026-11-19', 'calm', 'rest', 'okay', T2);
  assert.equal(PB.rewardTotal(s.entries), 4);
  s = PB.setRewardPoints(s, 'move/run', 1, T2);
  assert.equal(PB.rewardTotal(s.entries), 4, 'earned stays earned');
  s = PB.removePick(s, '2026-11-19', 'move', 'run', T2);
  assert.equal(PB.rewardTotal(s.entries), 1, 'a grown-up removal takes its rewards away');
});

test('entries saved before counts existed earn 1, and a bad count makes a save invalid', () => {
  const entry = { date: '2026-11-19', familyId: 'move', activityId: 'run', pickedAt: T1.toISOString(),
    doneAt: T2.toISOString(), feeling: 'okay', removed: false, updatedAt: T2.toISOString() };
  const s = { ...PB.emptyState(), entries: [entry] };
  assert.ok(PB.isValidState(s));
  assert.equal(PB.entryPoints(entry), 1);
  assert.equal(PB.rewardTotal(s.entries), 1);
  assert.equal(PB.isValidState({ ...s, entries: [{ ...entry, points: 9 }] }), false);
  const badSettings = { ...s, settings: { ...s.settings, rewardPoints: { move: 'lots' } } };
  assert.equal(PB.isValidState(badSettings), false);
  const badColor = { ...s, settings: { ...s.settings, customFamilies: [{ id: 'custom-x', name: 'X', color: 'red;}', light: '#ffffff' }] } };
  assert.equal(PB.isValidState(badColor), false);
});

test('upgradeState fills in customFamilies, familyOverrides and rewardPoints for older saves', () => {
  const s = PB.emptyState();
  const old = { ...s, settings: { ...s.settings } };
  delete old.settings.customFamilies;
  delete old.settings.familyOverrides;
  delete old.settings.rewardPoints;
  assert.equal(PB.isValidState(old), false);
  const up = PB.upgradeState(old);
  assert.ok(PB.isValidState(up));
  assert.deepEqual([up.settings.customFamilies, up.settings.familyOverrides, up.settings.rewardPoints], [[], {}, {}]);
});

test('mergeStates keeps families added on either device; reward counts follow the newer settings', () => {
  let a = PB.addCustomFamily(PB.emptyState(), BASE, 'Kind Hands', 'pink', T1);
  a = PB.setRewardPoints(a, 'move', 3, T1);
  let b = PB.addCustomFamily(PB.emptyState(), BASE, 'Music', 'blue', T2);
  b = PB.renameFamily(b, BASE, 'calm', 'Quiet', T2);
  const m = PB.mergeStates(a, b);
  assert.deepEqual(m.settings.customFamilies.map((f) => f.id).sort(), ['custom-kind-hands', 'custom-music']);
  assert.equal(m.settings.familyOverrides.calm.name, 'Quiet');
  assert.deepEqual(m.settings.rewardPoints, {}, 'b is newer, so its counts win');
  assert.ok(PB.isValidState(m));
  // points on entries survive merging
  let c = PB.setRewardPoints(PB.emptyState(), 'move', 2, T1);
  c = PB.markDone(PB.pickActivity(c, '2026-11-19', 'move', 'run', T1), '2026-11-19', 'move', 'run', 'loved', T2);
  assert.equal(PB.rewardTotal(PB.mergeStates(PB.emptyState(), c).entries), 2);
});
