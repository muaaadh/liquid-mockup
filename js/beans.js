/* The bean field. Every coffee in the range is one painted bean, and the beans are
 * real buttons, so the same 46 elements serve mouse, touch, keyboard and screen reader.
 * A layout is just a function that returns where each bean should go.
 */
(() => {
  'use strict';

  const coffees = window.LIQUID_COFFEES;
  const mapMeta = window.LIQUID_MAP;
  const stage = document.getElementById('stage');
  const field = document.getElementById('beans');
  const marks = document.getElementById('marks');
  const map = document.getElementById('map');
  const tip = document.getElementById('tip');
  const card = document.getElementById('card');
  const $ = (id) => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PLACES = {
    Brazil: [-12, -51], Colombia: [4, -74], 'Costa Rica': [10, -84], Guatemala: [15.5, -90.5], Mexico: [20, -101],
    Nicaragua: [13, -85.5], Kenya: [0, 38], Ethiopia: [9, 40], Uganda: [1.5, 32.5], India: [15, 77],
    Indonesia: [-2, 114], China: [25, 102],
  };
  const REGION = {
    Brazil: 'Latin America', Colombia: 'Latin America', 'Costa Rica': 'Latin America', Guatemala: 'Latin America',
    Mexico: 'Latin America', Nicaragua: 'Latin America', Kenya: 'Africa', Ethiopia: 'Africa', Uganda: 'Africa',
    India: 'Asia', Indonesia: 'Asia', China: 'Asia',
  };
  const SPECIES = [
    { key: 'Arabica', note: 'Oval, with an S-shaped crease. Grows high, tastes soft and aromatic.' },
    { key: 'Arabica and Robusta', note: 'Blended for body and crema.' },
    { key: 'Robusta', note: 'Round, with a straight crease. Grows low, with more caffeine.' },
    { key: null, label: 'Not in the catalogue', note: 'Ask at the boutique.' },
  ];
  const PLACE_LABEL = { Mexico: 'west', Guatemala: 'west', Nicaragua: 'west', 'Costa Rica': 'west', Colombia: 'west', Brazil: 'east', Ethiopia: 'above', China: 'above', Uganda: 'left' };
  const CUPS = { 25: 'Ristretto', 40: 'Espresso', 110: 'Lungo', 150: 'Gran lungo', 230: 'Mug' };

  /* Same absorption as the painted assets, so the meter is the same coffee. */
  function coffeeColour(density) {
    const k = [.74, 1, 1.3].map((c) => Math.round(Math.exp(-c * density) * 255));
    return `rgb(${k[0]},${k[1]},${k[2]})`;
  }

  function seeded(n) {
    let s = n >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  /* ---------- build ---------- */
  const beans = coffees.map((c, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'bean';
    el.tabIndex = i === 0 ? 0 : -1;
    const bits = [c.name, c.intensity ? `intensity ${c.intensity}` : null, c.line].filter(Boolean);
    el.setAttribute('aria-label', bits.join(', '));
    const wrap = document.createElement('span');
    const img = document.createElement('img');
    img.alt = '';
    // One dropped request on a busy connection should not leave a hole in the field.
    img.addEventListener('error', () => {
      const tries = Number(img.dataset.tries || 0);
      if (tries >= 4) return;
      img.dataset.tries = tries + 1;
      setTimeout(() => { img.src = img.dataset.src; }, 500 * (tries + 1));
    });
    img.decoding = 'async';
    img.draggable = false;
    img.dataset.src = `assets/beans/${c.id}-s.webp`;
    wrap.append(img);
    el.append(wrap);
    field.append(el);
    const rnd = seeded(i * 97 + 13);
    const b = { c, el, wrap, img, x: 0, y: 0, r: rnd() * 90 - 45, s: 1, jitter: rnd(), nx: 0, ny: 0, shown: true, order: i };
    el.addEventListener('click', () => select(b));
    el.addEventListener('pointerenter', () => showTip(b));
    el.addEventListener('pointerleave', hideTip);
    el.addEventListener('focus', () => { if (!selected) showTip(b); });
    el.addEventListener('blur', hideTip);
    return b;
  });
  $('beanCount').textContent = coffees.length;

  /* ---------- geometry ---------- */
  let W = 0, H = 0, size = 72, narrow = false;
  function measure() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    narrow = W < 760;
    size = Math.max(42, Math.min(100, Math.sqrt(W * H / coffees.length) * .56));
  }

  /* Push overlapping beans apart so piles look poured, not gridded. */
  function relax(list, keepInside = true, rounds = 40) {
    const pad = 8;
    for (let k = 0; k < rounds; k++) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const min = (a.s + b.s) * size * .43;
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy) || .01;
        if (d < min) {
          const push = (min - d) / 2 / d;
          dx *= push; dy *= push;
          a.x -= dx; a.y -= dy; b.x += dx; b.y += dy;
        }
      }
      if (keepInside) for (const b of list) {
        const m = b.s * size * .5 + pad;
        b.x = Math.max(m, Math.min(W - m, b.x));
        b.y = Math.max(m, Math.min(H - m, b.y));
      }
    }
  }

  function spiral(list, cx, cy, gap) {
    list.forEach((b, i) => {
      const r = gap * Math.sqrt(i + .4), th = i * 2.39996;
      b.x = cx + Math.cos(th) * r;
      b.y = cy + Math.sin(th) * r * .92;
    });
  }

  function label(x, y, title, note, align = 'center') {
    const d = document.createElement('div');
    d.className = 'mark';
    d.style.cssText = `left:${x}px;top:${y}px;--align:${align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0'};text-align:${align}`;
    d.innerHTML = `<b>${title}</b>${note ? `<span>${note}</span>` : ''}`;
    marks.append(d);
  }

  const LAYOUT = {
    scatter(list) {
      const rnd = seeded(7);
      const cols = Math.ceil(Math.sqrt(list.length * W / H));
      const rows = Math.ceil(list.length / cols);
      const cw = W / cols, ch = H / rows;
      list.forEach((b, i) => {
        const k = (i * 29) % list.length;
        b.x = ((k % cols) + .2 + rnd() * .6) * cw;
        b.y = (Math.floor(k / cols) + .2 + rnd() * .6) * ch;
        b.s = .86 + b.jitter * .42;
        b.rot = b.r + 25 * Math.sin(i);
      });
      relax(list);
    },

    intensity(list) {
      const levels = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 'milk'];
      if (narrow) {
        // A phone is tall, so the same chart runs down the screen.
        const rowH = (H - 8) / levels.length, gutter = 44;
        const unit = Math.min(rowH * 1.02, (W - gutter - 8) / 9.4);
        levels.forEach((lv, ri) => {
          const y = 4 + rowH * (ri + .5);
          const inRow = list.filter((b) => (lv === 'milk' ? !b.c.intensity : b.c.intensity === lv));
          inRow.forEach((b, i) => {
            b.s = unit / size * 1.04;
            b.x = gutter + unit * .5 + i * unit * .9;
            b.y = y + (i % 2 ? 1 : -1) * rowH * .04;
            b.rot = 90 + (b.jitter - .5) * 34;
          });
          label(0, y - 10, lv === 'milk' ? 'Milk' : String(lv), '', 'left');
        });
        return;
      }
      const left = W * .04, usable = W - left * 2;
      const col = usable / levels.length;
      const base = H - 64;
      const unit = Math.min(col * 1.04, (base - 16) / 9.4, size * .96);
      levels.forEach((lv, ci) => {
        const x = left + col * (ci + .5);
        const inCol = list.filter((b) => (lv === 'milk' ? !b.c.intensity : b.c.intensity === lv));
        inCol.forEach((b, i) => {
          b.s = unit / size * 1.05;
          b.x = x + (i % 2 ? 1 : -1) * col * .05;
          b.y = base - unit * .5 - i * unit * .88;
          b.rot = (b.jitter - .5) * 34;
        });
        label(x, base + 12, lv === 'milk' ? 'For milk' : String(lv), '');
      });
      label(left, 4, 'Intensity, light to dark', '', 'left');
    },

    species(list) {
      const groups = SPECIES.map((g) => ({ ...g, items: list.filter((b) => b.c.species === g.key) })).filter((g) => g.items.length);
      const spots = narrow
        ? [[.5, .27], [.27, .69], [.73, .63], [.76, .88]]
        : [[.25, .44], [.61, .44], [.83, .32], [.84, .72]];
      const gap = size * (narrow ? .46 : .54);
      groups.forEach((g) => {
        const slot = SPECIES.findIndex((s) => s.key === g.key);
        const [cx, cy] = spots[slot];
        g.items.forEach((b) => { b.s = 1; b.rot = (b.jitter - .5) * 70; });
        spiral(g.items, cx * W, cy * H, gap);
        relax(g.items, false, 20);
        const bottom = Math.max(...g.items.map((b) => b.y)) + size * .62;
        label(cx * W, Math.min(bottom, H - 56), g.label || g.key, narrow ? '' : g.note);
      });
      relax(list, true, 6);
    },

    origin(list) {
      const known = list.filter((b) => b.c.origin.length);
      const unknown = list.filter((b) => !b.c.origin.length);
      if (narrow) {
        const rows = ['Latin America', 'Africa', 'Asia'];
        const spots = { 'Latin America': [.5, .3], Africa: [.28, .72], Asia: [.72, .72] };
        rows.forEach((name) => {
          const items = known.filter((b) => REGION[b.c.origin[0]] === name);
          const [cx, cy] = spots[name];
          items.forEach((b) => { b.s = .85; b.rot = (b.jitter - .5) * 70; });
          spiral(items, cx * W, cy * H, size * .4);
          relax(items, false, 20);
          label(cx * W, Math.min(Math.max(...items.map((b) => b.y), 0) + size * .55, H - 30), name, '');
        });
        relax(known, true, 6);
      } else {
        const box = mapBox();
        const countries = {};
        for (const b of known) (countries[b.c.origin[0]] ||= []).push(b);
        for (const [name, items] of Object.entries(countries)) {
          const [lat, lon] = PLACES[name];
          const x = box.x + (lon - mapMeta.lon0) / (mapMeta.lon1 - mapMeta.lon0) * box.w;
          const y = box.y + (mapMeta.lat1 - lat) / (mapMeta.lat1 - mapMeta.lat0) * box.h;
          items.forEach((b) => { b.s = .54; b.rot = (b.jitter - .5) * 70; });
          spiral(items, x, y, size * .27);
        }
        relax(known, true, 26);
        // Central America is tight, so its names stack down the Pacific side with a
        // minimum gap. Everywhere else a name sits clear of its own pile.
        const west = [];
        for (const [name, items] of Object.entries(countries)) {
          const xs = items.map((b) => b.x), ys = items.map((b) => b.y);
          const cx = xs.reduce((n, v) => n + v, 0) / xs.length, cy = ys.reduce((n, v) => n + v, 0) / ys.length;
          const side = PLACE_LABEL[name] || 'below';
          if (side === 'west') west.push({ name, x: Math.min(...xs) - size * .34, y: cy });
          else if (side === 'left') label(Math.min(...xs) - size * .3, cy - 10, name, '', 'right');
          else if (side === 'east') label(Math.max(...xs) + size * .34, cy - 10, name, '', 'left');
          else if (side === 'above') label(cx, Math.min(...ys) - size * .54, name, '');
          else label(cx, Math.max(...ys) + size * .28, name, '');
        }
        west.sort((a, b) => a.y - b.y);
        const left = Math.min(...west.map((w) => w.x));
        west.forEach((w, i) => {
          if (i) w.y = Math.max(w.y, west[i - 1].y + 22);
          label(left, w.y - 10, w.name, '', 'right');
        });
      }
      unknown.forEach((b, i) => {
        b.s = narrow ? .8 : .54;
        b.rot = (b.jitter - .5) * 70;
        b.x = W - size * (1 + i * .7);
        b.y = H - size * (narrow ? .55 : .95);
      });
      if (unknown.length && !narrow) label(W - size * 1.6, H - size * .55, 'Not in the catalogue', '');
    },
  };

  function mapBox() {
    const ar = 2000 / 733;
    let w = W, h = W / ar;
    if (h > H) { h = H; w = H * ar; }
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }

  /* ---------- state ---------- */
  let mode = 'scatter', line = 'all', selected = null, started = false;

  function place(b, delay = 0) {
    b.el.style.transitionDelay = `${delay}ms`;
    b.el.style.transform = `translate3d(${b.x - size / 2}px,${b.y - size / 2}px,0) rotate(${b.rot || 0}deg) scale(${b.s})`;
  }

  function arrange({ stagger = true } = {}) {
    measure();
    field.style.setProperty('--size', `${size}px`);
    marks.textContent = '';
    const list = beans.filter((b) => line === 'all' || b.c.line === line);
    beans.forEach((b) => {
      b.shown = list.includes(b);
      b.el.classList.toggle('gone', !b.shown);
      b.el.tabIndex = -1;
    });
    if (list[0]) list[0].el.tabIndex = 0;
    LAYOUT[mode](list);
    map.classList.toggle('on', mode === 'origin' && !narrow);
    if (mode === 'origin' && !narrow) {
      const box = mapBox();
      map.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px`;
    }
    list.forEach((b, i) => place(b, stagger && !reduced ? (i * 11) % 240 : 0));
    stage.dataset.mode = mode;
  }

  /* The first time the field comes into view, the beans are poured onto the paper. */
  function pour() {
    if (started) return;
    started = true;
    for (const b of beans) b.img.src = b.img.dataset.src;
    measure();
    field.style.setProperty('--size', `${size}px`);
    if (reduced) { arrange({ stagger: false }); stage.classList.add('poured'); return; }
    beans.forEach((b, i) => {
      b.el.style.transition = 'none';
      const a = (i / beans.length) * 6.28;
      b.el.style.transform = `translate3d(${W / 2 - size / 2 + Math.cos(a) * 30}px,${-size * 3 - b.jitter * 260}px,0) rotate(${b.r * 3}deg) scale(.7)`;
    });
    field.getBoundingClientRect();
    beans.forEach((b) => { b.el.style.transition = ''; });
    stage.classList.add('poured');
    arrange();
  }

  /* ---------- tip ---------- */
  function showTip(b) {
    if (selected || matchMedia('(hover: none)').matches) return;
    tip.textContent = b.c.name;
    tip.style.transform = `translate(${b.x}px,${b.y - b.s * size * .62}px) translate(-50%,-100%)`;
    tip.classList.add('on');
    b.el.classList.add('near');
  }
  function hideTip() {
    tip.classList.remove('on');
    beans.forEach((b) => b.el.classList.remove('near'));
  }

  /* ---------- the card ---------- */
  function cupText(c) {
    return c.cups.map((ml) => `${CUPS[ml]} ${ml} ml`).join(', ');
  }

  function fill(c) {
    $('cName').textContent = c.name;
    $('cDesc').textContent = c.desc;
    const cap = $('cCapsule');
    cap.src = `assets/capsules/${c.id}.webp`;
    cap.alt = `${c.name} capsule`;
    cap.classList.toggle('vertuo', c.line === 'Vertuo');

    const meter = $('cMeter');
    meter.textContent = '';
    if (c.intensity) {
      const row = document.createElement('div');
      row.className = 'ticks';
      for (let i = 1; i <= 13; i++) {
        const t = document.createElement('i');
        if (i <= c.intensity) t.style.background = coffeeColour(.25 + i * .22);
        t.style.setProperty('--n', i);
        row.append(t);
      }
      const words = document.createElement('span');
      words.textContent = `Intensity ${c.intensity} of 13`;
      meter.append(row, words);
    } else {
      const words = document.createElement('span');
      words.textContent = 'Made for milk';
      meter.append(words);
    }

    const facts = [
      ['Species', c.species_note || c.species],
      ['Origin', c.origin.length ? c.origin.join(', ') : null],
      ['Notes', c.notes.join(', ')],
      ['Treated', c.process],
      ['Cup', cupText(c)],
      ['Range', `${c.line}, ${c.range}`],
    ].filter(([, v]) => v);
    const dl = $('cFacts');
    dl.textContent = '';
    for (const [k, v] of facts) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      dl.append(dt, dd);
    }
    $('cPrice').textContent = `MVR ${c.price} for a sleeve of 10`;
  }

  function focusSpot() {
    return narrow ? { x: W / 2, y: H * .2, s: Math.min(3.8, H * .32 / size) } : { x: W * .29, y: H * .52, s: Math.min(5.2, H * .62 / size) };
  }

  function select(b) {
    if (selected === b) return;
    hideTip();
    const first = !selected;
    if (selected) release(selected);
    selected = b;
    stage.classList.add('focus');
    fill(b.c);
    card.hidden = false;
    b.el.classList.add('picked');
    b.el.setAttribute('aria-pressed', 'true');

    // Swap to the large painting before it grows, so it never looks soft.
    const big = new Image();
    big.onload = () => { if (selected === b) b.img.src = big.src; };
    big.src = `assets/beans/${b.c.id}.webp`;

    const f = focusSpot();
    b.el.style.transitionDelay = '0ms';
    b.el.style.transform = `translate3d(${f.x - size / 2}px,${f.y - size / 2}px,0) rotate(${(b.jitter - .5) * 16}deg) scale(${f.s})`;

    const r = stage.getBoundingClientRect();
    const tone = Math.min(1, ((b.c.intensity || 7) - 2) / 11 + .15);
    if (window.Wet) window.Wet.bloom(r.left + f.x, r.top + f.y, { reach: narrow ? .1 : .17, ink: .16 + tone * .14, tone: .3 + tone * .4, push: first ? 200 : 130 });
    if (first) stage.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }

  function release(b) {
    b.el.classList.remove('picked');
    b.el.removeAttribute('aria-pressed');
    b.img.src = b.img.dataset.src;
    place(b);
  }

  function close() {
    if (!selected) return;
    const b = selected;
    release(b);
    selected = null;
    stage.classList.remove('focus');
    card.hidden = true;
    b.el.tabIndex = 0;
    b.el.focus({ preventScroll: true });
  }

  function step(dir) {
    const list = beans.filter((b) => b.shown).sort((p, q) => (p.c.intensity || 14) - (q.c.intensity || 14) || p.order - q.order);
    const i = list.indexOf(selected);
    select(list[(i + dir + list.length) % list.length]);
  }

  $('cPrev').addEventListener('click', () => step(-1));
  $('cNext').addEventListener('click', () => step(1));
  $('cClose').addEventListener('click', close);
  stage.addEventListener('click', (e) => {
    if (selected && !e.target.closest('.bean, .card')) close();
  });

  /* Arrow keys move through the beans, so the field is one tab stop, not 46. */
  field.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const list = beans.filter((b) => b.shown);
    const i = list.findIndex((b) => b.el === document.activeElement);
    const next = list[(i + dir + list.length) % list.length];
    beans.forEach((b) => { b.el.tabIndex = -1; });
    next.el.tabIndex = 0;
    next.el.focus({ preventScroll: true });
  });
  addEventListener('keydown', (e) => {
    if (!selected) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight' && !field.contains(document.activeElement)) step(1);
    if (e.key === 'ArrowLeft' && !field.contains(document.activeElement)) step(-1);
  });

  /* ---------- controls ---------- */
  function press(group, btn) {
    group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
  }
  document.querySelectorAll('.controls .seg').forEach((g) => g.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    press(g, btn);
    if (selected) { release(selected); selected = null; stage.classList.remove('focus'); card.hidden = true; }
    if (btn.dataset.mode) mode = btn.dataset.mode;
    if (btn.dataset.line) line = btn.dataset.line;
    arrange();
  }));

  /* ---------- the cursor stirs the beans ---------- */
  let stirX = -9999, stirY = 0, stirring = false;
  function stir() {
    let moving = false;
    for (const b of beans) {
      let tx = 0, ty = 0;
      if (b.shown && !selected) {
        const dx = b.x - stirX, dy = b.y - stirY, d = Math.hypot(dx, dy), reach = size * 2.2;
        if (d < reach && d > 1) {
          const f = (1 - d / reach) ** 2 * size * .34;
          tx = dx / d * f; ty = dy / d * f;
        }
      }
      b.nx += (tx - b.nx) * .16;
      b.ny += (ty - b.ny) * .16;
      if (Math.abs(b.nx - tx) + Math.abs(b.ny - ty) > .05) moving = true;
      b.wrap.style.transform = `translate(${b.nx.toFixed(2)}px,${b.ny.toFixed(2)}px)`;
    }
    stirring = moving;
    if (moving) requestAnimationFrame(stir);
  }
  if (!reduced) {
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = stage.getBoundingClientRect();
      stirX = e.clientX - r.left;
      stirY = e.clientY - r.top;
      if (!stirring) { stirring = true; requestAnimationFrame(stir); }
    }, { passive: true });
    stage.addEventListener('pointerleave', () => {
      stirX = -9999;
      if (!stirring) { stirring = true; requestAnimationFrame(stir); }
    });
  }

  /* ---------- lifecycle ---------- */
  new IntersectionObserver((entries, io) => {
    if (entries.some((e) => e.isIntersecting)) { pour(); io.disconnect(); }
  }, { threshold: .22 }).observe(stage);

  let lastW = 0;
  addEventListener('resize', () => {
    if (!started || stage.clientWidth === lastW) return;
    lastW = stage.clientWidth;
    if (selected) { release(selected); selected = null; stage.classList.remove('focus'); card.hidden = true; }
    arrange({ stagger: false });
  });
})();
