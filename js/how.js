/* How it works: one cutaway machine driven by a single clock.
 * render(t) is a pure function of time, so the loop, the step buttons and the
 * reduced-motion view are all the same drawing at different moments.
 */
(() => {
  'use strict';

  const root = document.getElementById('how');
  if (!root) return;
  const $ = (id) => root.querySelector(`#${id}`);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Step start times in seconds, and the length of one full cycle. */
  const STEPS = [0, 2.5, 5.1, 7, 11.2];
  const LOOP = 15.2;

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const out = (p) => 1 - (1 - p) ** 3;
  const inn = (p) => p * p * p;
  const both = (p) => (p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
  const mix = (a, b, p) => a + (b - a) * p;

  const lever = $('hLever'), capsule = $('hCapsule'), spikes = $('hSpikes');
  const tank = $('hTank'), led = $('hLed'), heatGlow = $('hHeatGlow'), coil = $('hCoil');
  const cold = $('hCold'), coldFlow = $('hColdFlow'), hot = $('hHot'), hotFlow = $('hHotFlow');
  const chan = $('hChan'), needle = $('hNeedle'), bars = $('hBars');
  const stream = $('hStream'), liquid = $('hLiquid'), crema = $('hCrema'), steam = $('hSteam');
  const used = $('hUsed');
  const buttons = [...root.querySelectorAll('.how-steps button')];

  const lenCold = cold.getTotalLength(), lenHot = hot.getTotalLength(), lenChan = chan.getTotalLength();
  for (const [p, l] of [[cold, lenCold], [hot, lenHot], [chan, lenChan]]) p.style.strokeDasharray = `${l}`;

  const CUP_FLOOR = 584, CUP_TOP = 506;

  function render(t) {
    // The lever opens to load, and again to eject.
    const open = Math.max(
      out(seg(t, .1, .8)) * (1 - both(seg(t, 1.7, 2.4))),
      out(seg(t, 11.3, 12)) * (1 - both(seg(t, 12.8, 13.5))),
    );
    lever.setAttribute('transform', `rotate(${(-58 * open).toFixed(2)} 590 84)`);

    // Capsule: falls in, sits clamped, shivers under pressure, then drops to the bin.
    const fall = inn(seg(t, .7, 1.55));
    const eject = inn(seg(t, 11.9, 12.7));
    const inPlace = t < 11.9;
    const shake = t > 5.9 && t < 10.8 ? Math.sin(t * 55) * .7 : 0;
    const y = inPlace ? mix(-96, 196, fall) : mix(196, 528, eject);
    const x = 636 + shake - (inPlace ? 0 : eject * 30);
    const rot = inPlace ? 0 : eject * 72;
    capsule.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rot.toFixed(1)})`);
    capsule.style.opacity = t < .55 || t > 12.72 ? 0 : 1;
    used.style.opacity = t > 12.68 && t < 14.9 ? 1 : 0;

    // Water leaves the tank, heats, and is forced through.
    const led1 = seg(t, 2.5, 2.8) * (1 - seg(t, 10.8, 11.2));
    led.style.opacity = .22 + .78 * led1;
    const coldP = both(seg(t, 2.8, 3.9)) * (1 - seg(t, 10.9, 11.5));
    cold.style.strokeDashoffset = lenCold * (1 - coldP);
    coldFlow.style.opacity = coldP > .98 && t < 10.8 ? .9 : 0;
    coldFlow.style.strokeDashoffset = -t * 46;

    const heat = seg(t, 3.5, 4.9) * (1 - seg(t, 10.9, 12.4));
    heatGlow.style.opacity = heat;
    coil.style.stroke = `rgb(${Math.round(mix(120, 255, heat))},${Math.round(mix(104, 140, heat))},${Math.round(mix(90, 40, heat))})`;

    const hotP = both(seg(t, 5.1, 6)) * (1 - seg(t, 10.9, 11.4));
    hot.style.strokeDashoffset = lenHot * (1 - hotP);
    hotFlow.style.opacity = hotP > .98 && t < 10.8 ? .9 : 0;
    hotFlow.style.strokeDashoffset = -t * 60;

    const pressure = both(seg(t, 5.3, 6.6)) * (1 - both(seg(t, 10.7, 11.5)));
    needle.setAttribute('transform', `rotate(${mix(-120, 120, pressure).toFixed(2)} 308 402)`);
    bars.textContent = Math.round(pressure * 19);

    // Closing the lever is what pierces the capsule.
    const pierce = both(seg(t, 1.8, 2.35)) * (1 - seg(t, 11.3, 11.6));
    spikes.setAttribute('transform', `translate(${(pierce * 12).toFixed(2)} 0)`);

    // Coffee runs to the spout, falls, and the cup fills under a growing crema.
    const chanP = both(seg(t, 7, 7.35)) * (1 - seg(t, 10.7, 11));
    chan.style.strokeDashoffset = lenChan * (1 - chanP);

    const fill = both(seg(t, 7.4, 10.8)) * (1 - seg(t, 14.7, 15.1));
    const surface = mix(CUP_FLOOR, CUP_TOP, fill);
    liquid.setAttribute('y', surface.toFixed(2));
    liquid.setAttribute('height', (CUP_FLOOR + 6 - surface).toFixed(2));
    const head = clamp(fill * 3) * 11;
    crema.setAttribute('y', surface.toFixed(2));
    crema.setAttribute('height', head.toFixed(2));
    crema.style.opacity = fill > .01 ? 1 : 0;

    const pour = seg(t, 7.3, 7.5) * (1 - seg(t, 10.6, 10.9));
    const w = pour * (6 + Math.sin(t * 19) * .7);
    const sway = Math.sin(t * 7) * 1.1;
    stream.setAttribute('d', `M710 318 C${(710 + sway).toFixed(1)} 380 ${(710 - sway).toFixed(1)} 440 710 ${(surface + 2).toFixed(1)}`);
    stream.style.strokeWidth = w.toFixed(2);
    stream.style.opacity = pour > .02 ? 1 : 0;

    steam.style.opacity = (seg(t, 8.8, 9.8) * (1 - seg(t, 13.6, 14.6)) * .55).toFixed(2);
    steam.style.strokeDashoffset = -t * 22;

    tank.setAttribute('y', mix(240, 300, both(seg(t, 2.8, 10.8)) * (1 - seg(t, 14.4, 15.2))).toFixed(2));

    // Which step are we on?
    let step = 0;
    for (let i = 0; i < STEPS.length; i++) if (t >= STEPS[i]) step = i;
    root.dataset.step = step;
    buttons.forEach((b, i) => {
      const on = i === step;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      const next = STEPS[i + 1] ?? 14.4;
      b.style.setProperty('--fill', on ? seg(t, STEPS[i], next).toFixed(3) : 0);
    });
  }

  /* ---------- clock ---------- */
  let t = 0, last = 0, running = false, visible = false, paused = false, holdAt = null;
  const toggle = document.getElementById('howToggle');

  function tick(now) {
    if (!running) return;
    t += Math.min(.05, (now - last) / 1000);
    last = now;
    if (t >= LOOP) t = 0;
    if (holdAt !== null && t >= holdAt) {
      // A tapped step plays through, then waits to be read.
      t = holdAt - .02;
      render(t);
      pause();
      return;
    }
    render(t);
    requestAnimationFrame(tick);
  }
  function pause() {
    running = false;
    paused = true;
    toggle.textContent = 'Play';
  }
  function start() {
    if (running || reduced || paused) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }
  function stop() { running = false; }

  /* With motion off, each step shows its most telling moment. */
  const STEPS_REST = [2.2, 2.3, 1.7, 3.2, 1.9];

  buttons.forEach((b, i) => b.addEventListener('click', () => {
    t = STEPS[i] + (reduced ? STEPS_REST[i] : .01);
    render(t);
    holdAt = STEPS[i + 1] ?? 14.4;
    paused = false;
    toggle.textContent = 'Pause';
    if (visible) start();
  }));

  toggle.addEventListener('click', () => {
    holdAt = null;
    if (paused) { paused = false; toggle.textContent = 'Pause'; start(); } else { stop(); pause(); }
  });
  if (reduced) toggle.hidden = true;

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) start(); else stop();
  }, { threshold: .3 }).observe(root.querySelector('.how-stage'));

  render(reduced ? 10.2 : 0);
})();
