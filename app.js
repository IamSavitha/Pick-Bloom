/* Pick&Bloom UI: the child's screens (Today, picker, "I did it!", My Garden) and the app shell. */
(function () {
  'use strict';

  // ---------- tiny DOM helper (never innerHTML with data) ----------
  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (key.startsWith('on')) {
        if (typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
        continue; // never turn a string into an inline handler
      }
      if (key.startsWith('aria-')) {
        if (value !== null && value !== undefined) node.setAttribute(key, String(value));
        continue; // aria-pressed=false etc. must still be written
      }
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'style') for (const [prop, v] of Object.entries(value)) node.style.setProperty(prop, v);
      else if (key === 'hidden' || key === 'disabled') node[key] = true;
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : String(child));
    }
    return node;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  }

  /** A flower drawing. Only the two hex colors from activities.js go into it. */
  function flowerSvg(color, light) {
    const svg = svgEl('svg', { viewBox: '0 0 60 80', 'aria-hidden': 'true', focusable: 'false' });
    svg.append(svgEl('path', { d: 'M30 40 V78', stroke: '#4f7d2c', 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }));
    svg.append(svgEl('path', { d: 'M30 64 Q40 54 46 60 Q38 68 30 64 Z', fill: '#4f7d2c' }));
    for (let i = 0; i < 5; i++) {
      const angle = (i * 72 - 90) * Math.PI / 180;
      svg.append(svgEl('circle', { cx: (30 + 12 * Math.cos(angle)).toFixed(2), cy: (30 + 12 * Math.sin(angle)).toFixed(2), r: 10, fill: color }));
    }
    svg.append(svgEl('circle', { cx: 30, cy: 30, r: 7, fill: light, stroke: color, 'stroke-width': 2 }));
    return svg;
  }

  // ---------- storage and state ----------
  let storage = null;
  try { storage = window.localStorage; } catch (e) { /* storage blocked */ }
  let { state, persistent, recovered } = PB.loadState(storage);
  let afterCommit = function () {};
  const views = {};

  function commit(next) {
    if (next === state) return;
    state = next;
    if (persistent && !PB.saveState(storage, state)) persistent = false; // show the "can't save" banner
    render();
    afterCommit();
  }

  // ---------- helpers ----------
  const today = () => PB.dateKey(new Date());
  const visible = () => PB.visibleFamilies(PB.FAMILIES, state);
  const allFams = () => PB.familiesWithSettings(PB.FAMILIES, state);
  const childName = () => state.settings.childName;
  const triedKeys = () => new Set(PB.activeEntries(state).map((e) => PB.activityKey(e.familyId, e.activityId)));
  const famStyle = (f) => ({ '--fam': f.color, '--fam-light': f.light });
  const FEELING_TEXT = { loved: { face: '😄', text: 'Loved it' }, okay: { face: '🙂', text: 'It was okay' }, tired: { face: '😴', text: 'Tired' } };
  const FALLBACK_COLORS = { color: '#2a7a46', light: '#e0f4e4' };
  const cardSelector = (familyId) => `[data-family="${CSS.escape(familyId)}"]`;

  function speak(text) {
    if (!state.settings.readAloud || !('speechSynthesis' in window)) return;
    try {
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.lang = 'en-US';
      speechSynthesis.speak(utterance);
    } catch (e) { /* speech is a nice-to-have */ }
  }

  // ---------- routing ----------
  function currentView() {
    if (location.hash === '#garden') return 'garden';
    if (location.hash === '#grownups') return 'grownups';
    return 'today';
  }

  // ---------- dialogs ----------
  const pickerDialog = document.getElementById('picker');
  const feelingDialog = document.getElementById('feeling');
  let lastDialogShow = 0;
  let lastDialogClose = -Infinity;
  const tooSoonAfterClose = () => performance.now() - lastDialogClose < 400; // swallow a fast second tap

  const isOpen = (dialog) => dialog.hasAttribute('open');
  function closeDialog(dialog) {
    if (!isOpen(dialog)) return;
    if (typeof dialog.close === 'function') { dialog.close(); return; } // fires 'close'
    dialog.removeAttribute('open'); // old browsers without <dialog>
    lastDialogClose = performance.now();
  }

  for (const dialog of [pickerDialog, feelingDialog]) {
    dialog.addEventListener('close', () => { lastDialogClose = performance.now(); });
    // A fast second tap right after opening must not hit the backdrop or a choice that just appeared under the finger.
    dialog.addEventListener('click', (event) => {
      if (performance.now() - lastDialogShow < 300) { event.stopPropagation(); event.preventDefault(); }
    }, true);
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) closeDialog(dialog);
    });
  }

  function showDialog(dialog, family, title, ...content) {
    const titleId = dialog.id + '-title';
    dialog.replaceChildren(el('div', { class: 'dialog-inner' }, el('h2', { class: 'dialog-head', id: titleId }, title), ...content));
    dialog.setAttribute('aria-labelledby', titleId);
    for (const [prop, v] of Object.entries(famStyle(family))) dialog.style.setProperty(prop, v);
    if (isOpen(dialog)) return;
    lastDialogShow = performance.now();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else { dialog.classList.add('dialog-fallback'); dialog.setAttribute('open', ''); }
  }

  /** After a choice re-rendered the grid, put focus back on that family's card. */
  function focusCard(familyId) {
    const target = app.querySelector(cardSelector(familyId) + ' button') || app.querySelector(cardSelector(familyId));
    if (target) target.focus();
  }

  function openPicker(family) {
    if (tooSoonAfterClose()) return;
    const date = today();
    const entry = PB.entriesForDate(state, date)[family.id] || null;
    const tried = triedKeys();
    const choose = (fn) => { commit(fn()); closeDialog(pickerDialog); focusCard(family.id); };
    const buttons = family.activities.map((a) => el('button', {
      type: 'button', class: 'activity', 'aria-pressed': !!entry && entry.activityId === a.id,
      onclick: () => { speak(a.label); choose(() => PB.pickActivity(state, date, family.id, a.id)); },
    },
    tried.has(PB.activityKey(family.id, a.id)) ? null : el('span', { class: 'badge-new', role: 'img', 'aria-label': 'new', title: 'Never tried yet' }, '✨'),
    el('span', { class: 'emoji', 'aria-hidden': 'true' }, a.emoji),
    el('span', { class: 'label' }, a.label)));
    showDialog(pickerDialog, family, family.name,
      el('div', { class: 'activity-grid' }, buttons),
      el('div', { class: 'dialog-foot' },
        entry ? el('button', { type: 'button', class: 'secondary', onclick: () => choose(() => PB.clearPick(state, date, family.id)) }, 'Clear my pick') : null,
        el('button', { type: 'button', class: 'secondary', onclick: () => closeDialog(pickerDialog) }, 'Close')));
  }

  function openFeeling(family, activity) {
    if (tooSoonAfterClose()) return;
    const date = today(); // the day the child tapped "I did it!", even if midnight passes
    showDialog(feelingDialog, family, `How was ${activity.emoji} ${activity.label}?`,
      el('div', { class: 'feeling-grid' }, PB.FEELINGS.map((feeling) => el('button', {
        type: 'button', class: 'feeling',
        onclick: () => {
          speak(FEELING_TEXT[feeling].text);
          const before = state;
          commit(PB.markDone(state, date, family.id, feeling));
          closeDialog(feelingDialog);
          const card = app.querySelector(cardSelector(family.id));
          if (state !== before && card) card.classList.add('bloom');
          focusCard(family.id);
        },
      }, el('span', { class: 'emoji', 'aria-hidden': 'true' }, FEELING_TEXT[feeling].face), el('span', { class: 'label' }, FEELING_TEXT[feeling].text)))),
      el('div', { class: 'dialog-foot' },
        el('button', { type: 'button', class: 'secondary', onclick: () => closeDialog(feelingDialog) }, 'Not yet')));
  }

  // ---------- Today ----------
  function familyCard(family, entry) {
    const props = { class: 'family-card', 'data-family': family.id, style: famStyle(family) };
    const name = el('span', { class: 'fam-name' }, family.name);
    if (!entry) {
      return el('div', props,
        el('button', { type: 'button', class: 'family-main', onclick: () => openPicker(family) },
          name,
          el('span', { class: 'card-body' },
            el('span', { class: 'plus', 'aria-hidden': 'true' }, '+'),
            el('span', { class: 'hint' }, 'Tap to pick'))));
    }
    const activity = PB.findActivity(allFams(), family.id, entry.activityId);
    if (entry.doneAt) {
      const feeling = FEELING_TEXT[entry.feeling];
      props.class += ' done';
      props.tabindex = '-1';
      return el('div', props,
        el('div', { class: 'family-main' },
          name,
          el('span', { class: 'card-body' },
            el('span', { class: 'big-emoji', 'aria-hidden': 'true' }, `🌸${activity.emoji}`),
            el('span', { class: 'label' }, activity.label),
            el('span', { class: 'face', role: 'img', 'aria-label': feeling ? feeling.text : 'Done' }, feeling ? feeling.face : '✅'))));
    }
    return el('div', props,
      el('button', { type: 'button', class: 'family-main', onclick: () => openPicker(family) },
        name,
        el('span', { class: 'card-body' },
          el('span', { class: 'big-emoji', 'aria-hidden': 'true' }, activity.emoji),
          el('span', { class: 'label' }, activity.label),
          el('span', { class: 'hint' }, 'tap to change'))),
      el('button', { type: 'button', class: 'did-it', onclick: () => openFeeling(family, activity) }, 'I did it! ✅'));
  }

  function todayView() {
    const name = childName();
    const picks = PB.entriesForDate(state, today());
    const families = visible().filter((f) => f.activities.length > 0);
    const done = families.filter((f) => picks[f.id] && picks[f.id].doneAt).length;
    return el('section', { class: 'view today' },
      el('h1', null, name ? `Hi ${name}!` : 'Hi there!'),
      el('p', { class: 'sub' }, 'Pick one from each family'),
      el('p', { class: 'progress' }, `🌸 ${done} of ${families.length} flowers today`),
      el('div', { class: 'families' }, families.map((f) => familyCard(f, picks[f.id] || null))));
  }

  // ---------- Garden ----------
  function doneOn(date) {
    return Object.values(PB.entriesForDate(state, date))
      .filter((e) => e.doneAt)
      .sort((a, b) => a.doneAt.localeCompare(b.doneAt));
  }

  function flowerFor(entry, families, small) {
    const family = families.find((f) => f.id === entry.familyId) || FALLBACK_COLORS;
    const activity = PB.findActivity(families, entry.familyId, entry.activityId);
    const svg = flowerSvg(family.color, family.light);
    if (small) return el('span', { class: 'mini-flower', role: 'img', 'aria-label': activity.label, title: activity.label }, svg);
    return el('figure', { class: 'flower' }, svg,
      el('figcaption', null, el('span', { class: 'emoji', 'aria-hidden': 'true' }, activity.emoji), ' ', activity.label));
  }

  function dayLabel(date, daysAgo) {
    if (daysAgo === 1) return 'Yesterday';
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + d;
  }

  function gardenView() {
    const name = childName();
    const now = today();
    const families = allFams();
    const todays = doneOn(now);
    const total = PB.activeEntries(state).filter((e) => e.doneAt).length;
    const week = [];
    for (let i = 1; i <= 7; i++) {
      const date = PB.addDays(now, -i);
      const entries = doneOn(date);
      week.push(el('li', { class: 'week-row' },
        el('span', { class: 'day' }, dayLabel(date, i)),
        el('span', { class: 'mini-flowers' },
          entries.length ? entries.map((e) => flowerFor(e, families, true)) : el('span', { class: 'sprout', 'aria-label': 'nothing yet', role: 'img' }, '🌱'))));
    }
    return el('section', { class: 'view garden' },
      el('h1', null, name ? `${name}'s garden` : 'My garden'),
      el('section', { class: 'garden-box' },
        el('h2', null, 'Today'),
        todays.length
          ? el('div', { class: 'flowers' }, todays.map((e) => flowerFor(e, families, false)))
          : el('p', { class: 'waiting' }, 'Your garden is waiting for its first flower! 🌱')),
      el('section', { class: 'garden-box' },
        el('h2', null, 'This week'),
        el('ul', { class: 'week' }, week)),
      el('p', { class: 'total' }, `🌸 ${total} ${total === 1 ? 'flower' : 'flowers'} grown so far`));
  }

  // ---------- Grown-ups (placeholder until Task 5 registers the real view) ----------
  function grownupsView() {
    return el('section', { class: 'view grownups' }, el('p', { class: 'placeholder' }, 'Grown-up corner — coming next.'));
  }

  // ---------- render ----------
  const banner = document.getElementById('banner');
  const app = document.getElementById('app');
  const builders = { today: todayView, garden: gardenView, grownups: grownupsView };
  let renderedDate = null;

  function render() {
    if (!persistent) {
      banner.textContent = "This browser can't save progress (maybe private browsing). Picks will disappear when this page closes.";
      banner.hidden = false;
    } else if (recovered) {
      banner.textContent = "Saved progress couldn't be read, so Pick&Bloom started fresh. The old copy was kept on this device.";
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
    const view = currentView();
    renderedDate = today();
    app.replaceChildren((views[view] || builders[view])());
    for (const link of document.querySelectorAll('.tabs a')) {
      if (link.getAttribute('href') === '#' + view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.body.dataset.ready = '1';
  }

  /** Midnight passed while the page stayed open: show the new day. */
  function renderIfNewDay() { if (today() !== renderedDate) render(); }

  window.addEventListener('hashchange', () => {
    closeDialog(pickerDialog);
    closeDialog(feelingDialog);
    render();
    window.scrollTo(0, 0);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render();
  });
  window.addEventListener('pageshow', renderIfNewDay);
  window.addEventListener('focus', renderIfNewDay);
  setInterval(renderIfNewDay, 60000);

  window.PBApp = {
    getState: () => state,
    commit,
    render,
    el,
    setAfterCommit(fn) { afterCommit = fn; },
    registerView(name, fn) {
      views[name] = fn;
      if (currentView() === name) render();
    },
  };

  render();
})();
