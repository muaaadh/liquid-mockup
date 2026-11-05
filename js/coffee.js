/* The coffee explorer: a labelled grid of real capsules beside one detail panel.
 * Capsules run light to dark. On phones and short screens the panel opens in a
 * native dialog, which brings focus trapping, Escape and the top layer for free.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const grid = $('grid'), detail = $('detail'), sheet = $('sheet'), body = $('dBody');
  const empty = $('empty'), note = $('typeNote'), status = $('dStatus');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia('(max-width: 759px), (max-height: 500px)');

  const NOTES = {
    all: 'Arabica is soft and aromatic. Robusta is stronger, with more caffeine. Blends use both.',
    Arabica: 'Grows high, and tastes soft and aromatic.',
    Robusta: 'Grows low, and carries more caffeine.',
    'Arabica and Robusta': 'Arabica and Robusta together, for more body and crema.',
  };
  const CUPS = { 25: 'Ristretto 25 ml', 40: 'Espresso 40 ml', 110: 'Lungo 110 ml', 150: 'Gran lungo 150 ml', 230: 'Mug 230 ml' };
  const pod = (c, size = '') => `assets/pods/${c.id}${size}.webp`;

  /* Same absorption as the painted artwork, so the meter is the same coffee. */
  const coffeeColour = (density) => {
    const k = [.74, 1, 1.3].map((c) => Math.round(Math.exp(-c * density) * 255));
    return `rgb(${k[0]},${k[1]},${k[2]})`;
  };

  /* Lightest first. Coffees made for milk have no printed intensity, so they close the list. */
  const items = window.LIQUID_COFFEES
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.intensity ?? 99) - (b.c.intensity ?? 99) || a.i - b.i)
    .map(({ c }) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pod';
      el.setAttribute('aria-pressed', 'false');
      el.setAttribute('aria-label', [c.name, c.intensity ? `intensity ${c.intensity}` : 'for milk', c.line].join(', '));
      el.innerHTML = `<img src="${pod(c, '-s')}" alt="" width="96" height="96" loading="lazy" decoding="async">`
        + `<b>${c.name}</b><small>${c.intensity ? `Intensity ${c.intensity}` : 'For milk'}</small>`;
      grid.append(el);
      const item = { c, el };
      el.addEventListener('click', () => choose(item));
      return item;
    });

  /* ---------- the panel ---------- */
  let current = null;

  function fill(c) {
    $('dPod').src = pod(c);
    $('dPod').alt = `${c.name} capsule`;
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
      ['Bean', c.species_note || c.species || (c.line === 'Professional' ? null : 'Not in the catalogue')],
      ['Origin', c.origin.join(', ')],
      ['Notes', c.notes.join(', ')],
      ['Process', c.process],
      ['Cup', c.cups.map((ml) => CUPS[ml] || `${ml} ml`).join(', ')],
      ['Machine', c.line],
    ]) {
      if (!v) continue;
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
    $('dPrice').textContent = c.price_text || `MVR ${c.price} for a sleeve of 10`;
    status.textContent = `${c.name}. ${c.desc}. ${words.textContent}.`;
  }

  function mark(item) {
    if (current) current.el.setAttribute('aria-pressed', 'false');
    current = item;
    if (item) item.el.setAttribute('aria-pressed', 'true');
  }

  function choose(item) {
    mark(item);
    fill(item.c);
    if (!reduced) body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    if (narrow.matches) openSheet();
  }

  /* ---------- the sheet ---------- */
  function openSheet() {
    if (sheet.open) return;
    sheet.append(body);
    sheet.showModal();
    document.documentElement.classList.add('locked');
  }

  sheet.addEventListener('close', () => {
    detail.append(body);
    document.documentElement.classList.remove('locked');
    if (narrow.matches) mark(null);
  });
  $('dClose').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

  /* Rotating keeps the chosen coffee: it moves to the side panel, or waits for a tap. */
  narrow.addEventListener('change', () => {
    if (narrow.matches) mark(null);
    else {
      const keep = current;
      if (sheet.open) sheet.close();
      if (keep) { mark(keep); fill(keep.c); } else settle();
    }
  });

  /* ---------- filters ---------- */
  let species = 'all', line = 'all';
  const fits = ({ c }) => (species === 'all' || c.species === species) && (line === 'all' || c.line === line);

  /* On a wide screen the panel always shows something from the current list. */
  function settle() {
    const shown = items.filter(fits);
    if (narrow.matches || !shown.length) return;
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
    status.textContent = shown.length ? `${shown.length} coffees shown.` : empty.firstChild.textContent;

    // Capsules glide to their new places instead of jumping.
    if (!reduced) for (const i of shown) {
      const a = before.get(i), b = i.el.getBoundingClientRect();
      if (a) {
        const dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) i.el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.75,.15,1)' });
      } else {
        i.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease-out' });
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
    document.querySelector('.seg button').focus();
  });

  apply();
  if (narrow.matches) fill(items[0].c);
})();
