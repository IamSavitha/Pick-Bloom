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
