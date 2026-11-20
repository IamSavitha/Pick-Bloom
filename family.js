/*
 * Pick&Bloom children ("family"): several children, each with their own picks and settings.
 *
 * A family is { version: 3, children: [child…] }. Each child is a per-child state from store.js
 * ({ version, settings, entries }) plus { id, removed, createdAt, updatedAt }, so every store.js
 * function (pickActivity, markDone, setReward…) works on a child unchanged.
 * Which child is playing is remembered per device by the app, not stored here.
 */
(function (root) {
  'use strict';

  const PB = (typeof module === 'object' && module.exports) ? require('./store.js') : root.PB;

  const FAMILY_VERSION = 3;
  const FIRST_CHILD_ID = 'child-1'; // shared by every fresh device, so their first child syncs as one
  const EPOCH = '1970-01-01T00:00:00.000Z';
  const AVATARS = ['🦖', '🐻', '🦊', '🐰', '🐼', '🐯', '🦁', '🐸', '🐵', '🦄', '🐶', '🐱'];

  const isObject = (x) => !!x && typeof x === 'object';
  const isString = (x) => typeof x === 'string';

  function newChild(id, createdAt) {
    return { ...PB.emptyState(), id, removed: false, createdAt, updatedAt: createdAt };
  }

  function emptyFamily() { return { version: FAMILY_VERSION, children: [newChild(FIRST_CHILD_ID, EPOCH)] }; }

  function isValidChild(c) {
    return isObject(c) && isString(c.id) && typeof c.removed === 'boolean'
      && isString(c.createdAt) && isString(c.updatedAt) && PB.isValidState(c);
  }

  function isValidFamily(f) {
    return isObject(f) && f.version === FAMILY_VERSION && Array.isArray(f.children)
      && f.children.every(isValidChild) && f.children.some((c) => !c.removed);
  }

  /** Single-child saves (v1/v2) become the first child; v3 children get their settings defaults filled in. */
  function upgradeFamily(raw) {
    if (!isObject(raw)) return raw;
    if (raw.version === 1 || raw.version === 2) {
      return { version: FAMILY_VERSION, children: [{ ...PB.upgradeState(raw), id: FIRST_CHILD_ID, removed: false, createdAt: EPOCH, updatedAt: EPOCH }] };
    }
    if (raw.version === FAMILY_VERSION && Array.isArray(raw.children)) {
      return { ...raw, children: raw.children.map((c) => (isObject(c) ? PB.upgradeState(c) : c)) };
    }
    return raw;
  }

  const activeChildren = (f) => f.children.filter((c) => !c.removed);
  const getChild = (f, id) => f.children.find((c) => c.id === id) || null;

  /** Apply a store.js function to one child, e.g. updateChild(f, id, (c) => PB.pickActivity(c, …)). */
  function updateChild(family, id, fn) {
    const child = getChild(family, id);
    if (!child) return family;
    const next = fn(child);
    if (next === child) return family;
    const kept = { ...next, id: child.id, removed: child.removed, createdAt: child.createdAt, updatedAt: child.updatedAt };
    return { ...family, children: family.children.map((c) => (c.id === id ? kept : c)) };
  }

  function randomId() {
    const rand = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    return 'child-' + rand;
  }

  function addChild(family, name, avatar, now = new Date(), id = randomId()) {
    if (!String(name).trim()) return family;
    let child = newChild(id, now.toISOString());
    child = PB.setAvatar(PB.setChildName(child, name, now), avatar || AVATARS[family.children.length % AVATARS.length], now);
    return { ...family, children: [...family.children, child] };
  }

  /** Hide a child (kept as a tombstone so sync doesn't bring them back). The last child can't be removed. */
  function removeChild(family, id, now = new Date()) {
    const child = getChild(family, id);
    if (!child || child.removed || activeChildren(family).length <= 1) return family;
    const gone = { ...child, removed: true, updatedAt: now.toISOString() };
    return { ...family, children: family.children.map((c) => (c.id === id ? gone : c)) };
  }

  function chooseActiveChild(family, rememberedId) {
    const active = activeChildren(family);
    return (active.find((c) => c.id === rememberedId) || active[0]).id;
  }

  // ---------- storage (same key as single-child saves, which upgrade on load) ----------
  function loadFamily(storage) {
    let works = false;
    try {
      if (storage) { storage.setItem(PB.STORAGE_KEY + '.probe', '1'); storage.removeItem(PB.STORAGE_KEY + '.probe'); works = true; }
    } catch (e) { works = false; }
    if (!works) return { family: emptyFamily(), persistent: false, recovered: false };
    const raw = storage.getItem(PB.STORAGE_KEY);
    if (raw === null) return { family: emptyFamily(), persistent: true, recovered: false };
    try {
      const parsed = upgradeFamily(JSON.parse(raw));
      if (isValidFamily(parsed)) return { family: parsed, persistent: true, recovered: false };
    } catch (e) { /* fall through to recovery */ }
    try { storage.setItem(PB.STORAGE_KEY + '.corrupt', raw); } catch (e) { /* best effort */ }
    return { family: emptyFamily(), persistent: true, recovered: true };
  }

  const saveFamily = (storage, family) => PB.saveState(storage, family);

  // ---------- merge (sync and restore) ----------
  function mergeFamilies(a, b) {
    const byId = new Map();
    for (const c of [...a.children, ...b.children]) {
      const prev = byId.get(c.id);
      if (!prev) { byId.set(c.id, c); continue; }
      const newer = c.updatedAt > prev.updatedAt ? c : prev;
      byId.set(c.id, { ...PB.mergeStates(prev, c), id: c.id, removed: prev.removed || c.removed ? newer.removed : false,
        createdAt: prev.createdAt < c.createdAt ? prev.createdAt : c.createdAt, updatedAt: newer.updatedAt });
    }
    let children = [...byId.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id));
    // Two devices may each have removed a different child. Never end with nobody: bring back the newest child.
    if (children.length && children.every((c) => c.removed)) {
      const last = children[children.length - 1];
      children = children.map((c) => (c === last ? { ...c, removed: false } : c));
    }
    return { version: FAMILY_VERSION, children };
  }

  // ---------- backup ----------
  function exportFamilyBackup(family, now = new Date()) {
    return JSON.stringify({ app: 'pick-and-bloom', exportedAt: now.toISOString(), family }, null, 2);
  }

  function importFamilyBackup(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) {
      return { ok: false, error: 'This file is not a Pick&Bloom backup (it is not valid JSON).' };
    }
    let candidate = parsed;
    if (parsed && parsed.app === 'pick-and-bloom') candidate = parsed.family || parsed.state;
    candidate = upgradeFamily(candidate);
    if (!isValidFamily(candidate)) return { ok: false, error: 'This file is not a Pick&Bloom backup, or it is damaged.' };
    return { ok: true, family: candidate };
  }

  const api = {
    FAMILY_VERSION, FIRST_CHILD_ID, AVATARS, emptyFamily, isValidFamily, upgradeFamily, activeChildren, getChild,
    updateChild, addChild, removeChild, chooseActiveChild, loadFamily, saveFamily, mergeFamilies,
    exportFamilyBackup, importFamilyBackup,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PB = Object.assign(root.PB || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
