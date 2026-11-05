/* The bean explorer: a labelled grid of painted beans beside one detail panel.
 * Beans run light to dark, so the grid reads as a roast scale with no controls at all.
 * On a phone the panel becomes a bottom sheet.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const grid = $('grid'), detail = $('detail'), scrim = $('scrim'), empty = $('empty'), note = $('typeNote');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(max-width: 759px)');

  const NOTES = {
    all: 'Oval beans are Arabica, round beans are Robusta, and a pair is a blend of both.',
    Arabica: 'Oval, with an S-shaped crease. Grows high, and tastes soft and aromatic.',
    Robusta: 'Round, with a straight crease. Grows low, and carries more caffeine.',
    'Arabica and Robusta': 'Arabica and Robusta together, for more body and crema.',
  };
  const CUPS = { 25: 'Ristretto 25 ml', 40: 'Espresso 40 ml', 110: 'Lungo 110 ml', 150: 'Gran lungo 150 ml', 230: 'Mug 230 ml' };

  /* Same absorption as the painted assets, so the meter is the same coffee. */
  const coffeeColour = (density) => {
    const k = [.74, 1, 1.3].map((c) => Math.round(Math.exp(-c * density) * 255));
    return `rgb(${k[0]},${k[1]},${k[2]})`;
  };

  /* Lightest first. Coffees made for milk have no printed intensity, so they close the list. */
  const order = window.LIQUID_COFFEES
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.intensity ?? 99) - (b.c.intensity ?? 99) || a.i - b.i);

  const items = order.map(({ c }, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'bean';
    el.tabIndex = -1;
    el.setAttribute('aria-pressed', 'false');
    el.setAttribute('aria-label', [c.name, c.intensity ? `intensity ${c.intensity}` : 'for milk', c.line].join(', '));
    el.style.setProperty('--tilt', `${(((i * 37) % 23) - 11)}deg`);
    el.innerHTML = `<img src="assets/beans/${c.id}-s.webp" alt="" width="84" height="84" loading="lazy" decoding="async">`
      + `<b>${c.name}</b><small>${c.intensity ? `Intensity ${c.intensity}` : 'For milk'}</small>`;
    grid.append(el);
    const item = { c, el };
    el.addEventListener('click', () => choose(item));
    return item;
  });

  /* ---------- the panel ---------- */
  let current = null;

  function fill(c) {
    $('dBean').src = `assets/beans/${c.id}.webp`;
    $('dBean').alt = `${c.name} bean, painted in coffee`;
    $('dCapsule').src = `assets/capsules/${c.id}.webp`;
    $('dCapsule').alt = `${c.name} capsule`;
    $('dName').textContent = c.name;
    $('dDesc').textContent = c.desc;

    const meter = $('dMeter');
    meter.textContent = '';
    if (c.intensity) {
      const row = document.createElement('div');
      row.className = 'ticks';
      row.setAttribute('aria-hidden', 'true');
      for (let i = 1; i <= 13; i++) {
        const t = document.createElement('i');
        if (i <= c.intensity) t.style.background = coffeeColour(.25 + i * .22);
        row.append(t);
      }
      meter.append(row);
    }
    const words = document.createElement('span');
    words.textContent = c.intensity ? `Intensity ${c.intensity} of 13` : 'Made for milk';
    meter.append(words);

    const dl = $('dFacts');
    dl.textContent = '';
    for (const [k, v] of [
      ['Bean', c.species_note || c.species],
      ['Origin', c.origin.join(', ')],
      ['Notes', c.notes.join(', ')],
      ['Process', c.process],
      ['Cup', c.cups.map((ml) => CUPS[ml]).join(', ')],
      ['Machine', c.line],
    ]) {
      if (!v) continue;
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
    $('dPrice').textContent = `MVR ${c.price} for a sleeve of 10`;
    $('dStatus').textContent = `${c.name}. ${c.desc}. ${words.textContent}. MVR ${c.price}.`;
  }

  function mark(item) {
    if (current) current.el.setAttribute('aria-pressed', 'false');
    current = item;
    if (item) {
      item.el.setAttribute('aria-pressed', 'true');
      setStop(item);
    }
  }

  function choose(item) {
    mark(item);
    fill(item.c);
    if (!reduced) $('dBody').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' });
    if (phone.matches) openSheet();
  }

  /* ---------- the phone sheet ---------- */
  function openSheet() {
    detail.classList.add('open');
    detail.setAttribute('role', 'dialog');
    detail.setAttribute('aria-modal', 'true');
    scrim.hidden = false;
    document.documentElement.classList.add('locked');
    $('dClose').focus({ preventScroll: true });
  }

  function closeSheet() {
    if (!detail.classList.contains('open')) return;
    detail.classList.remove('open');
    detail.removeAttribute('role');
    detail.removeAttribute('aria-modal');
    scrim.hidden = true;
    document.documentElement.classList.remove('locked');
    const back = current;
    if (back) back.el.focus({ preventScroll: true });
    mark(null);
  }

  $('dClose').addEventListener('click', closeSheet);
  scrim.addEventListener('click', closeSheet);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  phone.addEventListener('change', () => {
    closeSheet();
    if (!phone.matches) settle();
  });

  /* ---------- filters ---------- */
  let species = 'all', line = 'all';

  const fits = ({ c }) => (species === 'all' || c.species === species) && (line === 'all' || c.line === line);

  function setStop(item) {
    items.forEach((i) => { i.el.tabIndex = -1; });
    item.el.tabIndex = 0;
  }

  /* On a wide screen the panel is always showing something from the current list. */
  function settle() {
    const shown = items.filter(fits);
    if (phone.matches || !shown.length) return;
    if (!current || !shown.includes(current)) {
      mark(shown[0]);
      fill(shown[0].c);
    }
  }

  function apply() {
    const before = new Map();
    if (!reduced) for (const i of items) if (!i.el.hidden) before.set(i, i.el.getBoundingClientRect());

    const shown = items.filter(fits);
    for (const i of items) i.el.hidden = !shown.includes(i);
    empty.hidden = shown.length > 0;
    note.textContent = NOTES[species];
    setStop(shown.includes(current) ? current : (shown[0] || items[0]));

    // Beans glide to their new places instead of jumping.
    if (!reduced) for (const i of shown) {
      const a = before.get(i), b = i.el.getBoundingClientRect();
      if (a) {
        const dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) i.el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.75,.15,1)' });
      } else {
        i.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
      }
    }
    settle();
  }

  function press(group, btn) {
    group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
  }

  document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    press(g, btn);
    if (btn.dataset.species) species = btn.dataset.species;
    if (btn.dataset.line) line = btn.dataset.line;
    apply();
  }));

  $('reset').addEventListener('click', () => {
    species = 'all';
    line = 'all';
    document.querySelectorAll('.seg').forEach((g) => press(g, g.querySelector('button')));
    apply();
  });

  /* Arrow keys walk the grid, so 46 beans are one tab stop. */
  grid.addEventListener('keydown', (e) => {
    const shown = items.filter(fits);
    const at = shown.findIndex((i) => i.el === document.activeElement);
    if (at < 0) return;
    const top = shown[0].el.offsetTop;
    const cols = shown.filter((i) => i.el.offsetTop === top).length;
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (!move) return;
    e.preventDefault();
    const next = shown[Math.max(0, Math.min(shown.length - 1, at + move))];
    setStop(next);
    next.el.focus();
  });

  apply();
  if (phone.matches) fill(items[0].c);
})();
