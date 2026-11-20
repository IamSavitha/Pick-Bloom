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

  const active = (entries) => entries.filter((e) => !e.removed);

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
