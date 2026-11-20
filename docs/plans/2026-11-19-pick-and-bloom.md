# Pick&Bloom v1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `development/reference/executing-plans-guide.md` to implement this plan task-by-task.

**Goal:** Build a simple, local-first web app. A child picks one activity per family each day and grows a garden, while grown-ups see his choice patterns and suggestions. It works on laptop, phone and iPad, with optional Supabase sync.

**Architecture:** Plain static files with no build step. Each logic file is a classic script that exposes a `PB` global in the browser and `module.exports` in Node, so the same file is tested with `node --test`. `app.js` renders the UI with vanilla DOM code. Data lives in `localStorage` and syncs to one Supabase row per account by combining (merging) both copies.

**Tech Stack:**
- HTML, CSS and vanilla JS (ES2020).
- Node 24 `node:test`, with no npm dependencies.
- Supabase JS v2 (UMD from jsDelivr), optional.
- Headless Chrome for screenshots.

**Conventions for every task:**
- Work in `/Users/savithavijayarangan/Desktop/Pick&Bloom` on branch `feat/v1`.
- Commit messages: conventional style (`feat:`, `test:`, `docs:`). **Do NOT add any Co-Authored-By or Claude attribution lines.**
- Run tests with `npm test` (that is, `node --test`). Do not `npm install` anything.
- Never use `innerHTML` with user-entered text (child name, custom labels). Use `textContent`.

> **Amendment (2026-11-19): pick at least one per family, not only one.** The user changed the rule after Tasks 1–4 were built. The code in the repo is now the source of truth for `store.js` and `insights.js`, and the Task 2/3 code blocks below show the original v1 version. What changed:
> - **State:** `version: 2`. Each entry is one *activity* picked on a day: `{date, familyId, activityId, pickedAt, doneAt, feeling, removed, updatedAt}`. There is one entry per (date, family, activity).
> - **API changes:**
>   - `pickActivity(state, date, fam, act)` adds a pick. Picking the same activity again does nothing. Picking it after it was unpicked brings it back.
>   - `unpickActivity(state, date, fam, act)` replaces `clearPick`. It keeps the entry with `removed: true`, and refuses to unpick an activity that's done.
>   - `markDone(state, date, fam, act, feeling)` now takes `act`.
>   - `entriesForDate` returns `familyId → array` of picks, oldest first.
>   - `activeEntries` filters `!removed`.
>   - `upgradeState` turns v1 saves into v2. `loadState` and `importBackup` both call it.
> - **Merge key** is `date|family|activity`. Done beats not done, then the newer `updatedAt` wins.
> - **Task 4 UI follow-up:**
>   - The picker toggles several picks and stays open, with a "Done" button.
>   - Each picked activity on a card has its own "I did it!" and face.
>   - The subheading becomes "Pick at least one from each family".
> - **Task 6:** in `tests/sync.test.js`, the in-flight test asserts `PB.entriesForDate(state, '2026-11-19').move[0].activityId`, because entries are now arrays.

---

### Task 1: Scaffold + activity bank data

**Files:**
- Create: `package.json`, `.gitignore`, `README.md` (short stub), `activities.js`, `tests/activities.test.js`

**Step 1: Create `package.json`**

```json
{
  "name": "pick-and-bloom",
  "version": "1.0.0",
  "private": true,
  "description": "Kids pick one activity per family each day and grow a garden; grown-ups see choice patterns.",
  "scripts": {
    "test": "node --test"
  }
}
```

**Step 2: Create `.gitignore`**

```
.DS_Store
node_modules/
.vercel/
```

**Step 3: Write the failing test `tests/activities.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { FAMILIES } = require('../activities.js');

test('has the 12 families from the activity bank, in PDF order', () => {
  assert.deepEqual(FAMILIES.map((f) => f.id), [
    'move', 'learn', 'create', 'play', 'outdoor', 'friends',
    'calm', 'feelings', 'ican', 'chef', 'imagine', 'bedtime',
  ]);
});

test('activity counts match the PDF', () => {
  assert.deepEqual(FAMILIES.map((f) => f.activities.length), [12, 12, 12, 12, 12, 10, 10, 8, 10, 10, 12, 8]);
});

test('every family has a name and two hex colors', () => {
  for (const f of FAMILIES) {
    assert.ok(f.name.length > 0, f.id);
    assert.match(f.color, /^#[0-9a-f]{6}$/i, f.id);
    assert.match(f.light, /^#[0-9a-f]{6}$/i, f.id);
  }
});

test('activity ids are unique within a family and every activity has a label and emoji', () => {
  for (const f of FAMILIES) {
    const ids = f.activities.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length, f.id);
    for (const a of f.activities) {
      assert.match(a.id, /^[a-z0-9-]+$/, `${f.id}/${a.id}`);
      assert.ok(a.label.length > 0 && a.emoji.length > 0, `${f.id}/${a.id}`);
    }
  }
});
```

**Step 4: Run it and confirm it fails:** `npm test`. Expected: FAIL (`Cannot find module '../activities.js'`).

**Step 5: Create `activities.js`**

```js
/* Pick&Bloom activity bank: the 12 families from "Pick One!" (Kids_Pick_One_Activity_Button_Bank.pdf). */
(function (root) {
  'use strict';

  function a(id, label, emoji) { return { id, label, emoji }; }

  const FAMILIES = [
    { id: 'move', name: 'Move My Body', color: '#2a7a46', light: '#e0f4e4', activities: [
      a('run', 'Run', '🏃'), a('jump', 'Jump', '🦘'), a('walk', 'Walk', '🚶'),
      a('bike', 'Bike', '🚲'), a('scooter', 'Scooter', '🛴'), a('swim', 'Swim', '🏊'),
      a('soccer', 'Soccer', '⚽'), a('dance', 'Dance', '💃'), a('climb', 'Climb', '🧗'),
      a('stretch', 'Stretch', '🙆'), a('yoga', 'Yoga', '🧘'), a('obstacle-course', 'Obstacle Course', '🚧'),
    ] },
    { id: 'learn', name: 'Learn & Think', color: '#2b67a8', light: '#ddeefc', activities: [
      a('read', 'Read', '📖'), a('write', 'Write', '✏️'), a('count', 'Count', '🔢'),
      a('phonics', 'Phonics', '🔤'), a('puzzle', 'Puzzle', '🧩'), a('maze', 'Maze', '🌀'),
      a('lego', 'Lego', '🧱'), a('science', 'Science', '🔬'), a('memory-game', 'Memory Game', '🃏'),
      a('i-spy', 'I Spy', '🔍'), a('storytelling', 'Storytelling', '🗣️'), a('build', 'Build', '🏗️'),
    ] },
    { id: 'create', name: 'Create', color: '#7650a8', light: '#efe2fb', activities: [
      a('draw', 'Draw', '🖍️'), a('color', 'Color', '🎨'), a('paint', 'Paint', '🖌️'),
      a('play-doh', 'Play-Doh', '🤲'), a('craft', 'Craft', '✂️'), a('sing', 'Sing', '🎤'),
      a('dance', 'Dance', '🕺'), a('act', 'Act', '🎭'), a('puppet-show', 'Puppet Show', '🧦'),
      a('make-music', 'Make Music', '🥁'), a('build', 'Build', '🏰'), a('make-a-story', 'Make a Story', '📝'),
    ] },
    { id: 'play', name: 'Play', color: '#a86a00', light: '#fdefcf', activities: [
      a('hide-and-seek', 'Hide & Seek', '🙈'), a('tag', 'Tag', '👉'), a('bubbles', 'Bubbles', '🫧'),
      a('balloon-play', 'Balloon Play', '🎈'), a('board-game', 'Board Game', '🎲'), a('card-game', 'Card Game', '🃏'),
      a('toys', 'Toys', '🧸'), a('cars', 'Cars', '🚗'), a('superhero', 'Superhero', '🦸'),
      a('dinosaurs', 'Dinosaurs', '🦖'), a('treasure-hunt', 'Treasure Hunt', '🗺️'), a('pretend-play', 'Pretend Play', '👑'),
    ] },
    { id: 'outdoor', name: 'Outdoor Adventure', color: '#4f7d2c', light: '#e3f3da', activities: [
      a('cycle', 'Cycle', '🚴'), a('scooter', 'Scooter', '🛴'), a('playground', 'Playground', '🛝'),
      a('nature-walk', 'Nature Walk', '🌳'), a('hike', 'Hike', '🥾'), a('garden', 'Garden', '🌱'),
      a('bug-hunt', 'Bug Hunt', '🐞'), a('bird-watch', 'Bird Watch', '🐦'), a('leaf-hunt', 'Leaf Hunt', '🍂'),
      a('rock-hunt', 'Rock Hunt', '🪨'), a('ball-play', 'Ball Play', '🏀'), a('picnic', 'Picnic', '🧺'),
    ] },
    { id: 'friends', name: 'Friendship', color: '#a8436a', light: '#fde0e8', activities: [
      a('play-with-friend', 'Play with Friend', '👫'), a('build-together', 'Build Together', '🧱'), a('team-game', 'Team Game', '🏅'),
      a('take-turns', 'Take Turns', '🔄'), a('share', 'Share', '🍪'), a('help-someone', 'Help Someone', '🙋'),
      a('invite-a-friend', 'Invite a Friend', '💌'), a('compliment', 'Compliment', '🌟'), a('gentle-play', 'Gentle Play', '🕊️'),
      a('game-together', 'Game Together', '🎯'),
    ] },
    { id: 'calm', name: 'Calm My Body', color: '#237a73', light: '#dcf5f1', activities: [
      a('deep-breaths', 'Deep Breaths', '🌬️'), a('yoga', 'Yoga', '🧘'), a('stretch', 'Stretch', '🙆'),
      a('quiet-reading', 'Quiet Reading', '📚'), a('color', 'Color', '🖍️'), a('puzzle', 'Puzzle', '🧩'),
      a('calm-music', 'Calm Music', '🎶'), a('watch-clouds', 'Watch Clouds', '☁️'), a('cuddle', 'Cuddle', '🤗'),
      a('rest', 'Rest', '😌'),
    ] },
    { id: 'feelings', name: 'Feelings', color: '#a5532e', light: '#fde4da', activities: [
      a('name-my-feeling', 'Name My Feeling', '🏷️'), a('emotion-charades', 'Emotion Charades', '🎭'), a('teddys-problem', "Teddy's Problem", '🧸'),
      a('stop-breathe-choose', 'Stop-Breathe-Choose', '🛑'), a('talk-about-my-day', 'Talk About My Day', '💬'), a('say-sorry', 'Say Sorry', '💗'),
      a('use-words', 'Use Words', '🗨️'), a('proud-moment', 'Proud Moment', '🏆'),
    ] },
    { id: 'ican', name: 'I Can Do It', color: '#9a7212', light: '#fdf1d6', activities: [
      a('make-bed', 'Make Bed', '🛏️'), a('clean-toys', 'Clean Toys', '🧹'), a('organize-books', 'Organize Books', '📚'),
      a('water-plants', 'Water Plants', '🪴'), a('help-laundry', 'Help Laundry', '🧺'), a('set-table', 'Set Table', '🍽️'),
      a('organize-shoes', 'Organize Shoes', '👟'), a('carry-plate', 'Carry Plate', '🍛'), a('pack-bag', 'Pack Bag', '🎒'),
      a('brush-teeth', 'Brush Teeth', '🪥'),
    ] },
    { id: 'chef', name: 'Little Chef', color: '#a95d24', light: '#fde3cf', activities: [
      a('wash-fruit', 'Wash Fruit', '🍎'), a('peel-banana', 'Peel Banana', '🍌'), a('mix', 'Mix', '🥣'),
      a('pour', 'Pour', '🫗'), a('measure', 'Measure', '🥄'), a('make-sandwich', 'Make Sandwich', '🥪'),
      a('fruit-bowl', 'Fruit Bowl', '🍇'), a('smoothie', 'Smoothie', '🥤'), a('set-table', 'Set Table', '🍴'),
      a('clean-up', 'Clean Up', '🧽'),
    ] },
    { id: 'imagine', name: 'Imagination World', color: '#5a4aa5', light: '#e6e1fb', activities: [
      a('doctor', 'Doctor', '🩺'), a('chef', 'Chef', '🧑‍🍳'), a('teacher', 'Teacher', '🧑‍🏫'),
      a('firefighter', 'Firefighter', '🚒'), a('astronaut', 'Astronaut', '🚀'), a('scientist', 'Scientist', '🧪'),
      a('superhero', 'Superhero', '🦸'), a('dinosaur-explorer', 'Dinosaur Explorer', '🦕'), a('shopkeeper', 'Shopkeeper', '🏪'),
      a('mechanic', 'Mechanic', '🔧'), a('vet', 'Vet', '🐶'), a('camping', 'Camping', '⛺'),
    ] },
    { id: 'bedtime', name: 'Quiet & Bedtime', color: '#445f9c', light: '#e1e8f7', activities: [
      a('read-a-book', 'Read a Book', '📖'), a('made-up-story', 'Made-Up Story', '🌙'), a('lullaby', 'Lullaby', '🎵'),
      a('cuddle', 'Cuddle', '🤗'), a('slow-breaths', 'Slow Breaths', '🌬️'), a('happy-memory', 'Happy Memory', '💭'),
      a('gratitude', 'Gratitude', '🙏'), a('best-part-of-day', 'Best Part of Day', '⭐'),
    ] },
  ];

  const api = { FAMILIES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PB = Object.assign(root.PB || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

**Step 6: Run the tests and confirm they pass:** `npm test`. Expected: 4 pass.

**Step 7: Create a short stub `README.md`**

````markdown
# Pick&Bloom

A simple app where a child picks one activity from each family every day and grows a flower garden, while grown-ups see the child's choice patterns. It works on laptop, phone and iPad.

Run tests: `npm test`
````

**Step 8: Commit**

```bash
git add package.json .gitignore README.md activities.js tests/activities.test.js
git commit -m "feat: scaffold project and activity bank data"
```

---

### Task 2: Data model (`store.js`)

**Files:**
- Create: `store.js`, `tests/store.test.js`

**Step 1: Write the failing tests `tests/store.test.js`**

```js
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

// --- picks
test('pickActivity records one pick per family per day and can be changed', () => {
  let s = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  s = PB.pickActivity(s, '2026-11-19', 'move', 'swim', T2);
  assert.equal(s.entries.length, 1);
  assert.deepEqual(s.entries[0], {
    date: '2026-11-19', familyId: 'move', activityId: 'swim',
    pickedAt: T2.toISOString(), doneAt: null, feeling: null, updatedAt: T2.toISOString(),
  });
});

test('markDone records the feeling; a done pick cannot be changed or cleared', () => {
  let s = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  s = PB.markDone(s, '2026-11-19', 'move', 'loved', T2);
  assert.equal(s.entries[0].doneAt, T2.toISOString());
  assert.equal(s.entries[0].feeling, 'loved');
  assert.equal(PB.pickActivity(s, '2026-11-19', 'move', 'swim', T2), s);
  assert.equal(PB.clearPick(s, '2026-11-19', 'move', T2), s);
  assert.equal(PB.markDone(s, '2026-11-19', 'move', 'okay', T2), s);
});

test('markDone rejects unknown feelings and ignores families with no pick', () => {
  const s = PB.emptyState();
  assert.throws(() => PB.markDone(s, '2026-11-19', 'move', 'grumpy', T1), /Unknown feeling/);
  assert.equal(PB.markDone(s, '2026-11-19', 'move', 'okay', T1), s);
});

test('clearPick keeps a tombstone (activityId null) that entriesForDate ignores', () => {
  let s = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  s = PB.clearPick(s, '2026-11-19', 'move', T2);
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].activityId, null);
  assert.equal(s.entries[0].updatedAt, T2.toISOString());
  assert.deepEqual(PB.entriesForDate(s, '2026-11-19'), {});
  assert.deepEqual(PB.activeEntries(s), []);
});

test('entriesForDate maps familyId to that day\'s entry', () => {
  let s = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  s = PB.pickActivity(s, '2026-11-18', 'calm', 'rest', T1);
  assert.deepEqual(Object.keys(PB.entriesForDate(s, '2026-11-19')), ['move']);
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
test('mergeStates keeps entries from both sides and prefers done, then newer', () => {
  const ipad = PB.markDone(PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1), '2026-11-19', 'move', 'loved', T1);
  let laptop = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'swim', T2); // newer but not done
  laptop = PB.pickActivity(laptop, '2026-11-19', 'calm', 'rest', T1);
  const merged = PB.mergeStates(laptop, ipad);
  const today = PB.entriesForDate(merged, '2026-11-19');
  assert.equal(today.move.activityId, 'run');
  assert.equal(today.calm.activityId, 'rest');
  assert.deepEqual(PB.mergeStates(ipad, laptop).entries, merged.entries);
});

test('mergeStates: a newer clear beats an older pick; newer settings win', () => {
  const picked = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  const cleared = PB.clearPick(picked, '2026-11-19', 'move', T2);
  assert.deepEqual(PB.entriesForDate(PB.mergeStates(picked, cleared), '2026-11-19'), {});
  const named = PB.setChildName(PB.emptyState(), 'Arjun', T2);
  const old = PB.setChildName(PB.emptyState(), 'Old', T1);
  assert.equal(PB.mergeStates(old, named).settings.childName, 'Arjun');
  assert.equal(PB.mergeStates(named, old).settings.childName, 'Arjun');
});
```

**Step 2: Run them and confirm they fail:** `npm test`. Expected: FAIL (`Cannot find module '../store.js'`).

**Step 3: Create `store.js`**

```js
/* Pick&Bloom data model: state shape, storage, picks, settings, backup and merge (for sync). */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'pickbloom.v1';
  const FEELINGS = ['loved', 'okay', 'tired'];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const EPOCH = '1970-01-01T00:00:00.000Z';
  const MAX_NAME = 30;
  const MAX_LABEL = 24;

  // ---------- dates (local calendar days as "YYYY-MM-DD") ----------
  function pad(n) { return String(n).padStart(2, '0'); }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(key, n) { const d = parseKey(key); d.setDate(d.getDate() + n); return dateKey(d); }
  function daysBetween(fromKey, toKey) { return Math.round((parseKey(toKey) - parseKey(fromKey)) / 86400000); }

  // ---------- shape ----------
  function defaultSettings() {
    return { childName: '', readAloud: true, hiddenFamilies: [], hiddenActivities: [], customActivities: [], updatedAt: EPOCH };
  }
  function emptyState() { return { version: 1, settings: defaultSettings(), entries: [] }; }

  const isString = (x) => typeof x === 'string';
  const isStringArray = (x) => Array.isArray(x) && x.every(isString);
  const isObject = (x) => !!x && typeof x === 'object';

  function isValidEntry(e) {
    return isObject(e) && isString(e.date) && DATE_RE.test(e.date) && isString(e.familyId)
      && (e.activityId === null || isString(e.activityId)) && isString(e.pickedAt)
      && (e.doneAt === null || isString(e.doneAt)) && (e.feeling === null || FEELINGS.includes(e.feeling))
      && isString(e.updatedAt);
  }
  function isValidCustom(a) {
    return isObject(a) && isString(a.familyId) && isString(a.id) && isString(a.label) && isString(a.emoji);
  }
  function isValidSettings(s) {
    return isObject(s) && isString(s.childName) && typeof s.readAloud === 'boolean'
      && isStringArray(s.hiddenFamilies) && isStringArray(s.hiddenActivities)
      && Array.isArray(s.customActivities) && s.customActivities.every(isValidCustom) && isString(s.updatedAt);
  }
  function isValidState(s) {
    return isObject(s) && s.version === 1 && isValidSettings(s.settings)
      && Array.isArray(s.entries) && s.entries.every(isValidEntry);
  }

  // ---------- storage ----------
  function storageWorks(storage) {
    if (!storage) return false;
    try {
      storage.setItem(STORAGE_KEY + '.probe', '1');
      storage.removeItem(STORAGE_KEY + '.probe');
      return true;
    } catch (e) { return false; }
  }

  function loadState(storage) {
    if (!storageWorks(storage)) return { state: emptyState(), persistent: false, recovered: false };
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { state: emptyState(), persistent: true, recovered: false };
    try {
      const parsed = JSON.parse(raw);
      if (isValidState(parsed)) return { state: parsed, persistent: true, recovered: false };
    } catch (e) { /* fall through to recovery */ }
    try { storage.setItem(STORAGE_KEY + '.corrupt', raw); } catch (e) { /* best effort */ }
    return { state: emptyState(), persistent: true, recovered: true };
  }

  function saveState(storage, state) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }

  // ---------- picks ----------
  function findEntry(state, date, familyId) {
    return state.entries.find((e) => e.date === date && e.familyId === familyId) || null;
  }
  function putEntry(state, entry) {
    const others = state.entries.filter((e) => !(e.date === entry.date && e.familyId === entry.familyId));
    return { ...state, entries: [...others, entry] };
  }

  function pickActivity(state, date, familyId, activityId, now = new Date()) {
    const existing = findEntry(state, date, familyId);
    if (existing && existing.doneAt) return state;
    const iso = now.toISOString();
    return putEntry(state, { date, familyId, activityId, pickedAt: iso, doneAt: null, feeling: null, updatedAt: iso });
  }

  function clearPick(state, date, familyId, now = new Date()) {
    const existing = findEntry(state, date, familyId);
    if (!existing || existing.doneAt || existing.activityId === null) return state;
    return putEntry(state, { ...existing, activityId: null, updatedAt: now.toISOString() });
  }

  function markDone(state, date, familyId, feeling, now = new Date()) {
    if (!FEELINGS.includes(feeling)) throw new Error('Unknown feeling: ' + feeling);
    const existing = findEntry(state, date, familyId);
    if (!existing || existing.doneAt || existing.activityId === null) return state;
    const iso = now.toISOString();
    return putEntry(state, { ...existing, doneAt: iso, feeling, updatedAt: iso });
  }

  function activeEntries(state) { return state.entries.filter((e) => e.activityId !== null); }

  function entriesForDate(state, date) {
    const out = {};
    for (const e of activeEntries(state)) if (e.date === date) out[e.familyId] = e;
    return out;
  }

  // ---------- settings ----------
  function updateSettings(state, patch, now = new Date()) {
    return { ...state, settings: { ...state.settings, ...patch, updatedAt: now.toISOString() } };
  }
  function toggleIn(list, item) { return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]; }
  function activityKey(familyId, activityId) { return familyId + '/' + activityId; }
  function slugify(text) { return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; }

  function setChildName(state, name, now) {
    return updateSettings(state, { childName: String(name).trim().slice(0, MAX_NAME) }, now);
  }
  function setReadAloud(state, on, now) { return updateSettings(state, { readAloud: !!on }, now); }
  function toggleFamilyHidden(state, familyId, now) {
    return updateSettings(state, { hiddenFamilies: toggleIn(state.settings.hiddenFamilies, familyId) }, now);
  }
  function toggleActivityHidden(state, familyId, activityId, now) {
    const key = activityKey(familyId, activityId);
    return updateSettings(state, { hiddenActivities: toggleIn(state.settings.hiddenActivities, key) }, now);
  }

  function addCustomActivity(state, baseFamilies, familyId, label, emoji, now) {
    const clean = String(label).trim().slice(0, MAX_LABEL);
    const family = baseFamilies.find((f) => f.id === familyId);
    if (!clean || !family) return state;
    const taken = new Set([
      ...family.activities.map((x) => x.id),
      ...state.settings.customActivities.filter((x) => x.familyId === familyId).map((x) => x.id),
    ]);
    const base = 'custom-' + slugify(clean);
    let id = base;
    for (let n = 2; taken.has(id); n++) id = base + '-' + n;
    const custom = { familyId, id, label: clean, emoji: String(emoji || '').trim() || '⭐' };
    return updateSettings(state, { customActivities: [...state.settings.customActivities, custom] }, now);
  }

  /** All families with custom buttons merged in, each family/activity flagged `hidden`. */
  function familiesWithSettings(baseFamilies, state) {
    const s = state.settings;
    return baseFamilies.map((f) => {
      const customs = s.customActivities.filter((x) => x.familyId === f.id)
        .map((x) => ({ id: x.id, label: x.label, emoji: x.emoji, custom: true }));
      const activities = [...f.activities, ...customs].map((x) => ({
        custom: false, ...x, hidden: s.hiddenActivities.includes(activityKey(f.id, x.id)),
      }));
      return { ...f, hidden: s.hiddenFamilies.includes(f.id), activities };
    });
  }

  /** Only what the child should see. */
  function visibleFamilies(baseFamilies, state) {
    return familiesWithSettings(baseFamilies, state)
      .filter((f) => !f.hidden)
      .map((f) => ({ ...f, activities: f.activities.filter((x) => !x.hidden) }));
  }

  function findActivity(families, familyId, activityId) {
    const family = families.find((f) => f.id === familyId);
    const activity = family && family.activities.find((x) => x.id === activityId);
    return activity || { id: activityId, label: activityId, emoji: '⭐' };
  }

  // ---------- backup ----------
  function exportBackup(state, now = new Date()) {
    return JSON.stringify({ app: 'pick-and-bloom', exportedAt: now.toISOString(), state }, null, 2);
  }

  function importBackup(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) {
      return { ok: false, error: 'This file is not a Pick&Bloom backup (it is not valid JSON).' };
    }
    const candidate = parsed && parsed.app === 'pick-and-bloom' ? parsed.state : parsed;
    if (!isValidState(candidate)) return { ok: false, error: 'This file is not a Pick&Bloom backup, or it is damaged.' };
    return { ok: true, state: candidate };
  }

  // ---------- merge (used by sync and restore) ----------
  function preferredEntry(a, b) {
    if (a.doneAt && !b.doneAt) return a;
    if (b.doneAt && !a.doneAt) return b;
    return b.updatedAt > a.updatedAt ? b : a;
  }

  /** Combine two states without losing information. Order of arguments does not matter for entries. */
  function mergeStates(local, remote) {
    const byKey = new Map();
    for (const e of [...local.entries, ...remote.entries]) {
      const key = e.date + '|' + e.familyId;
      const prev = byKey.get(key);
      byKey.set(key, prev ? preferredEntry(prev, e) : e);
    }
    const entries = [...byKey.values()].sort((a, b) => (a.date + '|' + a.familyId).localeCompare(b.date + '|' + b.familyId));
    const settings = remote.settings.updatedAt > local.settings.updatedAt ? remote.settings : local.settings;
    return { version: 1, settings, entries };
  }

  const api = {
    STORAGE_KEY, FEELINGS, dateKey, addDays, daysBetween, emptyState, isValidState, loadState, saveState,
    pickActivity, clearPick, markDone, activeEntries, entriesForDate, activityKey,
    setChildName, setReadAloud, toggleFamilyHidden, toggleActivityHidden, addCustomActivity,
    familiesWithSettings, visibleFamilies, findActivity, exportBackup, importBackup, mergeStates,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PB = Object.assign(root.PB || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

> Note for the implementer: in the `mergeStates` "prefers done" test, the two `preferredEntry` calls must give the same entries in both argument orders. When both entries are done, or both not done, and they have equal `updatedAt`, the first one seen wins. That's fine, because the test entries have different timestamps.

**Step 4: Run the tests and confirm they pass:** `npm test`. Expected: all pass.

**Step 5: Commit:** `git add store.js tests/store.test.js && git commit -m "feat: add data model with storage, picks, settings, backup and merge"`

---

### Task 3: Patterns and suggestions (`insights.js`)

**Files:**
- Create: `insights.js`, `tests/insights.test.js`

`insights.js` loads `store.js` helpers through `require('./store.js')` in Node, or `root.PB` in the browser. It must be loaded after `store.js` in `index.html`.

**Step 1: Write the failing tests `tests/insights.test.js`**

```js
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
  return { date, familyId, activityId, pickedAt: iso, doneAt: done ? iso : null, feeling: done ? feeling : null, updatedAt: iso };
}
const day = (n) => PB.addDays(TODAY, -n);

test('entriesInRange keeps the last N days and drops cleared picks', () => {
  const es = [entry(day(0), 'move', 'run'), entry(day(6), 'move', 'run'), entry(day(7), 'move', 'run'),
    { ...entry(day(1), 'calm', 'rest'), activityId: null }];
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
```

> Why `chef/mix` doesn't trigger "repeat" in the balanced test: "repeat" needs at least 2 visible activities in the family to suggest alternatives, and Little Chef here has only one. That's why the rule skips families with no alternatives.

**Step 2: Run them and confirm they fail:** `npm test`. Expected: FAIL (`Cannot find module '../insights.js'`).

**Step 3: Create `insights.js`**

```js
/* Pick&Bloom insights: turns the pick history into patterns and gentle, rule-based suggestions. */
(function (root) {
  'use strict';

  const PB = (typeof module === 'object' && module.exports) ? require('./store.js') : root.PB;

  const WINDOW_DAYS = 14;      // "lately" for repeat / dropped rules
  const SKIP_DAYS = 5;         // a family is "skipped" after this many days without a pick
  const MIN_ENTRIES = 5;       // below this, show a getting-started message
  const REPEAT_MIN_PICKS = 5;
  const REPEAT_SHARE = 0.7;
  const DROPPED_MIN_PICKS = 3;
  const LOVED_MIN = 3;
  const MAX_SKIPPED = 2;
  const MAX_SUGGESTIONS = 5;

  const active = (entries) => entries.filter((e) => e.activityId !== null);

  function entriesInRange(entries, endDate, days) {
    const start = PB.addDays(endDate, -(days - 1));
    return active(entries).filter((e) => e.date >= start && e.date <= endDate);
  }

  function activityStats(entries) {
    const map = new Map();
    for (const e of active(entries)) {
      const key = PB.activityKey(e.familyId, e.activityId);
      const s = map.get(key) || { familyId: e.familyId, activityId: e.activityId, picks: 0, done: 0, loved: 0, okay: 0, tired: 0 };
      s.picks += 1;
      if (e.doneAt) s.done += 1;
      if (e.feeling) s[e.feeling] += 1;
      map.set(key, s);
    }
    return [...map.values()].sort((a, b) => b.picks - a.picks || b.loved - a.loved || a.activityId.localeCompare(b.activityId));
  }

  function favorites(entries, familyId, limit = 3) {
    return activityStats(entries.filter((e) => e.familyId === familyId)).slice(0, limit);
  }

  function familyStats(entries, families, today) {
    const list = active(entries);
    return families.map((f) => {
      const mine = list.filter((e) => e.familyId === f.id);
      const lastDate = mine.reduce((max, e) => (max === null || e.date > max ? e.date : max), null);
      return {
        familyId: f.id,
        picks: mine.length,
        done: mine.filter((e) => e.doneAt).length,
        lastDate,
        daysSince: lastDate === null ? null : PB.daysBetween(lastDate, today),
      };
    });
  }

  function variety(entries, families) {
    const tried = new Set(active(entries).map((e) => PB.activityKey(e.familyId, e.activityId)));
    const all = families.flatMap((f) => f.activities.map((x) => ({ familyId: f.id, activityId: x.id })));
    const notTried = all.filter((x) => !tried.has(PB.activityKey(x.familyId, x.activityId)));
    return { tried: all.length - notTried.length, total: all.length, notTried };
  }

  function partOfDay(iso) {
    const h = new Date(iso).getHours();
    return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  }

  function timeOfDay(entries) {
    const out = {};
    for (const e of active(entries)) {
      const slot = out[e.familyId] || (out[e.familyId] = { morning: 0, afternoon: 0, evening: 0 });
      slot[partOfDay(e.pickedAt)] += 1;
    }
    return out;
  }

  // ---------- suggestions ----------
  function labelIn(family, activityId) {
    const found = family && family.activities.find((x) => x.id === activityId);
    return found ? found.label : null;
  }

  /** What to offer for a family: his most-loved button there, else one he hasn't tried, else the first. */
  function offerFor(family, allStats, triedKeys) {
    const loved = allStats.filter((s) => s.familyId === family.id && s.loved > 0 && labelIn(family, s.activityId))
      .sort((a, b) => b.loved - a.loved)[0];
    if (loved) return labelIn(family, loved.activityId);
    const fresh = family.activities.find((x) => !triedKeys.has(PB.activityKey(family.id, x.id)));
    return (fresh || family.activities[0]).label;
  }

  /**
   * @param entries all entries (any date)
   * @param families visible families (from PB.visibleFamilies)
   * @param today "YYYY-MM-DD"
   * @returns {{type: string, text: string}[]}
   */
  function suggestions(entries, families, today, childName) {
    const name = childName || 'Your child';
    const all = active(entries);
    if (all.length < MIN_ENTRIES) {
      return [{ type: 'getting-started', text: `Ideas show up after a few days of picks. Check back once ${name} has picked at least ${MIN_ENTRIES} activities.` }];
    }
    const withButtons = families.filter((f) => f.activities.length > 0);
    const byId = new Map(withButtons.map((f) => [f.id, f]));
    const recent = entriesInRange(all, today, WINDOW_DAYS);
    const allStats = activityStats(all);
    const triedKeys = new Set(all.map((e) => PB.activityKey(e.familyId, e.activityId)));
    const out = [];

    // 1. Skipped families — longest gap first, at most MAX_SKIPPED.
    const NEVER = Number.MAX_SAFE_INTEGER;
    familyStats(all, withButtons, today)
      .filter((s) => s.daysSince === null || s.daysSince >= SKIP_DAYS)
      .sort((a, b) => (b.daysSince ?? NEVER) - (a.daysSince ?? NEVER))
      .slice(0, MAX_SKIPPED)
      .forEach((s) => {
        const family = byId.get(s.familyId);
        const when = s.daysSince === null ? 'yet' : `for ${s.daysSince} days`;
        out.push({ type: 'skipped', priority: 1, text: `No ${family.name} ${when}. Maybe offer ${offerFor(family, allStats, triedKeys)}?` });
      });

    // 2. Repeat — one button dominates a family lately.
    for (const family of withButtons) {
      const stats = activityStats(recent.filter((e) => e.familyId === family.id));
      const total = stats.reduce((n, s) => n + s.picks, 0);
      if (total < REPEAT_MIN_PICKS || stats[0].picks / total < REPEAT_SHARE) continue;
      const top = stats[0];
      const counts = new Map(stats.map((s) => [s.activityId, s.picks]));
      const alts = family.activities.filter((x) => x.id !== top.activityId)
        .sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0) || a.label.localeCompare(b.label))
        .slice(0, 2).map((x) => x.label);
      const topLabel = labelIn(family, top.activityId);
      if (alts.length === 0 || !topLabel) continue;
      out.push({ type: 'repeat', priority: 2, text: `${name} picked ${topLabel} ${top.picks} of ${total} times in ${family.name} lately. Try offering ${alts.join(' or ')}.` });
    }

    // 3. Dropped — picked often but not finished (today excluded: it may still be finished).
    for (const s of activityStats(recent.filter((e) => e.date < today))) {
      const label = labelIn(byId.get(s.familyId), s.activityId);
      if (!label || s.picks < DROPPED_MIN_PICKS || s.done / s.picks >= 0.5) continue;
      out.push({ type: 'dropped', priority: 3, text: `${label} gets picked but often isn't finished (${s.done} of ${s.picks}). It might need a grown-up's help or a shorter version.` });
    }

    // 4. Loved — rated 😄 several times (all time).
    for (const s of allStats) {
      const label = labelIn(byId.get(s.familyId), s.activityId);
      if (!label || s.loved < LOVED_MIN) continue;
      out.push({ type: 'loved', priority: 4, text: `${name} loved ${label} ${s.loved} times. Keep it handy for a hard day.` });
    }

    if (out.length === 0) {
      return [{ type: 'all-good', text: `Nice balance! ${name} is spreading picks across the families. Keep going.` }];
    }
    return out.sort((a, b) => a.priority - b.priority).slice(0, MAX_SUGGESTIONS).map(({ type, text }) => ({ type, text }));
  }

  const api = { entriesInRange, activityStats, favorites, familyStats, variety, timeOfDay, suggestions };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PB = Object.assign(root.PB || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

> Implementer: check the expected test strings against this code by hand. In the skipped/repeat test:
> - **Calm My Body** was last picked at `day(8)`, so "for 8 days". The loved button there is `cuddle`, so it offers "Cuddle".
> - **Little Chef** was picked today, so it isn't skipped.
> - **Repeat:** Move My Body has 10 picks in the 14-day window (run ×9 plus swim at day 9), so 9 out of 10 is 90%. Its alternatives are sorted by count ascending, then label: Climb (0), then Swim (1).
> - **Dropped:** chef/mix before today has 4 picks and 1 finished.
>
> If an expected string and the code disagree, fix the **code** to match the spec and the test. Don't weaken the test, and report what you changed.

**Step 4: Run the tests and confirm they pass:** `npm test`. Expected: all pass.

**Step 5: Commit:** `git add insights.js tests/insights.test.js && git commit -m "feat: add pattern stats and rule-based suggestions"`

---

### Task 4: Child's screens (Today, picker, "I did it!", My Garden) and responsive shell

**Files:**
- Create: `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180×180)

There are no unit tests for DOM code. Verify with headless Chrome screenshots (Step 6).

**`index.html`**
- `<!doctype html>`, `lang="en"`.
- Head:
  - `<meta charset="utf-8">` and `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
  - `<title>Pick&amp;Bloom</title>` and `<meta name="theme-color" content="#2a7a46">`.
  - Home-screen support:
    - `<link rel="manifest" href="manifest.webmanifest">`
    - `<link rel="icon" href="icon.svg">`
    - `<link rel="apple-touch-icon" href="apple-touch-icon.png">`
    - `<meta name="apple-mobile-web-app-capable" content="yes">` and `<meta name="mobile-web-app-capable" content="yes">`
    - `<meta name="apple-mobile-web-app-title" content="Pick&amp;Bloom">`
  - `<link rel="stylesheet" href="styles.css">`
- Body:
  - `<div id="banner" class="banner" hidden></div>`
  - `<main id="app"></main>`
  - `<nav class="tabs">` with three `<a>` links:
    - `href="#today"`: 🌼 Today
    - `href="#garden"`: 🌷 My Garden
    - `href="#grownups"`: 🔒 Grown-ups
  - Two empty `<dialog>`s: `#picker` and `#feeling`.
- Scripts at the end of body, in this order: `activities.js`, `store.js`, `insights.js`, `app.js`. Use plain `<script src>` tags, not modules, so `file://` works.

**`app.js`** (one IIFE, `'use strict'`)
- **`el(tag, props, ...children)` helper.**
  - `props` may hold `class`, `style` (object; CSS custom properties allowed through `style.setProperty`), `on*` handlers, `aria-*`, `data-*`, `hidden`, `disabled`, `type`.
  - String children become text nodes. Never use `innerHTML` with data. The only exception is `flowerSvg`, which interpolates nothing but the two hex colors from `activities.js`.
- **Storage and state.**
  - Get storage with `let storage = null; try { storage = window.localStorage; } catch (e) {}`.
  - Load with `let { state, persistent, recovered } = PB.loadState(storage)`.
  - `commit(next)`: if `next === state`, return. Otherwise set `state = next`, call `PB.saveState(storage, state)` when `persistent`, call `render()`, then call `afterCommit()`. `afterCommit` is a no-op hook for now; Task 6 uses it for sync.
- **Helpers.**
  - `today()` returns `PB.dateKey(new Date())`.
  - `visible()` returns `PB.visibleFamilies(PB.FAMILIES, state)`.
  - `allFams()` returns `PB.familiesWithSettings(PB.FAMILIES, state)`.
  - `childName()` returns `state.settings.childName`.
  - `triedKeys()` returns a Set of `familyId/activityId` from `PB.activeEntries(state)`.
- **Routing.** The view comes from `location.hash`: `#garden` shows the garden, `#grownups` shows the grown-up view, and anything else shows Today. Re-render on `hashchange`. Set `aria-current="page"` on the active tab link.
- **`render()`**
  - Fill the banner:
    - If `!persistent`: "This browser can't save progress (maybe private browsing). Picks will disappear when this page closes."
    - Else if `recovered`: "Saved progress couldn't be read, so Pick&Bloom started fresh. The old copy was kept on this device."
    - Otherwise set it to hidden.
  - Replace `#app` contents with the current view.
  - Set `document.body.dataset.ready = '1'`.
  - Also re-render on `visibilitychange` when the page becomes visible, so the date rolls over at midnight.
- **Today view**
  - **Heading:** `Hi ${name}!` or "Hi there!".
  - **Subheading:** "Pick one from each family".
  - **Progress line:** `🌸 ${done} of ${visibleCount} flowers today`.
  - **Grid:** a `.families` grid with one `.family-card` per visible family. Set the CSS vars `--fam` (color) and `--fam-light` (light). Each card is a `<div>` containing:
    - **Not picked:** a big `<button class="family-main">` showing the family name and "Tap to pick". Clicking opens the picker.
    - **Picked, not done:** the same main button showing the family name, a big emoji, the label and "tap to change". Clicking reopens the picker. Below it, a separate `<button class="did-it">I did it! ✅</button>` opens the feeling dialog.
    - **Done:** a non-interactive card (class `done`) showing the family name, 🌸 plus the activity emoji and label, and the feeling face (😄/🙂/😴).
  - **Label lookup:** look labels up with `PB.findActivity(allFams(), familyId, activityId)`, so hidden or custom buttons still show.
  - **Empty families:** if a visible family has 0 visible activities, skip its card.
- **Picker dialog (`#picker`)**
  - **Contents:**
    - Title: the family name.
    - A `.activity-grid` of `<button class="activity">` for each visible activity, showing the emoji (large), the label, and a `✨` badge when the activity is not in `triedKeys()`. The badge has `aria-label="new"` / title "Never tried yet".
    - The currently picked one has `aria-pressed="true"` and a highlighted style.
    - Footer: "Clear my pick" (only when there is a pick) and "Close".
  - **Picking an activity:** `speak(label)`, then `commit(PB.pickActivity(state, today(), familyId, id))`, then `dialog.close()`.
  - **Opening:** use `showModal()`. Close on backdrop click.
- **Feeling dialog (`#feeling`)**
  - **Contents:** the title `How was ${emoji} ${label}?` and three big buttons: `😄 Loved it` (`loved`), `🙂 It was okay` (`okay`), `😴 Tired` (`tired`).
  - **Choosing a face:**
    - `speak` the button text.
    - `commit(PB.markDone(...))`, then close.
    - Add the class `bloom` to that family's card after re-rendering. Find the card by `data-family`. The animation is a short CSS scale-and-glow, and is disabled under `prefers-reduced-motion`.
- **`speak(text)`:** only runs if `state.settings.readAloud` is true and `'speechSynthesis' in window`. Call `speechSynthesis.cancel()` first, then speak a `SpeechSynthesisUtterance` with `rate = 0.9`. Wrap it in try/catch.
- **Garden view**
  - **Title:** `${name}'s garden` or "My garden".
  - **"Today" section:**
    - A `.flowers` row with one `.flower` per done entry today: a `flowerSvg(color, light)` with the activity emoji and label below.
    - If there are none: "Your garden is waiting for its first flower! 🌱".
  - **"This week" section:**
    - The 7 days before today, newest first.
    - Each row has a day label (`Yesterday`, then a short weekday plus day, e.g. `Mon 16`) and small flowers for that day's done entries.
    - Empty days show a single `🌱` and never a negative message.
  - **Footer line:** `🌸 ${totalDone} flowers grown so far`.
  - **`flowerSvg(color, light)`:** returns an `<svg viewBox="0 0 60 80" aria-hidden="true">` with:
    - a green stem `#4f7d2c`,
    - 5 petal circles in `color` around (30,30), radius 10 at distance 12,
    - a center circle in `light` with a `color` stroke.
- **Grown-ups view (placeholder for now):** "Grown-up corner — coming next." Task 5 replaces this.
- **Expose for later tasks:** `window.PBApp = { getState: () => state, commit, render, setAfterCommit(fn) { afterCommit = fn; }, registerView(name, fn) }`.
  - `render` calls a registered `grownups` view if there is one, otherwise the placeholder.
  - Task 5 adds `grownups.js`, which calls `PBApp.registerView('grownups', ...)`.
  - Because `app.js` runs `render()` once on load, `registerView` must re-render if the current view is the one being registered.

**`styles.css`**
- **Tokens on `:root`:**
  - `--bg: #fffaf2`, `--ink: #22313f`, `--muted: #5b6b7a`, `--card: #ffffff`, `--radius: 18px`.
  - Font: `ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
  - Use a light theme only. Set `body { background: var(--bg); color: var(--ink); }` explicitly.
- **Mobile-first:**
  - Body padding is 16px at the sides, and bottom padding clears the fixed nav plus `env(safe-area-inset-bottom)`.
  - No horizontal scroll at 320px width.
  - Max content width is 1100px, centered.
- **Grids:**
  - `.families`: `grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))` with a 14px gap. That gives about 2 columns on a phone, 4 on an iPad and 5–6 on a laptop.
  - `.activity-grid`: `repeat(auto-fill, minmax(120px, 1fr))`.
- **Buttons:**
  - Minimum height 64px, font 18px or more, bold.
  - `border: 2px solid var(--fam)`, `background: var(--fam-light)`, `color: var(--fam)`, and rounded corners.
  - Labels use `text-transform: uppercase`, to match the PDF.
  - Emoji are about 34px.
  - Visible `:focus-visible` outline.
- **Family card header strip:** `var(--fam)` background with white text.
- **`.did-it`:** a solid `var(--fam)` button with white text.
- **Dialogs:**
  - `width: min(640px, calc(100vw - 24px))`, `max-height: 85vh`, overflow auto, rounded corners.
  - `::backdrop` is a translucent dark.
- **Bottom `.tabs`:**
  - Fixed, three equal links, 64px tall, white background, top border.
  - The active tab (`[aria-current=page]`) is bold with a colored underline.
- **`.banner`:** a yellow notice bar at the top.
- **`.bloom` animation:** 600ms keyframe scale 1 → 1.06 → 1, with a box-shadow glow. Disable it in `@media (prefers-reduced-motion: reduce)`.

**`manifest.webmanifest`**

```json
{ "name": "Pick&Bloom", "short_name": "Pick&Bloom", "start_url": "./index.html", "display": "standalone",
  "background_color": "#fffaf2", "theme_color": "#2a7a46",
  "icons": [ { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
             { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" },
             { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml" } ] }
```

**Icons**
- **`icon.svg`:** a simple flower (5 colored petals around a yellow center) on a rounded `#fffaf2` square, `viewBox="0 0 512 512"`.
- **PNGs:** generate them from the SVG with headless Chrome. Make a temporary HTML page in the scratchpad that shows the SVG full-bleed at each size, then screenshot it:
  ```bash
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "$CHROME" --headless=new --hide-scrollbars --window-size=512,512 --screenshot="$PWD/icon-512.png" "file:///path/to/tmp-icon-512.html"
  ```
  Repeat for 192 and 180 (`apple-touch-icon.png`). Use a temp HTML file whose `<body style="margin:0">` holds `<img src="file:///…/icon.svg" width=N height=N>`. Delete the temp HTML afterwards; don't commit it.

**Step 6: Verify with screenshots** (save screenshots outside the repo, e.g. `/private/tmp/claude-501/-Users-savithavijayarangan-Desktop-Pick-Bloom/7bd3cc96-c428-4562-ba17-57439e6345ad/scratchpad/`):

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="file://$PWD/index.html"
"$CHROME" --headless=new --dump-dom "$URL" | grep -q 'data-ready="1"' && echo RENDER_OK
"$CHROME" --headless=new --hide-scrollbars --window-size=390,844  --screenshot="$SCRATCH/phone.png"  "$URL"
"$CHROME" --headless=new --hide-scrollbars --window-size=820,1180 --screenshot="$SCRATCH/ipad.png"   "$URL"
"$CHROME" --headless=new --hide-scrollbars --window-size=1440,900 --screenshot="$SCRATCH/laptop.png" "$URL#garden"
```

Expected: `RENDER_OK`. Open the PNGs (with the Read tool) and check:
- 12 colored family cards.
- About 2 columns on the phone, 4 on the iPad, 5 or more on the laptop.
- No horizontal overflow.
- The garden empty state shows on the laptop shot.

Run `npm test` and confirm nothing regressed.

**Step 7: Commit:** `git add index.html styles.css app.js manifest.webmanifest icon.svg icon-192.png icon-512.png apple-touch-icon.png && git commit -m "feat: add child screens, garden and responsive shell"`

---

### Task 5: Grown-up corner (gate, Patterns, Ideas, Settings, Backup)

**Files:**
- Create: `grownups.js`
- Modify: `index.html` (add `<script src="grownups.js">` after `app.js`), `styles.css` (grown-up styles)

It uses `PBApp` (from Task 4), `PB` store and insights functions, and `PB.FAMILIES`. Follow the same `el` helper approach. `grownups.js` can define its own small `el`, or `app.js` can expose `PBApp.el`; prefer exposing `PBApp.el` from `app.js` to avoid duplicating it.

- **Gate**
  - **Unlocked flag:** keep `unlocked` in memory only. It resets to locked whenever the hash leaves `#grownups`.
  - **Locked screen:** the title "Grown-up corner" and a big button "Hold for 3 seconds" with a fill bar. The fill bar's width animates over 3s using a CSS transition on a class.
  - **Holding:** `pointerdown` starts a 3000ms timer, and `pointerup`, `pointerleave` or `pointercancel` cancels it. The keyboard works the same way with `keydown` Enter/Space (ignore `repeat`) and `keyup`. Call `preventDefault` on `contextmenu` so a long-press on iPad doesn't open a menu.
  - **When the timer completes:** set `unlocked = true` and re-render.
- **Unlocked screen:** a header with a "Lock 🔒" button that locks and goes to `#today`, plus a segmented control: `Patterns | Ideas | Settings | Backup`. The selected sub-tab is kept in memory, and defaults to Patterns.
- **Patterns**
  - **Range toggle:** "Last 7 days" / "Last 30 days" (default 7).
  - **Data:** `const fams = PB.visibleFamilies(PB.FAMILIES, state)`, `const ranged = PB.entriesInRange(state.entries, today, days)`, and `const all = PB.familiesWithSettings(PB.FAMILIES, state)` for labels.
  - **Summary tiles:**
    - Flowers grown (done in range).
    - Picks (in range).
    - Tried: `${v.tried} of ${v.total} buttons`, using `PB.variety(state.entries, fams)` over all time.
  - **Per-family list:** one row per visible family, built from `familyStats(ranged, fams, today)`. The row is a card on narrow screens and a table-like grid when wide. Each row shows:
    - A color dot and the family name.
    - Picks and finished.
    - Favorite: the emoji and label of `favorites(ranged, f.id, 1)[0]`, or "—".
    - Last picked, from `familyStats(state.entries, ...)` over all time: "today" / "yesterday" / "N days ago" / "not yet".
    - Time of day: `🌅 m · ☀️ a · 🌙 e` from `timeOfDay(ranged)[f.id]`, or zeros.
  - **"Most loved":** activities with `loved > 0` from `activityStats(ranged)`, sorted by loved descending, top 8. Shown as chips `emoji label 😄×n`. If there are none: "No 😄 ratings yet in this range."
  - **"Not tried yet":** a `<details>` grouped by family, listing the `variety(...).notTried` emoji and labels.
- **Ideas:** `PB.suggestions(state.entries, fams, today, state.settings.childName)`, rendered as cards with an icon per type:
  - `getting-started` 🌱, `skipped` 🧭, `repeat` 🔁, `dropped` 🤝, `loved` 💖, `all-good` 🌈.
  - Add a footnote: "Ideas come from simple rules about the last two weeks, not from AI."
- **Settings**
  - **Child's name:** a text input with `maxlength 30`. On `change`, `commit(PB.setChildName(...))`.
  - **"Read buttons aloud":** a checkbox wired to `PB.setReadAloud`.
  - **"Families shown":** one checkbox per family (checked = shown), wired to `PB.toggleFamilyHidden`.
  - **Per family `<details>` "Buttons in {family}":**
    - A checkbox per activity (including custom ones), wired to `PB.toggleActivityHidden`.
    - An "Add a button" form: label input (maxlength 24, required), emoji input (maxlength 8, placeholder ⭐), and an Add button. On submit, `preventDefault` and `commit(PB.addCustomActivity(state, PB.FAMILIES, f.id, label, emoji))`.
  - **Remember open sections:** keep which `<details>` are open across re-renders, using a Set in memory, so toggling a checkbox doesn't collapse the section.
- **Backup**
  - **"Download backup":** `new Blob([PB.exportBackup(state)], {type:'application/json'})` and an `<a download="pick-and-bloom-backup-YYYY-MM-DD.json">` that is clicked, then the URL is revoked.
  - **"Restore from a backup":** an `<input type="file" accept="application/json,.json">`.
    - Read it with `file.text()` and call `PB.importBackup`.
    - On failure, show the `error` in a `role="alert"` paragraph.
    - On success, `confirm('Add everything from this backup to this device? Nothing here will be deleted.')`, then `commit(PB.mergeStates(state, result.state))` and show "Backup restored ✓".
  - **Explanation text:** "Backups are a safety copy. Restoring adds the backup's picks to what's already here."

**Verification**
- Temporarily make the gate unlock instantly. Use a query flag that `grownups.js` reads only for this check, `?unlock=1`, and keep it: it's harmless, because it only skips the hold. Screenshot each sub-tab at phone and laptop sizes:
  - Patterns via `index.html?unlock=1#grownups`.
  - For the other sub-tabs, add support for `?unlock=1&tab=ideas` (and `settings`, `backup`) in the same flag-reading code.
- Confirm `RENDER_OK` with `--dump-dom` for each URL, and check the screenshots for layout. Run `npm test` and confirm it's green.
- Commit: `git add grownups.js index.html styles.css app.js && git commit -m "feat: add grown-up corner with patterns, ideas, settings and backup"`

---

### Task 6: Sync across devices (Supabase) + docs

**Files:**
- Create: `sync.js`, `tests/sync.test.js`, `config.js`, `supabase/schema.sql`, `docs/MANUAL_TEST.md`
- Modify: `index.html`, `grownups.js` (add a 5th sub-tab, **Sync**), `app.js` (sync triggers), `README.md` (full guide), `styles.css`

**Step 1: `supabase/schema.sql`**

```sql
-- Pick&Bloom: one row per signed-in account holding the whole app state.
create table if not exists public.pickbloom_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.pickbloom_state enable row level security;

-- Newer Supabase projects don't auto-grant table access to API roles. Signed-in users only; RLS limits them to their own row.
grant select, insert, update on public.pickbloom_state to authenticated;

create policy "read own state" on public.pickbloom_state
  for select using (auth.uid() = user_id);
create policy "insert own state" on public.pickbloom_state
  for insert with check (auth.uid() = user_id);
create policy "update own state" on public.pickbloom_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Step 2: `config.js`**

```js
/* Fill these in to sync across devices (see README → "Sync across devices").
   Leave them blank to keep data on this device only. The anon key is meant to be public;
   row-level security keeps each account's data private. */
window.PB_CONFIG = { supabaseUrl: '', supabaseAnonKey: '' };
```

**Step 3: Write the failing tests `tests/sync.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const PB = require('../store.js');
const { createSync } = require('../sync.js');

const T1 = new Date('2026-11-19T15:00:00.000Z');
const T2 = new Date('2026-11-19T16:00:00.000Z');

function fakeClient({ remote = null, signedIn = true, failSelect = false } = {}) {
  const db = { row: remote ? { user_id: 'u1', state: remote } : null, upserts: 0 };
  let session = signedIn ? { user: { id: 'u1', email: 'parent@example.com' } } : null;
  return {
    db,
    auth: {
      async getSession() { return { data: { session } }; },
      async signInWithPassword({ email, password }) {
        if (password !== 'right') return { data: {}, error: { message: 'Invalid login credentials' } };
        session = { user: { id: 'u1', email } };
        return { data: { user: session.user, session }, error: null };
      },
      async signOut() { session = null; return { error: null }; },
    },
    from(table) {
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
  const remote = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  const local = PB.pickActivity(PB.emptyState(), '2026-11-19', 'calm', 'rest', T2);
  const client = fakeClient({ remote });
  const h = harness(client, local);
  await h.sync.start();
  assert.deepEqual(Object.keys(PB.entriesForDate(h.state, '2026-11-19')).sort(), ['calm', 'move']);
  assert.deepEqual(client.db.row.state, h.state);
  assert.equal(client.db.row.user_id, 'u1');
  assert.equal(h.statuses.at(-1).kind, 'synced');
  assert.equal(h.sync.email(), 'parent@example.com');
});

test('first sync with no remote row uploads local state', async () => {
  const local = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  const client = fakeClient();
  const h = harness(client, local);
  await h.sync.start();
  assert.deepEqual(client.db.row.state, local);
});

test('signed out: start() reports signed-out and does not touch the server', async () => {
  const client = fakeClient({ signedIn: false });
  const h = harness(client, PB.emptyState());
  await h.sync.start();
  assert.equal(h.statuses.at(-1).kind, 'signed-out');
  await h.sync.syncNow();
  assert.equal(client.db.upserts, 0);
});

test('signIn with a wrong password returns the error; the right one syncs', async () => {
  const client = fakeClient({ signedIn: false });
  const h = harness(client, PB.emptyState());
  await h.sync.start();
  assert.deepEqual(await h.sync.signIn('parent@example.com', 'wrong'), { ok: false, error: 'Invalid login credentials' });
  assert.deepEqual(await h.sync.signIn('parent@example.com', 'right'), { ok: true });
  assert.equal(client.db.upserts, 1);
  await h.sync.signOut();
  assert.equal(h.sync.isSignedIn(), false);
  assert.equal(h.statuses.at(-1).kind, 'signed-out');
});

test('network errors are reported, and local data is kept', async () => {
  const local = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
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
  let state = PB.emptyState();
  const sync = createSync({ client, getState: () => state, setState: (s) => { state = s; }, onStatus() {} });
  await sync.start();
  const p = sync.syncNow();
  state = PB.pickActivity(state, '2026-11-19', 'move', 'run', T2); // child taps during the sync
  await p;
  assert.equal(PB.entriesForDate(state, '2026-11-19').move[0].activityId, 'run');
});

test('a corrupt remote row is ignored and overwritten by valid local state', async () => {
  const client = fakeClient({ remote: { junk: true } });
  const local = PB.pickActivity(PB.emptyState(), '2026-11-19', 'move', 'run', T1);
  const h = harness(client, local);
  await h.sync.start();
  assert.deepEqual(client.db.row.state, local);
});
```

**Step 4: Run them and confirm they fail:** `npm test`. Expected: FAIL (`Cannot find module '../sync.js'`).

**Step 5: Create `sync.js`**

```js
/* Pick&Bloom sync: keeps one Supabase row per account in step with this device by merging. */
(function (root) {
  'use strict';

  const PB = (typeof module === 'object' && module.exports) ? require('./store.js') : root.PB;
  const TABLE = 'pickbloom_state';

  /**
   * @param {object} opts
   * @param opts.client  a Supabase client (or a fake with the same shape)
   * @param opts.getState () => current local state
   * @param opts.setState (state) => void — replace local state (caller saves + re-renders)
   * @param opts.onStatus ({kind:'signed-out'|'syncing'|'synced'|'error', at?, message?}) => void
   */
  function createSync({ client, getState, setState, onStatus }) {
    let user = null;
    let running = null;
    let again = false;

    async function pullMergePush() {
      onStatus({ kind: 'syncing' });
      try {
        const { data, error } = await client.from(TABLE).select('state').eq('user_id', user.id).maybeSingle();
        if (error) throw error;
        const local = getState();
        const merged = data && PB.isValidState(data.state) ? PB.mergeStates(local, data.state) : local;
        const { error: upError } = await client.from(TABLE).upsert({ user_id: user.id, state: merged, updated_at: new Date().toISOString() });
        if (upError) throw upError;
        // Merge again with whatever the child did while we were waiting on the network.
        setState(PB.mergeStates(getState(), merged));
        onStatus({ kind: 'synced', at: new Date() });
      } catch (err) {
        onStatus({ kind: 'error', message: (err && err.message) || 'Sync failed' });
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

    async function start() {
      const { data } = await client.auth.getSession();
      user = data && data.session ? data.session.user : null;
      if (!user) { onStatus({ kind: 'signed-out' }); return; }
      await syncNow();
    }

    async function signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: error.message };
      user = data.user;
      await syncNow();
      return { ok: true };
    }

    async function signOut() {
      await client.auth.signOut();
      user = null;
      onStatus({ kind: 'signed-out' });
    }

    return { start, signIn, signOut, syncNow, isSignedIn: () => !!user, email: () => (user ? user.email : null) };
  }

  const api = { createSync };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PB = Object.assign(root.PB || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

> The "edits made while a sync is in flight" test changes `state` synchronously right after `syncNow()` starts. The final `setState(PB.mergeStates(getState(), merged))` must keep that edit. Because the edit is newer and there is no conflicting done entry, the merge keeps it.

**Step 6: Run the tests and confirm they pass:** `npm test`. Expected: all pass.

**Step 7: Wire it into the app**
- **`index.html`**, before `app.js`, in this order:
  - `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js"></script>`
  - `<script src="config.js"></script>`
  - `<script src="sync.js"></script>`
  - If the CDN fails (offline or `file://` without network), `window.supabase` is undefined and the app must still work.
- **`app.js`**: after the first render, set up sync.
  - **Create the client** only if `window.PB_CONFIG?.supabaseUrl`, `window.PB_CONFIG?.supabaseAnonKey` and `window.supabase?.createClient` all exist: `const client = window.supabase.createClient(url, key)`.
  - **Create the sync:** `PB.createSync({ client, getState: () => state, setState: (s) => { state = s; if (persistent) PB.saveState(storage, state); render(); }, onStatus: (st) => { syncStatus = st; if (location.hash === '#grownups') render(); } })`.
  - **Expose it:** `PBApp.sync` (or `null` when it's not configured) and `PBApp.syncStatus()`.
  - **Triggers:**
    - `sync.start()` on load.
    - `afterCommit` schedules a debounced sync (1500 ms).
    - On `visibilitychange` when it becomes visible, and on `online`, call `syncNow()`.
    - `setInterval(() => { if (document.visibilityState === 'visible') sync.syncNow(); }, 60000)`.
    - Wrap all of these in try/catch so sync can never break the child's screens.
- **`grownups.js`**: add a 5th sub-tab **Sync**.
  - **Not configured (`PBApp.sync === null`):**
    - Explain: "Right now Pick&Bloom saves on this device only. To see the same garden on the iPad, phone and laptop, set up free sync. It takes about 10 minutes. See 'Sync across devices' in the README."
    - Also show the tip: "Until then, use Backup to copy progress between devices."
  - **Configured and signed out:** a form with email (`type=email`, `autocomplete=username`), password (`type=password`, `autocomplete=current-password`) and a "Sign in" button. Show errors in `role=alert`.
    - Add a note: "Sign in with the same grown-up account on every device. The child never needs to sign in again on that device."
  - **Signed in:**
    - "Signed in as {email}".
    - A status line:
      - `syncing` → "Syncing…"
      - `synced` → "Last synced at {time}"
      - `error` → "Couldn't sync: {message}. Progress is still saved on this device."
    - Buttons: "Sync now" and "Sign out". Sign out only stops syncing; local data stays.
  - Make sure `?unlock=1&tab=sync` works for screenshots.

**Step 8: Docs**
- **`README.md`**: a full guide in plain, friendly English, explained with an everyday analogy first.
  - What it is.
  - How to use it (child / grown-up).
  - **Open it:** double-click `index.html`, or visit the hosted link.
  - **Put it on the iPad/iPhone home screen:** Safari → Share → Add to Home Screen. Android or laptop Chrome: ⋮ → Install / Add to Home screen.
  - **Sync across devices**, step by step:
    1. Create a free Supabase project.
    2. Open the SQL Editor and run `supabase/schema.sql`.
    3. Go to Authentication → Users → Add user, and create one grown-up email and password.
    4. Go to Authentication → Sign In / Providers, and turn off "Allow new users to sign up".
    5. Go to Project Settings → API, and copy the Project URL and anon public key into `config.js`.
    6. Deploy.
  - **Host it (free):** Vercel. Either import the repo (Framework preset: Other, no build command, output directory `.`) or `npx vercel deploy` from the folder. Netlify drag-and-drop also works.
  - **Privacy:**
    - Data lives on the device, plus your private Supabase row if sync is on.
    - No AI, no ads, no tracking.
  - Run tests: `npm test`.
  - How the ideas work: list the 4 rules.
- **`docs/MANUAL_TEST.md`**: a checklist with tick boxes. Include:
  - Picking, changing a pick, clearing a pick.
  - "I did it!" with each face, and the bloom.
  - ✨ disappears after the first try.
  - Read aloud on/off.
  - The garden today and this week.
  - The midnight rollover (simulate by changing the device date).
  - The gate: a short tap doesn't unlock, a 3 s hold does.
  - Each Patterns block, and the 7/30 toggle.
  - Ideas.
  - Settings: name, hide family, hide button, add custom button (with HTML characters like `<b>` in the label, which must show literally).
  - Backup download and restore, plus restoring a junk file.
  - Private-browsing banner.
  - Sync: sign in on two devices, pick on one, see it on the other within a minute; go offline, pick, come back online.
  - Layout on phone, iPad and laptop.

**Step 9: Verify**
- `npm test`: all green.
- `--dump-dom` shows `RENDER_OK` for `index.html`, `index.html?unlock=1#grownups` and `index.html?unlock=1&tab=sync#grownups`.
- A screenshot of the Sync tab at phone size, showing the "not configured" state.

**Step 10: Commit:** `git add -A && git commit -m "feat: add optional Supabase sync, setup docs and manual test checklist"` (check `git status` first so only the intended files are included).

---

## After all tasks

- Final review of the whole branch.
- Merge `feat/v1` into `main`.
- **Needs the user (outward-facing):**
  - Create the Supabase project and fill in `config.js`.
  - Create a GitHub repo and deploy to Vercel.
