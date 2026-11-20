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
