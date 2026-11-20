const test = require('node:test');
const assert = require('node:assert/strict');
const PB = require('../store.js');
const IN = require('../insights.js');

const FAMS = [
  { id: 'move', name: 'Move My Body', activities: [
    { id: 'run', label: 'Run' }, { id: 'swim', label: 'Swim' }, { id: 'climb', label: 'Climb' },
  ] },
  { id: 'calm', name: 'Calm My Body', activities: [{ id: 'rest', label: 'Rest' }, { id: 'cuddle', label: 'Cuddle' }] },
  { id: 'chef', name: 'Little Chef', activities: [{ id: 'mix', label: 'Mix' }] },
];
const TODAY = '2026-11-19';

function entry(date, familyId, activityId, { done = true, feeling = 'okay', hour = 10 } = {}) {
  const [y, m, d] = date.split('-').map(Number);
  const iso = new Date(y, m - 1, d, hour).toISOString();
  return { date, familyId, activityId, pickedAt: iso, doneAt: done ? iso : null, feeling: done ? feeling : null, removed: false, updatedAt: iso };
}
const day = (n) => PB.addDays(TODAY, -n);

test('entriesInRange keeps the last N days and drops cleared picks', () => {
  const es = [entry(day(0), 'move', 'run'), entry(day(6), 'move', 'run'), entry(day(7), 'move', 'run'),
    { ...entry(day(1), 'calm', 'rest'), removed: true }];
  assert.equal(IN.entriesInRange(es, TODAY, 7).length, 2);
});

test('activityStats counts picks, done and feelings, most-picked first', () => {
  const es = [entry(day(0), 'move', 'run', { feeling: 'loved' }), entry(day(1), 'move', 'run', { done: false }),
    entry(day(2), 'move', 'swim', { feeling: 'tired' })];
  assert.deepEqual(IN.activityStats(es)[0], { familyId: 'move', activityId: 'run', picks: 2, done: 1, loved: 1, okay: 0, tired: 0 });
  assert.equal(IN.activityStats(es)[1].tired, 1);
});

test('favorites returns the top activities for one family', () => {
  const es = [entry(day(0), 'move', 'swim'), entry(day(1), 'move', 'swim'), entry(day(2), 'move', 'run'), entry(day(3), 'calm', 'rest')];
  assert.deepEqual(IN.favorites(es, 'move', 1).map((s) => s.activityId), ['swim']);
});

test('familyStats reports picks, done and days since last pick (null if never)', () => {
  const es = [entry(day(3), 'move', 'run'), entry(day(1), 'move', 'swim', { done: false })];
  const [move, calm] = IN.familyStats(es, FAMS, TODAY);
  assert.deepEqual(move, { familyId: 'move', picks: 2, done: 1, lastDate: day(1), daysSince: 1 });
  assert.deepEqual(calm, { familyId: 'calm', picks: 0, done: 0, lastDate: null, daysSince: null });
});

test('variety counts tried vs total visible buttons and lists the untried ones', () => {
  const v = IN.variety([entry(day(0), 'move', 'run'), entry(day(1), 'move', 'run')], FAMS);
  assert.equal(v.tried, 1);
  assert.equal(v.total, 6);
  assert.equal(v.notTried.length, 5);
});

test('timeOfDay buckets picks into morning / afternoon / evening (local time)', () => {
  const es = [entry(day(0), 'move', 'run', { hour: 8 }), entry(day(1), 'move', 'run', { hour: 13 }), entry(day(2), 'move', 'run', { hour: 19 })];
  assert.deepEqual(IN.timeOfDay(es), { move: { morning: 1, afternoon: 1, evening: 1 } });
});

test('suggestions: getting-started message until there are 5 picks', () => {
  const s = IN.suggestions([entry(day(0), 'move', 'run')], FAMS, TODAY, 'Arjun');
  assert.equal(s.length, 1);
  assert.equal(s[0].type, 'getting-started');
  assert.match(s[0].text, /Arjun/);
});

test('suggestions: skipped families (at most 2), repeat, dropped and loved, in priority order', () => {
  const es = [];
  for (let i = 0; i < 9; i++) es.push(entry(day(i), 'move', 'run', { feeling: i < 3 ? 'loved' : 'okay' }));
  es.push(entry(day(9), 'move', 'swim'));
  for (let i = 1; i <= 4; i++) es.push(entry(day(i), 'chef', 'mix', { done: i === 1 }));
  es.push(entry(day(0), 'chef', 'mix', { done: false })); // today, may still be finished: ignored by "dropped"
  es.push(entry(day(8), 'calm', 'cuddle', { feeling: 'loved' }));
  const s = IN.suggestions(es, FAMS, TODAY, 'Arjun');
  assert.deepEqual(s.map((x) => x.type), ['skipped', 'repeat', 'dropped', 'loved']);
  assert.equal(s[0].text, 'No Calm My Body for 8 days. Maybe offer Cuddle?');
  assert.equal(s[1].text, 'Arjun picked Run 9 of 10 times in Move My Body lately. Try offering Climb or Swim.');
  assert.equal(s[2].text, "Mix gets picked but often isn't finished (1 of 4). It might need a grown-up's help or a shorter version.");
  assert.equal(s[3].text, 'Arjun loved Run 3 times. Keep it handy for a hard day.');
});

test('suggestions: never-picked family says "yet" and offers an untried button; falls back to "Your child"', () => {
  const es = [];
  for (let i = 0; i < 5; i++) es.push(entry(day(i), 'move', ['run', 'swim', 'climb'][i % 3]));
  for (let i = 0; i < 5; i++) es.push(entry(day(i), 'calm', ['rest', 'cuddle'][i % 2]));
  const s = IN.suggestions(es, FAMS, TODAY, '');
  assert.deepEqual(s, [{ type: 'skipped', text: 'No Little Chef yet. Maybe offer Mix?' }]);
});

test('suggestions: balanced picks give an encouraging all-good message', () => {
  const es = [];
  for (let i = 0; i < 4; i++) for (const [f, a] of [['move', ['run', 'swim', 'climb'][i % 3]], ['calm', ['rest', 'cuddle'][i % 2]], ['chef', 'mix']]) es.push(entry(day(i), f, a));
  const s = IN.suggestions(es, FAMS, TODAY, '');
  assert.deepEqual(s.map((x) => x.type), ['all-good']);
  assert.match(s[0].text, /Your child/);
});
