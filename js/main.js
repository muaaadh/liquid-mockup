/* Page motion: paintings bleed in once, cup rings draw once, and nothing else moves on its own. */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function play(ms, draw) {
    const start = performance.now();
    (function frame(now) {
      const t = Math.min(1, (now - start) / ms);
      draw(1 - (1 - t) ** 2.4);
      if (t < 1) requestAnimationFrame(frame);
    })(start);
  }

  /* ---------- paintings ---------- */
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

  function paintingGL(fig, onReady) {
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
    const api = { draw(p) { gl.uniform1f(uP, p); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); } };
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
        api.draw(0);
        fig.classList.add('gl');
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', img.alt);
        img.after(canvas);
        onReady(api);
      } catch (err) {
        // Opened straight from disk: browsers refuse the texture, so the plain image stays.
        onReady(null);
      }
    };
    img.loading = 'eager';
    if (img.complete && img.naturalWidth) load(); else img.addEventListener('load', load, { once: true });
    return api;
  }

  const paintings = [...document.querySelectorAll('.painting')];
  if (reduced) {
    paintings.forEach((el) => el.classList.add('seen'));
  } else {
    const state = new Map(paintings.map((el) => [el, { api: null, ready: false, wanted: false, done: false }]));
    const reveal = (el) => {
      const s = state.get(el);
      if (s.done || !s.wanted || !s.ready) return;
      s.done = true;
      el.classList.add('seen');
      if (s.api) play(1700, (p) => s.api.draw(p));
    };
    const wake = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        wake.unobserve(e.target);
        const s = state.get(e.target);
        const made = paintingGL(e.target, (api) => { s.api = api; s.ready = true; reveal(e.target); });
        if (!made) { s.ready = true; reveal(e.target); }
      }
    }, { rootMargin: '700px 0px' });
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        seen.unobserve(e.target);
        state.get(e.target).wanted = true;
        reveal(e.target);
      }
    }, { threshold: .2 });
    paintings.forEach((el) => { wake.observe(el); seen.observe(el); });
  }

  /* ---------- cup rings ---------- */
  const rings = [...document.querySelectorAll('.rings li')];
  const setRing = (r, p) => r.style.setProperty('--p', `${(p * 372).toFixed(1)}deg`);
  if (reduced) {
    rings.forEach((r) => setRing(r, 1));
  } else {
    new IntersectionObserver((entries, io) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      rings.forEach((r, i) => setTimeout(() => play(1100, (p) => setRing(r, p)), i * 170));
    }, { threshold: .3 }).observe(document.getElementById('rings'));
  }

  /* ---------- the film ---------- */
  const film = document.getElementById('film');
  if (reduced) {
    film.src = film.dataset.src;
    film.controls = true;
    film.preload = 'metadata';
  } else {
    new IntersectionObserver((entries) => {
      const on = entries[0].isIntersecting;
      if (on && !film.src) film.src = innerWidth < 760 ? film.dataset.srcM : film.dataset.src;
      if (on) film.play().catch(() => { film.controls = true; }); else film.pause();
    }, { threshold: .25 }).observe(film);
  }

  /* ---------- bar ---------- */
  const bar = document.querySelector('.bar');
  const mark = document.getElementById('heroMark');
  const nav = bar.querySelector('nav');
  const end = document.querySelector('.end');
  const soak = end.querySelector('.soak');
  let queued = false;
  function updateBar() {
    queued = false;
    // The backdrop arrives as the wordmark reaches the nav, so the links never sit on it.
    bar.classList.toggle('past', mark.getBoundingClientRect().top < nav.getBoundingClientRect().bottom + 8);
    // The nav flips to light only once the soak behind it is dark enough.
    bar.classList.toggle('dark', end.getBoundingClientRect().top + soak.offsetHeight * .62 < 40);
  }
  addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(updateBar); }
  }, { passive: true });
  updateBar();

  /* The opening line waits for the word to land. */
  setTimeout(() => root.classList.add('landed'), reduced ? 0 : 1300);
})();
