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

  /**
   * Sprout, the buddy: a round baby dinosaur with a leaf on his head (original drawing, no innerHTML).
   * mood 'wave' raises one arm; 'cheer' raises both and opens his smile.
   */
  function sproutSvg(mood) {
    const LINE = '#2f6b2a';
    const BODY = '#7cc95a';
    const svg = svgEl('svg', { viewBox: '0 0 120 124', class: 'sprout-svg sprout-' + mood, 'aria-hidden': 'true', focusable: 'false' });
    const add = (tag, attrs) => { const n = svgEl(tag, attrs); svg.append(n); return n; };
    const outlined = { stroke: LINE, 'stroke-width': 3.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
    // back spikes and tail sit behind the body
    for (const [x, y, r] of [[36, 30, -50], [28, 46, -68], [26, 64, -84], [30, 82, -100]]) {
      add('path', { d: 'M-8 6 Q0 -16 8 6 Z', fill: '#ffc94a', ...outlined, transform: `translate(${x} ${y}) rotate(${r})` });
    }
    add('path', { d: 'M34 96 Q10 104 8 84 Q20 92 36 86 Z', fill: BODY, ...outlined });
    // arms (behind the body): wave raises the right arm, cheer raises both
    const arm = (from, to, cls) => {
      const d = `M${from[0]} ${from[1]} L${to[0]} ${to[1]}`;
      const g = svgEl('g', cls ? { class: cls } : {});
      g.append(svgEl('path', { d, stroke: LINE, 'stroke-width': 17, 'stroke-linecap': 'round', fill: 'none' }));
      g.append(svgEl('path', { d, stroke: BODY, 'stroke-width': 10, 'stroke-linecap': 'round', fill: 'none' }));
      svg.append(g);
    };
    if (mood === 'cheer') arm([38, 74], [17, 50]); else arm([38, 80], [27, 98]);
    if (mood === 'cheer' || mood === 'wave') arm([82, 74], [103, 50], mood === 'wave' ? 'sprout-wave-arm' : ''); else arm([82, 80], [93, 98]);
    // feet
    add('ellipse', { cx: 46, cy: 112, rx: 11, ry: 7, fill: BODY, ...outlined });
    add('ellipse', { cx: 74, cy: 112, rx: 11, ry: 7, fill: BODY, ...outlined });
    // head + body: outline pass first, then fill on top so they read as one shape
    add('ellipse', { cx: 60, cy: 88, rx: 29, ry: 25, fill: BODY, ...outlined, 'stroke-width': 7 });
    add('circle', { cx: 60, cy: 52, r: 31, fill: BODY, ...outlined, 'stroke-width': 7 });
    add('ellipse', { cx: 60, cy: 88, rx: 29, ry: 25, fill: BODY });
    add('circle', { cx: 60, cy: 52, r: 31, fill: BODY });
    add('ellipse', { cx: 60, cy: 92, rx: 18, ry: 16, fill: '#e4f7c9' });
    add('path', { d: 'M48 86 Q60 89 72 86 M47 94 Q60 97 73 94', stroke: '#c3e59c', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' });
    // leaf sprout on his head
    add('path', { d: 'M60 22 Q59 14 61 8', stroke: LINE, 'stroke-width': 3.5, fill: 'none', 'stroke-linecap': 'round' });
    add('path', { d: 'M60 11 Q49 -1 38 7 Q48 17 60 11 Z', fill: '#a6e07a', ...outlined, 'stroke-width': 3 });
    add('path', { d: 'M61 9 Q73 -4 84 5 Q74 16 61 9 Z', fill: '#a6e07a', ...outlined, 'stroke-width': 3 });
    // face
    for (const x of [48, 72]) {
      add('ellipse', { cx: x, cy: 50, rx: 5, ry: 6, fill: '#23302a' });
      add('circle', { cx: x + 1.8, cy: 47.6, r: 2, fill: '#fff' });
    }
    add('ellipse', { cx: 39, cy: 61, rx: 6, ry: 3.6, fill: '#ff9fb2', opacity: 0.85 });
    add('ellipse', { cx: 81, cy: 61, rx: 6, ry: 3.6, fill: '#ff9fb2', opacity: 0.85 });
    if (mood === 'cheer') {
      add('path', { d: 'M51 59 Q60 74 69 59 Z', fill: '#8a3a3a', stroke: '#23302a', 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
      add('path', { d: 'M55 65 Q60 70 65 65 Q60 63 55 65 Z', fill: '#ff8fa3' });
    } else {
      add('path', { d: 'M53 60 Q60 67 67 60', stroke: '#23302a', 'stroke-width': 2.8, fill: 'none', 'stroke-linecap': 'round' });
    }
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

  // ---------- celebration (petals, Sprout cheering, a soft chime) ----------
  let audio = null;
  /** Three quiet rising notes (C5, E5, G5). Called inside the tap handler, which iOS needs to allow sound. */
  function chime() {
    if (!state.settings.readAloud) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audio = audio || new AudioCtx();
      if (audio.state !== 'running') { // iOS reports 'interrupted' after a lock or background
        const resumed = audio.resume();
        if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
      }
      const start = audio.currentTime + 0.9; // after the spoken "Yay!" has started, so they don't overlap
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const t = start + i * 0.13;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(t);
        osc.stop(t + 0.55);
      });
    } catch (e) { /* sound is a nice-to-have */ }
  }

  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const PETALS = ['🌸', '🌼', '🌷', '⭐'];
  const reward = () => PB.rewardOf(state);
  const isFlower = () => reward().id === 'flower';
  const countOf = (n) => `${n} ${n === 1 ? reward().one : reward().many}`;
  const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  /** The burst: the flower mix for flowers, otherwise mostly the chosen reward with a little sparkle. */
  const burstEmoji = (i) => (isFlower() ? PETALS[i % PETALS.length] : i % 5 === 4 ? '✨' : reward().emoji);

  function celebrate() {
    const old = document.querySelector('.celebrate');
    if (old) old.remove();
    const petals = [];
    if (!reducedMotion()) {
      for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const dist = 38 + Math.random() * 18; // in vmin, so it fills phones and laptops alike
        petals.push(el('span', { class: 'petal', style: {
          '--dx': (Math.cos(angle) * dist).toFixed(1) + 'vmin', '--dy': (Math.sin(angle) * dist).toFixed(1) + 'vmin',
          '--spin': Math.round((Math.random() - 0.5) * 540) + 'deg', '--delay': Math.round(Math.random() * 120) + 'ms',
        } }, burstEmoji(i)));
      }
    }
    const overlay = el('div', { class: 'celebrate', 'aria-hidden': 'true' }, petals,
      el('div', { class: 'cheer' }, sproutSvg('cheer'), el('span', { class: 'yay' }, 'Yay! 🎉')));
    document.body.append(overlay);
    setTimeout(() => overlay.remove(), 1400);
  }

  // ---------- dialogs ----------
  const pickerDialog = document.getElementById('picker');
  const feelingDialog = document.getElementById('feeling');
  let lastDialogShow = 0;
  let lastDialogClose = -Infinity;
  let pickerFamilyId = null;
  const tooSoonAfterClose = () => performance.now() - lastDialogClose < 400; // swallow a fast second tap

  const isOpen = (dialog) => dialog.hasAttribute('open');
  function closeDialog(dialog) {
    if (!isOpen(dialog)) return;
    lastDialogClose = performance.now(); // now, not in the 'close' event, which fires a moment later
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open'); // old browsers without <dialog>
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
  // The picker re-renders the grid behind it, so the button that opened it is gone: send focus back to the card.
  pickerDialog.addEventListener('close', () => {
    if (pickerFamilyId && !app.contains(document.activeElement)) focusIn(cardSelector(pickerFamilyId));
  });

  function showDialog(dialog, family, title, ...content) {
    const other = dialog === pickerDialog ? feelingDialog : pickerDialog;
    closeDialog(other); // never two dialogs at once
    const titleId = dialog.id + '-title';
    dialog.replaceChildren(el('div', { class: 'dialog-inner' }, el('h2', { class: 'dialog-head', id: titleId }, title), ...content));
    dialog.setAttribute('aria-labelledby', titleId);
    for (const [prop, v] of Object.entries(famStyle(family))) dialog.style.setProperty(prop, v);
    if (isOpen(dialog)) return;
    lastDialogShow = performance.now();
    if (typeof dialog.showModal === 'function') { dialog.showModal(); return; }
    // iOS before 15.4: no showModal, so show it as a plain fixed panel.
    dialog.classList.add('dialog-fallback');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('open', '');
    const first = dialog.querySelector('button:not([disabled])');
    if (first) first.focus();
  }

  /** After the grid re-rendered, put focus back near what the child just used. */
  function focusIn(selector) {
    const scope = app.querySelector(selector);
    const target = scope && (scope.querySelector('button') || scope);
    if (target) target.focus();
  }
  const pickSelector = (familyId, activityId) => `${cardSelector(familyId)} [data-activity="${CSS.escape(activityId)}"]`;

  /** Midnight passed while the page stayed open: close any dialog and show the new day. */
  function renderIfNewDay() {
    if (today() === renderedDate) return false;
    closeDialog(pickerDialog);
    closeDialog(feelingDialog);
    render();
    return true;
  }

  function findPick(date, familyId, activityId) {
    return (PB.entriesForDate(state, date)[familyId] || []).find((e) => e.activityId === activityId) || null;
  }

  /** Show a picker tile as not picked, picked (✓) or done (the reward symbol, can't be unpicked). */
  function paintTile(tile, entry) {
    const done = !!(entry && entry.doneAt);
    tile.setAttribute('aria-pressed', String(!!entry));
    tile.disabled = done;
    tile.classList.toggle('picked', !!entry);
    tile.classList.toggle('done', done);
    tile.querySelector('.tile-check').textContent = done ? reward().emoji : entry ? '✓' : '';
    const isNew = tile.querySelector('.badge-new');
    if (isNew) isNew.hidden = !!entry; // tried now, so no longer "new"
  }

  function openPicker(family) {
    if (tooSoonAfterClose() || renderIfNewDay()) return;
    const date = today();
    const tried = triedKeys();
    const lastTap = new Map(); // a toddler double-tap must not pick and then unpick
    pickerFamilyId = family.id;
    const tiles = family.activities.map((a) => {
      const tile = el('button', {
        type: 'button', class: 'activity', 'data-activity': a.id,
        onclick: () => {
          const now = performance.now();
          if (now - (lastTap.get(a.id) || -Infinity) < 400) return;
          lastTap.set(a.id, now);
          const entry = findPick(date, family.id, a.id);
          if (entry && entry.doneAt) return;
          if (entry) commit(PB.unpickActivity(state, date, family.id, a.id));
          else { speak(a.label); commit(PB.pickActivity(state, date, family.id, a.id)); }
          paintTile(tile, findPick(date, family.id, a.id));
        },
      },
      el('span', { class: 'tile-check', 'aria-hidden': 'true' }),
      tried.has(PB.activityKey(family.id, a.id)) ? null : el('span', { class: 'badge-new', role: 'img', 'aria-label': 'new', title: 'Never tried yet' }, '✨'),
      el('span', { class: 'emoji', 'aria-hidden': 'true' }, a.emoji),
      el('span', { class: 'label' }, a.label));
      paintTile(tile, findPick(date, family.id, a.id));
      return tile;
    });
    showDialog(pickerDialog, family, family.name,
      el('div', { class: 'activity-grid' }, tiles),
      el('div', { class: 'dialog-foot' },
        el('button', { type: 'button', class: 'primary', onclick: () => closeDialog(pickerDialog) }, 'Done ✓')));
  }

  function openFeeling(family, activity) {
    if (tooSoonAfterClose() || renderIfNewDay()) return;
    const date = today(); // the day the child tapped "I did it!", even if midnight passes
    showDialog(feelingDialog, family, `How was ${activity.emoji} ${activity.label}?`,
      el('div', { class: 'feeling-grid' }, PB.FEELINGS.map((feeling) => el('button', {
        type: 'button', class: 'feeling',
        onclick: () => {
          const before = state;
          commit(PB.markDone(state, date, family.id, activity.id, feeling));
          closeDialog(feelingDialog);
          const row = app.querySelector(pickSelector(family.id, activity.id));
          if (state !== before) {
            chime();
            speak('Yay! ' + FEELING_TEXT[feeling].text);
            announce.textContent = `${capitalize(reward().one)} earned: ${activity.label}, ${family.name}`;
            celebrate();
            if (row) row.classList.add('bloom');
          }
          focusIn(pickSelector(family.id, activity.id));
        },
      }, el('span', { class: 'emoji', 'aria-hidden': 'true' }, FEELING_TEXT[feeling].face), el('span', { class: 'label' }, FEELING_TEXT[feeling].text)))),
      el('div', { class: 'dialog-foot' },
        el('button', { type: 'button', class: 'secondary', onclick: () => closeDialog(feelingDialog) }, 'Not yet')));
  }

  // ---------- Today ----------
  function pickRow(family, entry, families) {
    const activity = PB.findActivity(families, family.id, entry.activityId);
    const feeling = FEELING_TEXT[entry.feeling];
    return el('li', { class: 'pick' + (entry.doneAt ? ' done' : ''), 'data-activity': entry.activityId, tabindex: entry.doneAt ? '-1' : null },
      el('span', { class: 'pick-emoji', 'aria-hidden': 'true' }, activity.emoji),
      el('span', { class: 'label' }, activity.label),
      entry.doneAt
        ? el('span', { class: 'pick-done', role: 'img', 'aria-label': feeling ? feeling.text : 'Done' }, reward().emoji, feeling ? feeling.face : '')
        : el('button', { type: 'button', class: 'did-it', 'aria-label': `I did it: ${activity.label}`, onclick: () => openFeeling(family, activity) }, 'I did it!'));
  }

  function familyCard(family, picks, families) {
    const allDone = picks.length > 0 && picks.every((e) => e.doneAt);
    const props = { class: 'family-card' + (allDone ? ' all-done' : ''), 'data-family': family.id, style: famStyle(family) };
    const head = el('span', { class: 'fam-name' }, family.name,
      allDone ? el('span', { class: 'fam-check', role: 'img', 'aria-label': 'all done' }, ' ✓') : null);
    if (!picks.length) {
      return el('div', props,
        el('button', { type: 'button', class: 'family-main', onclick: () => openPicker(family) },
          head,
          el('span', { class: 'card-body' },
            el('span', { class: 'plus', 'aria-hidden': 'true' }, '+'),
            el('span', { class: 'hint' }, 'Tap to pick'))));
    }
    return el('div', props,
      el('div', { class: 'family-main' },
        head,
        el('ul', { class: 'picks' }, picks.map((e) => pickRow(family, e, families))),
        el('button', { type: 'button', class: 'more', 'aria-label': `Pick more in ${family.name}`, onclick: () => openPicker(family) }, '+ More')));
  }

  function todayView() {
    const name = childName();
    const picks = PB.entriesForDate(state, today());
    const families = visible().filter((f) => f.activities.length > 0);
    const all = allFams();
    const shown = families.flatMap((f) => picks[f.id] || []);
    const flowers = shown.filter((e) => e.doneAt).length;
    const withPick = families.filter((f) => (picks[f.id] || []).length > 0).length;
    return el('section', { class: 'view today' },
      el('div', { class: 'hello' },
        el('div', { class: 'buddy' }, sproutSvg('wave')),
        el('div', { class: 'hello-text' },
          el('h1', null, name ? `Hi ${name}!` : 'Hi there!'),
          el('p', { class: 'bubble' }, 'Pick at least one from each family!'))),
      el('p', { class: 'progress' }, `${reward().emoji} ${countOf(flowers)} today · ${withPick} of ${families.length} ${families.length === 1 ? 'family' : 'families'}`),
      el('div', { class: 'families' }, families.map((f) => familyCard(f, picks[f.id] || [], all))));
  }

  // ---------- Garden ----------
  function doneOn(date) {
    return Object.values(PB.entriesForDate(state, date)).flat()
      .filter((e) => e.doneAt)
      .sort((a, b) => a.doneAt.localeCompare(b.doneAt));
  }

  /** One finished pick in the garden: an SVG flower, or the chosen reward on a family-colored sticker. */
  function flowerFor(entry, families, small, index) {
    const family = families.find((f) => f.id === entry.familyId) || FALLBACK_COLORS;
    const activity = PB.findActivity(families, entry.familyId, entry.activityId);
    const r = reward();
    const symbol = r.id === 'flower'
      ? flowerSvg(family.color, family.light)
      : el('span', { class: small ? 'mini-reward' : 'sticker', style: famStyle(family), 'aria-hidden': 'true' }, r.emoji);
    if (small) return el('span', { class: 'mini-flower', role: 'img', 'aria-label': activity.label, title: activity.label }, symbol);
    return el('figure', { class: 'flower', style: { '--i': String(index || 0) } }, symbol,
      el('figcaption', null, el('span', { class: 'emoji', 'aria-hidden': 'true' }, activity.emoji), el('span', { class: 'flower-label' }, activity.label)));
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
      el('div', { class: 'garden-title' },
        el('div', { class: 'buddy' }, sproutSvg(todays.length ? 'cheer' : 'wave')),
        el('h1', null, isFlower() ? (name ? `${name}'s garden` : 'My garden') : (name ? `${name}'s rewards` : 'My rewards'))),
      el('section', { class: 'garden-scene', 'aria-labelledby': 'garden-today' },
        el('span', { class: 'sun', 'aria-hidden': 'true' }),
        el('span', { class: 'cloud cloud-1', 'aria-hidden': 'true' }),
        el('span', { class: 'cloud cloud-2', 'aria-hidden': 'true' }),
        el('h2', { id: 'garden-today' }, 'Today'),
        todays.length
          ? el('div', { class: 'flowers' }, todays.map((e, i) => flowerFor(e, families, false, i)))
          : el('p', { class: 'waiting' }, isFlower() ? 'Your garden is waiting for its first flower! 🌱' : `Your first ${reward().one} is waiting! 🌱`),
        el('div', { class: 'grass', 'aria-hidden': 'true' })),
      el('section', { class: 'garden-box' },
        el('h2', null, 'This week'),
        el('ul', { class: 'week' }, week)),
      el('p', { class: 'total' }, `${reward().emoji} ${countOf(total)} ${isFlower() ? 'grown ' : ''}so far`));
  }

  // ---------- Grown-ups (placeholder until Task 5 registers the real view) ----------
  function grownupsView() {
    return el('section', { class: 'view grownups' }, el('p', { class: 'placeholder' }, 'Grown-up corner — coming next.'));
  }

  // ---------- render ----------
  const banner = document.getElementById('banner');
  const app = document.getElementById('app');
  const announce = document.getElementById('announce');
  const gardenTab = document.querySelector('.tabs a[href="#garden"]');
  let renderedView = null; // animations (Sprout's wave, flowers growing) play only when the view changes
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
    app.toggleAttribute('data-animate', view !== renderedView);
    renderedView = view;
    app.replaceChildren((views[view] || builders[view])());
    if (gardenTab) {
      gardenTab.replaceChildren(el('span', { class: 'tab-icon', 'aria-hidden': 'true' }, isFlower() ? '🌷' : reward().emoji),
        isFlower() ? ' My Garden' : ' My Rewards');
    }
    for (const link of document.querySelectorAll('.tabs a')) {
      if (link.getAttribute('href') === '#' + view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    document.body.dataset.ready = '1';
  }

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
