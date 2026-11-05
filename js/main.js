/* Page motion. One scroll loop, with geometry cached outside it. */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  /* ---------- headings soak into the paper a letter at a time ---------- */
  document.querySelectorAll('.say').forEach((h) => {
    const text = h.textContent;
    h.setAttribute('aria-label', text);
    h.textContent = '';
    let n = 0;
    text.split(' ').forEach((word, wi, all) => {
      const w = document.createElement('span');
      w.className = 'w';
      w.setAttribute('aria-hidden', 'true');
      for (const ch of word) {
        const c = document.createElement('span');
        c.textContent = ch;
        c.style.setProperty('--i', n++);
        w.append(c);
      }
      h.append(w);
      if (wi < all.length - 1) h.append(' ');
    });
  });
  const soak = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); soak.unobserve(e.target); }
  }, { threshold: .4 });
  document.querySelectorAll('.say').forEach((h) => soak.observe(h));

  /* ---------- paintings bleed in as you scroll ---------- */
  const REVEAL_FRAG = `
    precision highp float;
    varying vec2 v;
    uniform sampler2D t;
    uniform float p, asp;
    uniform vec2 seed;
    float h(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 q){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n(q);q=q*2.03+7.1;a*=.5;}return s;}
    void main(){
      vec4 c=texture2D(t,v);
      vec2 w=vec2(asp,1.);
      float reach=length((v-seed)*w)/max(asp,1.);
      float f=reach*.8+fbm(v*w*3.1)*.62+fbm(v*w*13.)*.09;
      float th=p*1.62;
      float m=smoothstep(th,th-.07,f);
      // The wet front runs just ahead of the picture as a pale wash with a darker lip.
      float ahead=smoothstep(th+.16,th,f)*(1.-m);
      float lip=exp(-pow((f-th+.015)/.012,2.));
      float a=ahead*.05+lip*.1*step(.001,p);
      a*=1.-smoothstep(.96,1.,p);
      vec3 wet=vec3(.62,.46,.32);
      gl_FragColor=vec4(c.rgb*m+wet*a*(1.-c.a*m),c.a*m+a*(1.-c.a*m));
    }`;
  const REVEAL_VERT = `attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}`;

  function paintingGL(fig) {
    const img = fig.querySelector('img');
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, REVEAL_VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, REVEAL_FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const uP = gl.getUniformLocation(prog, 'p');
    const seed = (fig.dataset.seed || '.5,.5').split(',').map(Number);
    let ready = false;
    const load = () => {
      try {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1f(gl.getUniformLocation(prog, 'asp'), canvas.width / canvas.height);
        gl.uniform2f(gl.getUniformLocation(prog, 'seed'), seed[0], seed[1]);
        ready = true;
        gl.uniform1f(uP, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        fig.classList.add('gl');
        img.after(canvas);
      } catch (err) {
        // Opened straight from disk: browsers refuse the texture, so the plain image stays.
        ready = false;
      }
    };
    img.loading = 'eager';
    if (img.complete && img.naturalWidth) load(); else img.addEventListener('load', load, { once: true });
    return {
      draw(p) {
        if (!ready) return;
        gl.uniform1f(uP, p);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
  }

  const paintings = [...document.querySelectorAll('.painting')].map((el) => ({
    el, top: 0, height: 0, p: 0, shown: -1, gl: null,
  }));
  // Each painting wakes up a little before it is needed, so the first screen stays light.
  if (!reduced) {
    const wake = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        wake.unobserve(e.target);
        const p = paintings.find((q) => q.el === e.target);
        p.gl = paintingGL(p.el);
        p.shown = -1;
      }
    }, { rootMargin: '900px 0px' });
    paintings.forEach((p) => wake.observe(p.el));
  }
  if (reduced) paintings.forEach((p) => p.el.classList.add('seen'));

  /* ---------- rings and machines ---------- */
  const rings = [...document.querySelectorAll('.ring')];
  const ringBox = document.getElementById('rings');
  const mach = document.querySelector('.mach');
  const machRow = document.getElementById('machRow');
  const pinned = !reduced;
  if (pinned) mach.classList.add('pinned');

  /* ---------- bar ---------- */
  const bar = document.querySelector('.bar');
  const hero = document.querySelector('.hero');
  const end = document.querySelector('.end');

  let vh = innerHeight, vw = innerWidth, ringTop = 0, ringH = 1, machTop = 0, travel = 0, heroH = 1, endTop = 1e9, soakH = 300;

  function measure() {
    vh = innerHeight;
    vw = innerWidth;
    const y = scrollY;
    for (const p of paintings) {
      const r = p.el.getBoundingClientRect();
      p.top = r.top + y;
      p.height = r.height;
    }
    const rr = ringBox.getBoundingClientRect();
    ringTop = rr.top + y;
    ringH = rr.height;
    if (pinned) {
      travel = Math.max(0, machRow.scrollWidth - vw + 40);
      mach.style.height = `${vh + travel}px`;
      machTop = mach.getBoundingClientRect().top + y;
    }
    heroH = hero.offsetHeight;
    endTop = end.getBoundingClientRect().top + y;
    soakH = end.querySelector('.soak').offsetHeight;
  }

  const dripFig = document.querySelector('.drip');
  const dripState = paintings.find((p) => p.el === dripFig);
  let nextDrip = 0;
  function tick() {
    requestAnimationFrame(tick);
    const y = scrollY;

    for (const p of paintings) {
      // Paint arrives between the picture entering and it sitting mid-screen.
      const raw = clamp((y + vh - p.top - vh * .08) / (Math.min(p.height, vh) * .95));
      const target = Math.max(p.p, raw);
      p.p += (target - p.p) * .085;
      if (target - p.p < .002) p.p = target;
      if (Math.abs(p.p - p.shown) > .0015) {
        p.shown = p.p;
        if (p.gl) p.gl.draw(p.p);
        if (p.p > .12) p.el.classList.add('seen');
      }
    }

    const span = clamp((y + vh * .92 - ringTop) / (ringH * .95 + vh * .12));
    rings.forEach((r, i) => {
      const a = clamp((span - i * .13) / .36);
      r.style.setProperty('--p', `${reduced ? 360 : (a * 372).toFixed(1)}deg`);
      r.classList.toggle('on', a > .7 || reduced);
    });

    // The painted stream keeps dripping, and each drop lands on the real page.
    if (dripFig && !reduced && window.Wet && performance.now() > nextDrip) {
      const r = dripFig.getBoundingClientRect();
      if (dripState.p > .85 && r.bottom > 40 && r.top < vh - 60) {
        window.Wet.bloom(r.left + r.width * .505, r.top + r.height * .935, { reach: .011, ink: .9, tone: .85, push: 40 });
        nextDrip = performance.now() + 2100 + Math.random() * 1500;
      }
    }

    if (pinned) machRow.style.transform = `translate3d(${-clamp((y - machTop) / (travel || 1)) * travel}px,0,0)`;

    bar.classList.toggle('past', y > heroH * .55);
    bar.classList.toggle('dark', y + 40 > endTop + soakH * .62);
  }

  addEventListener('resize', measure);
  addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  new ResizeObserver(measure).observe(document.body);
  measure();
  requestAnimationFrame(tick);

  /* The opening line waits for the word to land. */
  setTimeout(() => root.classList.add('landed'), reduced ? 0 : 1500);
})();
