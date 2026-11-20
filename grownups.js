/* Pick&Bloom grown-up corner: a hold-to-open gate, then Patterns, Ideas, Fix picks, Settings, Backup and Sync. */
(function () {
  'use strict';

  const { el, FEELING_TEXT } = window.PBApp;
  const HOLD_MS = 3000;
  const RELOCK_HIDDEN_MS = 60000;   // away this long (app switched, screen locked) locks the corner again
  const RELOCK_IDLE_MS = 600000;    // 10 minutes with no tap or key while open locks it too
  const MAX_LOVED = 8;
  const params = new URLSearchParams(location.search);

  // Sub-tabs, in order. Adding one is one more line here.
  // Each builder takes the child's state and returns its panel; actions read the latest state via PBApp.
  const TABS = [
    { id: 'patterns', icon: '📊', label: 'Patterns', build: patternsTab },
    { id: 'ideas', icon: '💡', label: 'Ideas', build: ideasTab },
    { id: 'fix', icon: '🧹', label: 'Fix picks', build: fixTab },
    { id: 'settings', icon: '⚙️', label: 'Settings', build: settingsTab },
    { id: 'backup', icon: '💾', label: 'Backup', build: backupTab },
    { id: 'sync', icon: '🔄', label: 'Sync', build: syncTab },
  ];
  const IDEA_ICONS = { 'getting-started': '🌱', skipped: '🧭', repeat: '🔁', dropped: '🤝', loved: '💖', 'all-good': '🌈' };

  // ---------- UI state (memory only; never saved) ----------
  let unlocked = params.get('unlock') === '1'; // screenshot helper: only skips the hold
  let tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'patterns';
  let rangeDays = 7;
  let fixOffset = 0;           // 0 = today, 1 = yesterday, ... 6
  let editing = null;          // "familyId/activityId" of the button being edited
  let editingKid = null;       // id of the child whose name/picture is being edited
  let backupNote = null;       // { kind: 'ok' | 'error', text }
  let signingIn = false;       // a sign-in is on its way to the server
  let signingOut = false;
  let signInError = null;      // the server's reason, shown under the form
  let nextFocus = null;        // ids to try focusing after the next render
  let holdTimer = null;
  const openDetails = new Set();
  const drafts = {};           // input id -> typed text, so a re-render never loses typing

  const S = () => window.PBApp.getState(); // the child shown now (switch with the chips at the top)
  const F = () => window.PBApp.getFamily();
  const kids = () => PB.activeChildren(F());
  const kidName = (child) => window.PBApp.nameOf(child);
  const today = () => PB.dateKey(new Date());
  const famStyle = (f) => ({ '--fam': f.color, '--fam-light': f.light });
  const announce = (text) => { const live = document.getElementById('announce'); if (live) live.textContent = text; };
  const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const childName = (state) => state.settings.childName || 'Your child';
  const btnId = (kind, familyId, activityId) => `gu-${kind}-${familyId}-${activityId}`;

  /** Commit a new state; if nothing changed, still re-render so UI-only changes show. */
  function apply(next) {
    const before = S();
    window.PBApp.commit(next);
    if (S() === before) window.PBApp.render();
  }
  function rerender(focusIds) {
    if (focusIds) nextFocus = focusIds;
    window.PBApp.render();
  }

  // A text field commits on "change", which fires on blur. If that blur came from tapping another control,
  // re-rendering at once would swap that control out mid-tap and swallow the tap. So wait until the tap is over:
  // right after its click has been handled, or 350ms after the finger lifts (iPad sends click late, or not at all
  // for a tap on nothing). Never wait more than 1s, and a window blur ends the tap too.
  let pointerHeld = false;
  let queued = [];
  let flushTimer = null;
  let capTimer = null;
  function flushQueued() {
    clearTimeout(flushTimer);
    clearTimeout(capTimer);
    flushTimer = capTimer = null;
    const run = queued;
    queued = [];
    run.forEach((fn) => fn());
  }
  function flushIn(ms) {
    if (!queued.length) return;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flushQueued, ms);
  }
  document.addEventListener('pointerdown', () => { pointerHeld = true; }, true);
  const releasePointer = () => { pointerHeld = false; flushIn(350); };
  document.addEventListener('pointerup', releasePointer, true);
  document.addEventListener('pointercancel', releasePointer, true);
  window.addEventListener('blur', releasePointer);
  document.addEventListener('click', () => flushIn(0), true); // the timeout runs after this click's own handlers
  function whenTapEnds(fn) {
    queued.push(fn);
    if (!capTimer) capTimer = setTimeout(flushQueued, 1000);
    if (!pointerHeld && !flushTimer) flushIn(0);
  }

  function draftInput(id, fallback, props) {
    return el('input', { type: 'text', id, value: drafts[id] !== undefined ? drafts[id] : fallback,
      oninput: (e) => { drafts[id] = e.target.value; }, ...props });
  }
  const clearDrafts = (...ids) => ids.forEach((id) => { delete drafts[id]; });
  const clearAllDrafts = () => clearDrafts(...Object.keys(drafts));
  const PER_CHILD_DRAFT = /^gu-(name$|edit-|add-)/;

  // ---------- small shared pieces ----------
  const dot = (f) => el('span', { class: 'gu-dot', style: famStyle(f), 'aria-hidden': 'true' });
  const tag = (text) => el('span', { class: 'gu-tag' }, text);
  function chip(family, activity, ...extra) {
    return el('span', { class: 'gu-chip', style: famStyle(family) },
      el('span', { class: 'gu-chip-emoji', 'aria-hidden': 'true' }, activity.emoji),
      el('span', { class: 'gu-chip-label' }, activity.label), ...extra);
  }
  function card(title, ...content) {
    return el('section', { class: 'gu-card' }, title ? el('h2', null, title) : null, ...content);
  }
  const hint = (text, props) => el('p', { class: 'gu-hint', ...props }, text);

  function parseKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
  function shortDay(key, offset) {
    if (offset === 0) return 'Today';
    if (offset === 1) return 'Yesterday';
    return parseKey(key).toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + parseKey(key).getDate();
  }
  function longDay(key, offset) {
    if (offset === 0) return 'today';
    if (offset === 1) return 'yesterday';
    return parseKey(key).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }
  function lastPicked(daysSince) {
    if (daysSince === null) return 'not yet';
    if (daysSince <= 0) return 'today';
    if (daysSince === 1) return 'yesterday';
    return `${daysSince} days ago`;
  }

  /** Buttons with aria-pressed, one chosen at a time (range, day). */
  function segmented(label, options, isOn, onPick, cls) {
    return el('div', { class: 'gu-seg' + (cls ? ' ' + cls : ''), role: 'group', 'aria-label': label },
      options.map((o) => el('button', { type: 'button', id: o.id, 'aria-pressed': String(isOn(o)), onclick: () => onPick(o) }, o.label)));
  }

  // ---------- gate ----------
  function cancelHold() {
    clearTimeout(holdTimer);
    holdTimer = null;
  }

  function gateView() {
    cancelHold(); // a re-render mid-hold starts over
    const note = el('p', { class: 'gate-note', id: 'gu-gate-note', 'aria-live': 'polite' });
    const button = el('button', { type: 'button', class: 'hold', id: 'gu-hold', 'aria-describedby': 'gu-gate-note' },
      el('span', { class: 'hold-text' }, 'Hold for 3 seconds'),
      el('span', { class: 'hold-bar', 'aria-hidden': 'true' }, el('span', { class: 'hold-fill' })));
    const start = () => {
      if (holdTimer) return;
      note.textContent = '';
      button.classList.add('holding');
      holdTimer = setTimeout(() => {
        holdTimer = null;
        unlocked = true;
        lastInput = Date.now();
        announce('Grown-up corner open');
        rerender(['gu-tab-' + tab]);
      }, HOLD_MS);
    };
    const stop = () => {
      if (!holdTimer) return;
      cancelHold();
      button.classList.remove('holding');
      note.textContent = 'Keep holding until the bar is full.';
    };
    button.addEventListener('pointerdown', (e) => { if (e.button === 0) start(); });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) button.addEventListener(type, stop);
    button.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (!e.repeat) start();
    });
    button.addEventListener('keyup', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      stop();
    });
    button.addEventListener('contextmenu', (e) => e.preventDefault()); // iPad/Android long-press menu
    button.addEventListener('selectstart', (e) => e.preventDefault());
    return el('section', { class: 'view grownups gate-view' },
      el('div', { class: 'gate' },
        el('div', { class: 'gate-lock', 'aria-hidden': 'true' }, '🔒'),
        el('h1', null, 'Grown-up corner'),
        el('p', { class: 'gate-sub' }, 'For grown-ups: patterns, ideas and settings.'),
        button,
        note));
  }

  // ---------- locking again ----------
  /** Lock without leaving the page (back from the background, or idle): a toddler must not find it open. */
  function relock() {
    unlocked = false;
    cancelHold();
    editing = null;
    editingKid = null;
    backupNote = null;
    signInError = null;
    clearAllDrafts();
    if (location.hash === '#grownups') window.PBApp.render();
  }
  // Not on hide itself: Android's file chooser hides the page while a backup is being picked.
  let hiddenAt = null;
  let lastInput = Date.now();
  const markHidden = () => { if (hiddenAt === null) hiddenAt = Date.now(); };
  const backFromHidden = () => {
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (away > RELOCK_HIDDEN_MS) relock();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') markHidden();
    else backFromHidden();
  });
  window.addEventListener('pagehide', markHidden);
  window.addEventListener('pageshow', backFromHidden);
  for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => { lastInput = Date.now(); }, true);
  setInterval(() => { if (unlocked && Date.now() - lastInput > RELOCK_IDLE_MS) relock(); }, 5000);

  // ---------- unlocked shell ----------
  function lock() {
    unlocked = false;
    cancelHold();
    location.hash = '#today';
  }

  function tabBar() {
    const select = (t, focus) => {
      if (t.id !== tab) backupNote = null;
      tab = t.id;
      rerender(focus ? ['gu-tab-' + t.id] : null);
    };
    const onKey = (e) => {
      const i = TABS.findIndex((t) => t.id === tab);
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select(TABS[(to + TABS.length) % TABS.length], true);
    };
    return el('div', { class: 'gu-tabs', role: 'tablist', 'aria-label': 'Grown-up sections', onkeydown: onKey },
      TABS.map((t) => el('button', {
        type: 'button', role: 'tab', id: 'gu-tab-' + t.id, 'aria-selected': String(t.id === tab), 'aria-controls': 'gu-panel',
        tabindex: t.id === tab ? '0' : '-1', onclick: () => select(t, true),
      }, el('span', { class: 'gu-tab-icon', 'aria-hidden': 'true' }, t.icon), el('span', { class: 'gu-tab-label' }, t.label))));
  }

  /** Which child every sub-tab shows. Only when there are 2+ children. */
  function childSwitcher() {
    const list = kids();
    if (list.length < 2) return null;
    const activeId = window.PBApp.activeChildId();
    const pick = (child) => {
      if (child.id === activeId) return;
      editing = null;
      editingKid = null;
      // Typing for one child (name, button edits, new buttons) belongs to that child. Family-wide drafts
      // ("Add a child", the sync email) stay.
      clearDrafts(...Object.keys(drafts).filter((id) => PER_CHILD_DRAFT.test(id)));
      nextFocus = ['gu-kid-' + child.id];
      announce(`Showing ${kidName(child)}`);
      window.PBApp.setActiveChild(child.id);
    };
    return el('div', { class: 'gu-kids', role: 'group', 'aria-label': 'Showing child' },
      el('span', { class: 'gu-kids-label', 'aria-hidden': 'true' }, 'Showing'),
      list.map((child) => el('button', { type: 'button', class: 'gu-kid', id: 'gu-kid-' + child.id, 'aria-pressed': String(child.id === activeId),
        onclick: () => pick(child) },
      el('span', { class: 'gu-kid-avatar', 'aria-hidden': 'true' }, child.settings.avatar),
      el('span', { class: 'gu-kid-name' }, kidName(child)))));
  }

  function cornerView() {
    const state = S();
    const current = TABS.find((t) => t.id === tab) || TABS[0];
    return el('section', { class: 'view grownups' },
      el('header', { class: 'gu-head' },
        el('div', { class: 'gu-title' },
          el('h1', null, 'Grown-up corner'),
          el('p', { class: 'gu-sub' }, state.settings.childName ? `How ${state.settings.childName} is doing, and what ${state.settings.childName} can pick` : 'Patterns, ideas and settings')),
        el('button', { type: 'button', class: 'gu-lock', id: 'gu-lock', onclick: lock }, 'Lock 🔒')),
      childSwitcher(),
      tabBar(),
      el('div', { class: 'gu-panel', id: 'gu-panel', role: 'tabpanel', 'aria-labelledby': 'gu-tab-' + current.id, 'data-tab': current.id },
        current.build(state)));
  }

  // ---------- Patterns ----------
  function patternsTab(state) {
    const now = today();
    const fams = PB.visibleFamilies(PB.FAMILIES, state);
    const all = PB.familiesWithSettings(PB.FAMILIES, state);
    const ranged = PB.entriesInRange(state.entries, now, rangeDays);
    const reward = PB.rewardOf(state);
    const finished = ranged.filter((e) => e.doneAt).length;
    const v = PB.variety(state.entries, fams);
    const inRange = PB.familyStats(ranged, fams, now);
    const ever = PB.familyStats(state.entries, fams, now);
    const slots = PB.timeOfDay(ranged);
    const loved = PB.activityStats(ranged).filter((s) => s.loved > 0)
      .sort((a, b) => b.loved - a.loved).slice(0, MAX_LOVED);
    const famById = (id) => all.find((f) => f.id === id) || { id, name: id, color: '#2a7a46', light: '#e0f4e4' };
    const rangeText = `the last ${rangeDays} days`;

    const tiles = el('div', { class: 'gu-tiles' },
      el('div', { class: 'gu-tile', id: 'gu-stat-rewards' },
        el('span', { class: 'gu-tile-value' }, String(finished)),
        el('span', { class: 'gu-tile-label' }, `${reward.emoji} ${capitalize(reward.many)} ${reward.id === 'flower' ? 'grown' : 'earned'}`)),
      el('div', { class: 'gu-tile', id: 'gu-stat-picks' },
        el('span', { class: 'gu-tile-value' }, String(ranged.length)),
        el('span', { class: 'gu-tile-label' }, '✋ Picks')),
      el('div', { class: 'gu-tile', id: 'gu-stat-tried' },
        el('span', { class: 'gu-tile-value' }, String(v.tried), el('small', null, ` of ${v.total}`)),
        el('span', { class: 'gu-tile-label' }, '🧭 Buttons tried', el('span', { class: 'gu-tile-note' }, ' (all time)'))));

    const head = el('li', { class: 'fam-row fam-head', 'aria-hidden': 'true' },
      el('span', { class: 'fr-name' }, 'Family'), el('span', { class: 'fr-picks' }, 'Picks'), el('span', { class: 'fr-done' }, 'Finished'),
      el('span', { class: 'fr-fav' }, 'Favorite'), el('span', { class: 'fr-last' }, 'Last picked'), el('span', { class: 'fr-tod' }, 'Time of day'));
    const cell = (cls, key, ...value) => el('div', { class: 'fr-cell ' + cls }, el('span', { class: 'fr-k' }, key), el('span', { class: 'fr-v' }, ...value));
    const rows = fams.map((f, i) => {
      const s = inRange[i];
      const fav = PB.favorites(ranged, f.id, 1)[0];
      const favActivity = fav && PB.findActivity(all, f.id, fav.activityId);
      const t = slots[f.id] || { morning: 0, afternoon: 0, evening: 0 };
      return el('li', { class: 'fam-row' + (s.picks ? '' : ' is-quiet'), 'data-family': f.id, style: famStyle(f) },
        el('div', { class: 'fr-name' }, dot(f), el('span', null, f.name)),
        cell('fr-last', 'Last picked', lastPicked(ever[i].daysSince)),
        el('div', { class: 'fr-nums' },
          cell('fr-picks', 'Picks', String(s.picks)),
          cell('fr-done', 'Finished', String(s.done)),
          cell('fr-tod', 'Time of day',
            el('span', { class: 'tod', 'aria-hidden': 'true' }, `🌅 ${t.morning} · ☀️ ${t.afternoon} · 🌙 ${t.evening}`),
            el('span', { class: 'visually-hidden' }, `morning ${t.morning}, afternoon ${t.afternoon}, evening ${t.evening}`))),
        cell('fr-fav', 'Favorite', favActivity
          ? [el('span', { 'aria-hidden': 'true' }, favActivity.emoji + ' '), favActivity.label, el('span', { class: 'gu-muted' }, ` ×${fav.picks}`)]
          : '—'));
    });

    const notTried = new Map();
    for (const x of v.notTried) {
      if (!notTried.has(x.familyId)) notTried.set(x.familyId, []);
      notTried.get(x.familyId).push(PB.findActivity(all, x.familyId, x.activityId));
    }

    return el('div', { class: 'gu-stack' },
      el('div', { class: 'gu-range' },
        segmented('Range', [{ id: 'gu-range-7', days: 7, label: 'Last 7 days' }, { id: 'gu-range-30', days: 30, label: 'Last 30 days' }],
          (o) => o.days === rangeDays, (o) => { rangeDays = o.days; rerender([o.id]); }),
        ranged.length ? null : el('p', { class: 'gu-hint' }, `No picks in ${rangeText} yet.`)),
      tiles,
      hint(`${capitalize(reward.many)} and picks count every family, hidden ones too.`, { class: 'gu-hint gu-tiles-note', id: 'gu-tiles-note' }),
      card('Family by family', hint(`Counts are for ${rangeText}. "Last picked" looks at all time.`),
        el('ul', { class: 'fam-rows' }, head, rows)),
      el('div', { class: 'gu-two' },
        card('Most loved 😄',
          loved.length
            ? el('div', { class: 'gu-chips' }, loved.map((s) => {
              const f = famById(s.familyId);
              return chip(f, PB.findActivity(all, s.familyId, s.activityId), el('span', { class: 'gu-chip-count', 'aria-label': `rated loved ${s.loved} times` }, `😄×${s.loved}`));
            }))
            : hint('No 😄 ratings yet in this range.')),
        card('Not tried yet',
          v.notTried.length === 0
            ? hint('Every button has been tried at least once. 🎉')
            : detailsBox('nottried', 'gu-sum-nottried', [el('span', null, `${plural(v.notTried.length, 'button', 'buttons')} never picked`)],
              el('div', { class: 'gu-nottried' }, [...notTried].map(([familyId, list]) => {
                const f = famById(familyId);
                return el('div', { class: 'gu-nt-group' },
                  el('h3', null, dot(f), f.name),
                  el('div', { class: 'gu-chips' }, list.map((a) => chip(f, a))));
              }))))));
  }

  function detailsBox(key, summaryId, summary, ...content) {
    return el('details', {
      class: 'gu-details', open: openDetails.has(key),
      ontoggle: (e) => { if (e.currentTarget.open) openDetails.add(key); else openDetails.delete(key); },
    }, el('summary', { id: summaryId }, ...summary), el('div', { class: 'gu-details-body' }, ...content));
  }

  // ---------- Ideas ----------
  function ideasTab(state) {
    const fams = PB.visibleFamilies(PB.FAMILIES, state);
    const ideas = PB.suggestions(state.entries, fams, today(), state.settings.childName);
    return el('div', { class: 'gu-stack' },
      el('ul', { class: 'gu-ideas' }, ideas.map((idea) => el('li', { class: 'gu-idea', 'data-type': idea.type },
        el('span', { class: 'gu-idea-icon', 'aria-hidden': 'true' }, IDEA_ICONS[idea.type] || '💡'),
        el('p', null, idea.text)))),
      hint('Ideas come from simple rules about the last two weeks, not from AI.', { class: 'gu-hint gu-foot' }));
  }

  // ---------- Fix picks ----------
  function fixTab(state) {
    const now = today();
    const date = PB.addDays(now, -fixOffset);
    const all = PB.familiesWithSettings(PB.FAMILIES, state);
    const picks = PB.entriesForDate(state, date);
    const reward = PB.rewardOf(state);
    const order = [...all.map((f) => f.id), ...Object.keys(picks).filter((id) => !all.some((f) => f.id === id))];
    const groups = order.filter((id) => (picks[id] || []).length);
    const removeIds = groups.flatMap((id) => picks[id].map((e) => btnId('rm', id, e.activityId)));

    const days = [];
    for (let i = 0; i < 7; i++) days.push({ id: 'gu-day-' + i, offset: i, label: shortDay(PB.addDays(now, -i), i) });

    function remove(family, entry, activity) {
      const day = longDay(date, fixOffset);
      if (!window.confirm(`Remove "${activity.label}" from ${day}? This also removes its ${reward.one}.`)) return;
      const i = removeIds.indexOf(btnId('rm', family.id, entry.activityId));
      nextFocus = [removeIds[i + 1], removeIds[i - 1], 'gu-day-' + fixOffset].filter(Boolean);
      announce(`Removed ${activity.label} from ${day}`);
      apply(PB.removePick(S(), date, family.id, entry.activityId));
    }

    return el('div', { class: 'gu-stack' },
      card(null,
        hint(`Use this to fix picks added by mistake. ${childName(state)} can only take back picks that aren't finished yet; finished ones can only be removed here.`),
        segmented('Day', days, (o) => o.offset === fixOffset, (o) => { fixOffset = o.offset; rerender([o.id]); }, 'gu-days')),
      card(capitalize(longDay(date, fixOffset)),
        groups.length === 0
          ? hint('No picks on this day.', { class: 'gu-hint gu-empty' })
          : groups.map((familyId) => {
            const family = all.find((f) => f.id === familyId) || { id: familyId, name: familyId, color: '#2a7a46', light: '#e0f4e4' };
            return el('div', { class: 'fix-fam', 'data-family': familyId, style: famStyle(family) },
              el('h3', null, dot(family), family.name),
              el('ul', { class: 'fix-rows' }, picks[familyId].map((entry) => {
                const activity = PB.findActivity(all, familyId, entry.activityId);
                const feeling = FEELING_TEXT[entry.feeling];
                return el('li', { class: 'fix-row', 'data-activity': entry.activityId },
                  el('span', { class: 'fix-emoji', 'aria-hidden': 'true' }, activity.emoji),
                  el('span', { class: 'fix-label' }, activity.label),
                  entry.doneAt
                    ? el('span', { class: 'fix-status done' }, el('span', { 'aria-hidden': 'true' }, reward.emoji + (feeling ? ' ' + feeling.face : '')), ' ', feeling ? feeling.text : 'Done')
                    : el('span', { class: 'fix-status' }, 'not done yet'),
                  el('button', { type: 'button', class: 'danger', id: btnId('rm', familyId, entry.activityId),
                    'aria-label': `Remove ${activity.label}, ${family.name}`, onclick: () => remove(family, entry, activity) }, 'Remove'));
              })));
          })));
  }

  // ---------- Settings ----------
  /**
   * Saves after the tap is over, so it must name the child it was typed for: the tap may have been on another
   * child's chip, which switches the child shown before this runs.
   */
  function saveName(value) {
    const id = window.PBApp.activeChildId();
    whenTapEnds(() => {
      if (window.PBApp.activeChildId() === id) clearDrafts('gu-name');
      const child = PB.getChild(F(), id);
      if (!child || child.removed || String(value).trim().slice(0, 30) === child.settings.childName) return;
      window.PBApp.commitFamily(PB.updateChild(F(), id, (c) => PB.setChildName(c, value)));
    });
  }

  function buttonRow(family, activity, rowIds) {
    const key = PB.activityKey(family.id, activity.id);
    if (editing === key) return editRow(family, activity);
    const startEdit = () => {
      editing = key;
      clearDrafts('gu-edit-label', 'gu-edit-emoji');
      rerender(['gu-edit-label']);
    };
    const hide = () => {
      const i = rowIds.indexOf(key);
      const near = [rowIds[i + 1], rowIds[i - 1]].filter(Boolean).map((k) => btnId('hide', family.id, k.split('/')[1]));
      nextFocus = [...near, 'gu-sum-btn-' + family.id];
      announce(`Removed ${activity.label}. It is listed under Removed buttons.`);
      apply(PB.toggleActivityHidden(S(), family.id, activity.id));
    };
    return el('li', { class: 'btn-row', 'data-activity': activity.id },
      el('span', { class: 'btn-emoji', 'aria-hidden': 'true' }, activity.emoji),
      el('span', { class: 'btn-label' }, el('span', null, activity.label),
        activity.custom ? tag('added') : null, activity.renamed ? tag('edited') : null),
      el('span', { class: 'btn-actions' },
        el('button', { type: 'button', id: btnId('edit', family.id, activity.id), 'aria-label': `Edit ${activity.label}`, onclick: startEdit }, 'Edit'),
        activity.renamed
          ? el('button', { type: 'button', id: btnId('reset', family.id, activity.id), 'aria-label': `Reset ${activity.label} to its original name`,
            onclick: () => { nextFocus = [btnId('edit', family.id, activity.id)]; announce('Button reset'); apply(PB.resetActivity(S(), family.id, activity.id)); } }, 'Reset')
          : null,
        el('button', { type: 'button', class: 'danger', id: btnId('hide', family.id, activity.id), 'aria-label': `Remove ${activity.label}`, onclick: hide }, 'Remove')));
  }

  function editRow(family, activity) {
    const back = btnId('edit', family.id, activity.id);
    const close = () => { editing = null; clearDrafts('gu-edit-label', 'gu-edit-emoji'); };
    const cancel = () => { close(); rerender([back]); };
    return el('li', { class: 'btn-row editing', 'data-activity': activity.id },
      el('form', {
        class: 'edit-form', 'aria-label': `Edit ${activity.label}`,
        onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } },
        onsubmit: (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const label = form.querySelector('#gu-edit-label').value;
          const emoji = form.querySelector('#gu-edit-emoji').value;
          close();
          nextFocus = [back];
          announce(`Saved ${label.trim()}`);
          apply(PB.renameActivity(S(), PB.FAMILIES, family.id, activity.id, label, emoji));
        },
      },
      el('label', { class: 'mini-field grow' }, el('span', null, 'Name'),
        draftInput('gu-edit-label', activity.label, { maxlength: 24, required: true, pattern: '.*\\S.*', autocomplete: 'off' })),
      el('label', { class: 'mini-field emoji-field' }, el('span', null, 'Emoji'),
        draftInput('gu-edit-emoji', activity.emoji, { maxlength: 8, autocomplete: 'off' })),
      el('span', { class: 'btn-actions' },
        el('button', { type: 'submit', class: 'primary' }, 'Save'),
        el('button', { type: 'button', onclick: cancel }, 'Cancel'))));
  }

  function familyButtons(family, who) {
    const shown = family.activities.filter((a) => !a.hidden);
    const removed = family.activities.filter((a) => a.hidden);
    const rowIds = shown.map((a) => PB.activityKey(family.id, a.id));
    const labelId = 'gu-add-label-' + family.id;
    const emojiId = 'gu-add-emoji-' + family.id;
    const add = (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const label = form.querySelector('#' + CSS.escape(labelId)).value;
      const emoji = form.querySelector('#' + CSS.escape(emojiId)).value;
      clearDrafts(labelId, emojiId);
      nextFocus = [labelId];
      announce(`Added ${label.trim()} to ${family.name}`);
      apply(PB.addCustomActivity(S(), PB.FAMILIES, family.id, label, emoji));
    };
    return detailsBox('btn-' + family.id, 'gu-sum-btn-' + family.id,
      [dot(family), el('span', { class: 'sum-text' }, `Buttons in ${family.name}`),
        el('span', { class: 'gu-muted sum-count' }, plural(shown.length, 'button', 'buttons')),
        family.hidden ? tag('family hidden') : null],
      shown.length ? el('ul', { class: 'btn-rows' }, shown.map((a) => buttonRow(family, a, rowIds))) : hint('No buttons shown in this family.'),
      removed.length
        ? el('div', { class: 'removed' },
          el('h3', null, 'Removed buttons'),
          hint(`Hidden from ${who}. Their history stays in Patterns.`),
          el('ul', { class: 'btn-rows' }, removed.map((a) => el('li', { class: 'btn-row is-removed', 'data-activity': a.id },
            el('span', { class: 'btn-emoji', 'aria-hidden': 'true' }, a.emoji),
            el('span', { class: 'btn-label' }, el('span', null, a.label)),
            el('span', { class: 'btn-actions' },
              el('button', { type: 'button', id: btnId('back', family.id, a.id), 'aria-label': `Bring back ${a.label}`,
                onclick: () => { nextFocus = [btnId('hide', family.id, a.id)]; announce(`${a.label} is back`); apply(PB.toggleActivityHidden(S(), family.id, a.id)); } },
              'Bring back'))))))
        : null,
      el('form', { class: 'add-form', onsubmit: add, 'aria-label': `Add a button to ${family.name}` },
        el('h3', null, 'Add a button'),
        el('div', { class: 'add-fields' },
          el('label', { class: 'mini-field grow' }, el('span', null, 'Name'),
            draftInput(labelId, '', { maxlength: 24, required: true, pattern: '.*\\S.*', placeholder: 'e.g. Kite', autocomplete: 'off' })),
          el('label', { class: 'mini-field emoji-field' }, el('span', null, 'Emoji'),
            draftInput(emojiId, '', { maxlength: 8, placeholder: '⭐', autocomplete: 'off' })),
          el('button', { type: 'submit', class: 'primary' }, 'Add'))));
  }

  /** Radio tiles for a child's picture. Selection is shown without a re-render so typing elsewhere is never lost. */
  function avatarPicker(group, chosen, label) {
    return el('fieldset', { class: 'avatar-pick' },
      el('legend', null, label),
      PB.AVATARS.map((emoji, i) => el('label', { class: 'avatar-tile' + (emoji === chosen ? ' selected' : '') },
        el('input', { type: 'radio', class: 'visually-hidden', name: group, id: `${group}-${i}`, value: emoji, checked: emoji === chosen,
          'aria-label': emoji,
          onchange: (e) => {
            drafts[group] = emoji;
            for (const tile of e.target.closest('fieldset').querySelectorAll('.avatar-tile')) tile.classList.toggle('selected', tile.contains(e.target));
          } }),
        el('span', { 'aria-hidden': 'true' }, emoji))));
  }
  const chosenAvatar = (form, group) => { const on = form.querySelector(`input[name="${group}"]:checked`); return on ? on.value : ''; };

  function kidRow(child, list) {
    const name = kidName(child);
    const editBtn = 'gu-kid-edit-' + child.id;
    const last = list.length <= 1;
    if (editingKid === child.id) {
      const close = () => { editingKid = null; clearDrafts('gu-kid-name', 'gu-kid-av'); };
      const cancel = () => { close(); rerender([editBtn]); };
      return el('li', { class: 'kid-row editing', 'data-child': child.id },
        el('form', {
          class: 'kid-form', 'aria-label': `Edit ${name}`,
          onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } },
          onsubmit: (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const newName = form.querySelector('#gu-kid-name').value;
            const avatar = chosenAvatar(form, 'gu-kid-av');
            close();
            nextFocus = [editBtn];
            announce(`Saved ${newName.trim()}`);
            window.PBApp.commitFamily(PB.updateChild(F(), child.id, (c) => PB.setAvatar(PB.setChildName(c, newName), avatar)));
          },
        },
        el('label', { class: 'mini-field grow' }, el('span', null, 'Name'),
          draftInput('gu-kid-name', child.settings.childName, { maxlength: 30, required: true, pattern: '.*\\S.*', autocomplete: 'off' })),
        avatarPicker('gu-kid-av', drafts['gu-kid-av'] || child.settings.avatar, 'Picture'),
        el('span', { class: 'btn-actions' },
          el('button', { type: 'submit', class: 'primary' }, 'Save'),
          el('button', { type: 'button', onclick: cancel }, 'Cancel'))));
    }
    const remove = () => {
      if (last || !window.confirm(`Remove ${name}? Their picks are kept in backups but hidden here.`)) return;
      const i = list.indexOf(child);
      const near = [list[i + 1], list[i - 1]].filter(Boolean).map((c) => 'gu-kid-edit-' + c.id);
      nextFocus = [...near, 'gu-kid-add-name'];
      announce(`Removed ${name}`);
      window.PBApp.commitFamily(PB.removeChild(F(), child.id));
    };
    return el('li', { class: 'kid-row', 'data-child': child.id },
      el('span', { class: 'kid-avatar', 'aria-hidden': 'true' }, child.settings.avatar),
      el('span', { class: 'kid-name' }, el('span', null, name),
        list.length > 1 && child.id === window.PBApp.activeChildId() ? tag('shown now') : null),
      el('span', { class: 'btn-actions' },
        el('button', { type: 'button', id: editBtn, 'aria-label': `Edit ${name}`,
          onclick: () => { editingKid = child.id; clearDrafts('gu-kid-name', 'gu-kid-av'); rerender(['gu-kid-name']); } }, 'Edit'),
        el('button', { type: 'button', class: 'danger', id: 'gu-kid-rm-' + child.id, disabled: last,
          'aria-label': last ? `Remove ${name} (not possible: there must be at least one child)` : `Remove ${name}`, onclick: remove }, 'Remove')));
  }

  /** Family-wide: every child on this device. The rest of Settings is for the child shown now. */
  function childrenCard() {
    const list = kids();
    const used = new Set(list.map((c) => c.settings.avatar));
    const fresh = PB.AVATARS.find((a) => !used.has(a)) || PB.AVATARS[0];
    const add = (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const name = form.querySelector('#gu-kid-add-name').value;
      const avatar = chosenAvatar(form, 'gu-kid-add-av');
      clearDrafts('gu-kid-add-name', 'gu-kid-add-av');
      nextFocus = ['gu-kid-add-name'];
      announce(`Added ${name.trim()}. Choose them with the buttons at the top to set up their settings.`);
      window.PBApp.commitFamily(PB.addChild(F(), name, avatar));
    };
    return card('Children',
      hint('Each child has their own picks, rewards and settings on this device.'),
      el('ul', { class: 'kid-rows' }, list.map((c) => kidRow(c, list))),
      list.length <= 1 ? hint('There must always be at least one child, so the only one can’t be removed.', { class: 'gu-hint kid-last' }) : null,
      el('form', { class: 'add-form kid-add', onsubmit: add, 'aria-label': 'Add a child' },
        el('h3', null, 'Add a child'),
        el('label', { class: 'mini-field' }, el('span', null, 'Name'),
          draftInput('gu-kid-add-name', '', { maxlength: 30, required: true, pattern: '.*\\S.*', placeholder: 'e.g. Mia', autocomplete: 'off' })),
        avatarPicker('gu-kid-add-av', drafts['gu-kid-add-av'] || fresh, 'Picture'),
        el('button', { type: 'submit', class: 'primary', id: 'gu-kid-add' }, 'Add child')));
  }

  function settingsTab(state) {
    const all = PB.familiesWithSettings(PB.FAMILIES, state);
    const current = PB.rewardOf(state);
    const who = state.settings.childName || 'the child';
    return el('div', { class: 'gu-stack' },
      childrenCard(),
      kids().length > 1
        ? el('p', { class: 'gu-for', id: 'gu-for' }, 'These settings are for ',
          el('span', { class: 'gu-for-who' }, el('span', { 'aria-hidden': 'true' }, state.settings.avatar + ' '), kidName(state)), '.')
        : null,
      el('div', { class: 'gu-two' },
        card('Child',
          el('form', { class: 'gu-field', onsubmit: (e) => { e.preventDefault(); saveName(e.currentTarget.querySelector('#gu-name').value); } },
            el('label', { for: 'gu-name' }, "Child's name"),
            draftInput('gu-name', state.settings.childName, { maxlength: 30, autocomplete: 'off', placeholder: 'e.g. Sam',
              onchange: (e) => saveName(e.target.value) }),
            hint('Shown on Today and in Ideas.')),
          el('label', { class: 'gu-check' },
            el('input', { type: 'checkbox', id: 'gu-sound', checked: state.settings.readAloud,
              onchange: (e) => apply(PB.setReadAloud(S(), e.target.checked)) }),
            el('span', null, el('span', { class: 'gu-check-title' }, 'Sounds & voice'),
              el('span', { class: 'gu-hint' }, 'Reads buttons aloud and plays a happy chime.')))),
        card('Reward symbol',
          el('fieldset', { class: 'reward-pick' },
            el('legend', { class: 'visually-hidden' }, 'Reward symbol'),
            PB.REWARDS.map((r) => el('label', { class: 'reward-tile' + (r.id === current.id ? ' selected' : '') },
              el('input', { type: 'radio', class: 'visually-hidden', name: 'gu-reward', id: 'gu-reward-' + r.id, value: r.id, checked: r.id === current.id,
                onchange: () => { announce(`Reward is now ${r.many}`); apply(PB.setReward(S(), r.id)); } }),
              el('span', { class: 'reward-emoji', 'aria-hidden': 'true' }, r.emoji),
              el('span', { class: 'reward-name' }, capitalize(r.one))))),
          hint(`What a finished activity earns. It changes everywhere, past ${current.many} too.`))),
      card('Families shown',
        hint(`Unticked families are hidden from ${who}. Their history stays.`),
        el('div', { class: 'gu-fams' }, all.map((f) => el('label', { class: 'gu-check fam-check-row', style: famStyle(f) },
          el('input', { type: 'checkbox', id: 'gu-fam-' + f.id, checked: !f.hidden,
            onchange: () => apply(PB.toggleFamilyHidden(S(), f.id)) }),
          dot(f), el('span', null, f.name))))),
      card('Buttons',
        hint('Edit, remove or add the buttons in each family. Removing only hides a button; its history stays.'),
        el('div', { class: 'gu-btn-families' }, all.map((f) => familyButtons(f, who)))));
  }

  // ---------- Backup ----------
  function download() {
    const blob = new Blob([PB.exportFamilyBackup(F())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: `pick-and-bloom-backup-${today()}.json`, hidden: true });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); // some browsers read the blob after click() returns
    backupNote = { kind: 'ok', where: 'download', text: 'Backup file made ✓ Look for it in your downloads.' };
    rerender(['gu-download']);
  }

  function readText(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function restore(file) {
    if (!file) return;
    let text;
    try { text = await readText(file); } catch (e) { text = null; }
    if (!unlocked || location.hash !== '#grownups') return; // left the corner while the file was read
    const result = text === null ? { ok: false, error: "That file couldn't be read." } : PB.importFamilyBackup(text);
    if (!result.ok) {
      backupNote = { kind: 'error', where: 'restore', text: result.error };
      rerender(['gu-restore']);
      return;
    }
    if (!window.confirm('Add everything from this backup to this device? Nothing here will be deleted.')) {
      backupNote = null;
      rerender(['gu-restore']);
      return;
    }
    // Every device's first child shares one id: if the names differ, ask before combining two children into one.
    let incoming = result.family;
    const conflict = PB.firstChildConflict(F(), incoming);
    if (conflict && !window.confirm(`Is ${conflict.incomingName} the same child as ${conflict.localName}? OK = same child (combine). Cancel = different children (keep both).`)) {
      incoming = PB.separateFirstChild(incoming);
    }
    backupNote = { kind: 'ok', where: 'restore', text: 'Backup restored ✓' };
    nextFocus = ['gu-restore'];
    if (!window.PBApp.commitFamily(PB.mergeFamilies(F(), incoming))) {
      backupNote = { kind: 'error', where: 'restore', text: "This backup couldn't be added. Nothing on this device was changed." };
      rerender(['gu-restore']);
    }
  }

  function backupTab() {
    const note = (where) => (backupNote && backupNote.where === where
      ? el('p', backupNote.kind === 'error' ? { class: 'gu-note error', role: 'alert' } : { class: 'gu-note ok', role: 'status' }, backupNote.text)
      : null);
    return el('div', { class: 'gu-stack gu-two' },
      card('Download a backup',
        hint('Saves every child’s picks and settings on this device to one file. Keep it somewhere safe.'),
        el('button', { type: 'button', class: 'primary', id: 'gu-download', onclick: download }, '⬇️ Download backup'),
        note('download')),
      card('Restore from a backup',
        hint("Backups are a safety copy. Restoring adds the backup's picks to what's already here."),
        el('label', { class: 'file-btn' }, '📂 Choose a backup file…',
          el('input', { type: 'file', id: 'gu-restore', class: 'visually-hidden', accept: 'application/json,.json',
            onchange: (e) => { const file = e.target.files && e.target.files[0]; e.target.value = ''; restore(file); } })),
        note('restore')));
  }

  // ---------- Sync ----------
  function syncStatusText(status) {
    if (!status || status.kind === 'signed-out') return 'Waiting to sync…';
    if (status.kind === 'syncing') return 'Syncing…';
    if (status.kind === 'synced') return `Last synced at ${status.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    return `Couldn't sync: ${status.message}. Progress is still saved on this device.`;
  }

  async function signIn(e) {
    e.preventDefault();
    if (signingIn) return;
    const form = e.currentTarget;
    const email = form.querySelector('#gu-sync-email').value.trim();
    const password = form.querySelector('#gu-sync-password').value;
    signingIn = true;
    signInError = null;
    rerender(['gu-sync-signin']);
    const result = await window.PBApp.sync.signIn(email, password);
    signingIn = false;
    if (result.ok) {
      clearDrafts('gu-sync-email');
      announce('Signed in. Syncing now.');
      nextFocus = ['gu-sync-now'];
    } else {
      signInError = result.error;
      nextFocus = ['gu-sync-password'];
    }
    if (location.hash === '#grownups') window.PBApp.render();
  }

  async function signOut() {
    if (signingOut) return;
    signingOut = true;
    rerender(['gu-sync-signout']);
    await window.PBApp.sync.signOut();
    signingOut = false;
    announce('Signed out. Progress stays on this device.');
    nextFocus = ['gu-sync-email'];
    if (location.hash === '#grownups') window.PBApp.render();
  }

  function syncTab() {
    const app = window.PBApp;
    const backupTip = hint('Until then, use Backup to copy progress between devices.');
    if (app.syncMode === 'off') {
      return el('div', { class: 'gu-stack' }, card('Sync across devices',
        el('p', { class: 'sync-lead' }, "Right now Pick&Bloom saves on this device only. To see the same garden on the iPad, phone and laptop, set up free sync. It takes about 10 minutes. See 'Sync across devices' in the README."),
        backupTip));
    }
    if (app.syncMode !== 'on') {
      return el('div', { class: 'gu-stack' }, card('Sync across devices',
        el('p', { class: 'sync-lead' }, "Sync couldn't start on this device just now, so Pick&Bloom is saving on this device only. Everything else works as usual. Try again later by reloading the page."),
        backupTip));
    }
    const sync = app.sync;
    const status = app.syncStatus();
    if (sync.isSignedIn()) {
      const kind = status ? status.kind : 'waiting';
      return el('div', { class: 'gu-stack' }, card('Sync across devices',
        el('p', { class: 'sync-who' }, 'Signed in as ', el('strong', null, sync.email() || 'your account')),
        el('p', { class: 'sync-status is-' + kind, id: 'gu-sync-status', role: 'status' }, syncStatusText(status)),
        hint("Every child's picks and settings sync together, about once a minute and soon after each change."),
        el('div', { class: 'sync-actions' },
          el('button', { type: 'button', class: 'primary', id: 'gu-sync-now', disabled: kind === 'syncing' || signingOut,
            onclick: () => { announce('Syncing'); app.sync.syncNow(); } }, '🔄 Sync now'),
          el('button', { type: 'button', id: 'gu-sync-signout', disabled: signingOut, onclick: signOut }, signingOut ? 'Signing out…' : 'Sign out')),
        hint('Signing out only stops syncing on this device. Everything saved here stays here.', { class: 'gu-hint sync-foot' })));
    }
    if (!status) {
      return el('div', { class: 'gu-stack' }, card('Sync across devices', el('p', { class: 'sync-status', role: 'status' }, 'Checking…')));
    }
    const email = drafts['gu-sync-email'] !== undefined ? drafts['gu-sync-email'] : '';
    return el('div', { class: 'gu-stack' }, card('Sync across devices',
      el('p', { class: 'sync-lead', id: 'gu-sync-lead' }, 'Use Pick&Bloom on this device only, or ask the person who shared this app to create a login for you.'),
      el('form', { class: 'sync-form', 'aria-label': 'Sign in to sync', onsubmit: signIn },
        el('label', { class: 'mini-field' }, el('span', null, 'Email'),
          el('input', { type: 'email', id: 'gu-sync-email', value: email, required: true, autocomplete: 'username', inputmode: 'email',
            autocapitalize: 'off', spellcheck: 'false', oninput: (e) => { drafts['gu-sync-email'] = e.target.value; } })),
        el('label', { class: 'mini-field' }, el('span', null, 'Password'),
          el('input', { type: 'password', id: 'gu-sync-password', required: true, autocomplete: 'current-password' })),
        signInError
          ? el('p', { class: 'gu-note error', role: 'alert', id: 'gu-sync-error' }, `Couldn't sign in: ${signInError}`)
          : null,
        el('button', { type: 'submit', class: 'primary', id: 'gu-sync-signin', disabled: signingIn }, signingIn ? 'Signing in…' : 'Sign in')),
      hint('Sign in with the same grown-up account on every device. The child never needs to sign in again on that device.', { class: 'gu-hint sync-foot' })));
  }

  // ---------- the view ----------
  function focusFirst(ids, selection) {
    for (const id of ids) {
      const target = id && document.getElementById(id);
      if (!target) continue;
      target.focus({ preventScroll: id === selection.id });
      if (selection.id === id && selection.start !== null && typeof target.setSelectionRange === 'function') {
        try { target.setSelectionRange(selection.start, selection.end); } catch (e) { /* not a text field */ }
      }
      return;
    }
  }

  function grownupsView() {
    // Every commit rebuilds #app, so remember what had focus and put it back (or move it where the action asked).
    const app = document.getElementById('app');
    const active = document.activeElement;
    const had = active && app.contains(active) && active.id ? active.id : null;
    const selection = { id: had, start: had && typeof active.selectionStart === 'number' ? active.selectionStart : null,
      end: had && typeof active.selectionEnd === 'number' ? active.selectionEnd : null };
    const wanted = nextFocus || [];
    nextFocus = null;
    const node = unlocked ? cornerView() : gateView();
    if (wanted.length || had) queueMicrotask(() => focusFirst([...wanted, had], selection));
    return node;
  }

  // Leaving the corner locks it again.
  window.addEventListener('hashchange', () => {
    if (location.hash === '#grownups') return;
    unlocked = false;
    editing = null;
    editingKid = null;
    backupNote = null;
    signInError = null;
    clearAllDrafts();
    cancelHold();
  });

  // Sync status changes (syncing → synced, signed out elsewhere) refresh the Sync tab while it is shown.
  window.PBApp.onSyncStatus(() => {
    if (unlocked && tab === 'sync' && location.hash === '#grownups') window.PBApp.render();
  });

  window.PBApp.registerView('grownups', grownupsView);
})();
