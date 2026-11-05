/* The wet layer.
 *
 * A small GPU fluid simulation sits behind the page. Its dye is coffee, so the cursor
 * drags pigment across the paper, the wordmark can be smeared and slowly soaks back,
 * and the rest of the site can call Wet.bloom() to drop a wash anywhere.
 *
 * Dye texture: x = pigment density, y = density * tone (0 weak coffee, 1 espresso).
 * Display uses the same Beer-Lambert coffee absorption as tools/wash.py, so what is
 * simulated here and what was painted offline are the same colour.
 */
(() => {
  'use strict';

  const canvas = document.getElementById('wet');
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = reduced ? null : canvas.getContext('webgl2', {
    alpha: true, depth: false, stencil: false, antialias: false,
    premultipliedAlpha: true, powerPreference: 'high-performance',
  });
  const canRender = gl && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));

  if (!canRender) {
    root.classList.add('no-wet');
    window.Wet = { bloom() {}, active: false };
    return;
  }
  gl.getExtension('OES_texture_float_linear');

  /* ---------- shaders ---------- */
  const VERT = `#version 300 es
  in vec2 aPos; out vec2 vUv;
  void main(){ vUv=aPos*.5+.5; gl_Position=vec4(aPos,0.,1.); }`;

  const head = `#version 300 es
  precision highp float; precision highp sampler2D;
  in vec2 vUv; out vec4 o;`;

  const FRAG = {
    splat: `${head}
      uniform vec2 uPoint; uniform vec3 uValue; uniform float uRadius, uAspect;
      void main(){ vec2 p=vUv-uPoint; p.x*=uAspect; o=vec4(uValue*exp(-dot(p,p)/uRadius),0.); }`,

    radial: `${head}
      uniform vec2 uPoint; uniform float uRadius, uAspect, uForce;
      void main(){ vec2 p=vUv-uPoint; p.x*=uAspect; float l=length(p)+1e-4;
        o=vec4(p/l*uForce*exp(-dot(p,p)/uRadius),0.,0.); }`,

    advect: `${head}
      uniform sampler2D uVel, uSrc; uniform vec2 uTexel; uniform float uDt, uFade, uShift, uStir, uTime;
      void main(){
        vec2 v=texture(uVel,vUv).xy;
        // uShift carries the paint with the paper when the page scrolls.
        vec2 c=vUv-uDt*v*uTexel-vec2(0.,uShift);
        vec4 r=texture(uSrc,c);
        float inside=step(0.,c.y)*step(c.y,1.)*step(0.,c.x)*step(c.x,1.);
        r*=inside/(1.+uFade*uDt);
        // A slow stir keeps the wet edges breathing.
        r.xy+=uStir*vec2(sin(vUv.y*11.+uTime*.7)+sin(vUv.y*23.-uTime*.4),cos(vUv.x*9.-uTime*.6)+cos(vUv.x*19.+uTime*.5));
        o=r;
      }`,

    curl: `${head}
      uniform sampler2D uVel; uniform vec2 uTexel;
      void main(){
        float L=texture(uVel,vUv-vec2(uTexel.x,0.)).y, R=texture(uVel,vUv+vec2(uTexel.x,0.)).y;
        float T=texture(uVel,vUv+vec2(0.,uTexel.y)).x, B=texture(uVel,vUv-vec2(0.,uTexel.y)).x;
        o=vec4(.5*(R-L-T+B),0.,0.,1.);
      }`,

    vort: `${head}
      uniform sampler2D uVel, uCurl; uniform vec2 uTexel; uniform float uAmount, uDt;
      void main(){
        float L=texture(uCurl,vUv-vec2(uTexel.x,0.)).x, R=texture(uCurl,vUv+vec2(uTexel.x,0.)).x;
        float T=texture(uCurl,vUv+vec2(0.,uTexel.y)).x, B=texture(uCurl,vUv-vec2(0.,uTexel.y)).x;
        float C=texture(uCurl,vUv).x;
        vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));
        f/=length(f)+1e-4; f*=uAmount*C; f.y*=-1.;
        vec2 v=texture(uVel,vUv).xy+f*uDt;
        o=vec4(clamp(v,-1000.,1000.),0.,1.);
      }`,

    div: `${head}
      uniform sampler2D uVel; uniform vec2 uTexel;
      void main(){
        vec2 c=texture(uVel,vUv).xy;
        vec2 l=vUv-vec2(uTexel.x,0.), r=vUv+vec2(uTexel.x,0.), t=vUv+vec2(0.,uTexel.y), b=vUv-vec2(0.,uTexel.y);
        float L=texture(uVel,l).x, R=texture(uVel,r).x, T=texture(uVel,t).y, B=texture(uVel,b).y;
        if(l.x<0.)L=-c.x; if(r.x>1.)R=-c.x; if(t.y>1.)T=-c.y; if(b.y<0.)B=-c.y;
        o=vec4(.5*(R-L+T-B),0.,0.,1.);
      }`,

    scale: `${head}
      uniform sampler2D uSrc; uniform float uAmount;
      void main(){ o=texture(uSrc,vUv)*uAmount; }`,

    jacobi: `${head}
      uniform sampler2D uP, uDiv; uniform vec2 uTexel;
      void main(){
        float L=texture(uP,vUv-vec2(uTexel.x,0.)).x, R=texture(uP,vUv+vec2(uTexel.x,0.)).x;
        float T=texture(uP,vUv+vec2(0.,uTexel.y)).x, B=texture(uP,vUv-vec2(0.,uTexel.y)).x;
        o=vec4((L+R+B+T-texture(uDiv,vUv).x)*.25,0.,0.,1.);
      }`,

    grad: `${head}
      uniform sampler2D uP, uVel; uniform vec2 uTexel;
      void main(){
        float L=texture(uP,vUv-vec2(uTexel.x,0.)).x, R=texture(uP,vUv+vec2(uTexel.x,0.)).x;
        float T=texture(uP,vUv+vec2(0.,uTexel.y)).x, B=texture(uP,vUv-vec2(0.,uTexel.y)).x;
        o=vec4(texture(uVel,vUv).xy-vec2(R-L,T-B),0.,1.);
      }`,

    /* The wordmark soaks back in. Pigment only ever rises towards the letters, so a
       smear stays where it was dragged while the letter underneath slowly returns. */
    restore: `${head}
      uniform sampler2D uDye, uMask, uNoise; uniform float uShift, uRate, uReveal, uAspect, uDry; uniform vec2 uDrop;
      void main(){
        vec4 d=texture(uDye,vUv);
        vec2 mc=vUv-vec2(0.,uShift);
        float m=0.;
        if(mc.y>=0.&&mc.y<=1.) m=textureLod(uMask,mc,1.).r;
        vec2 aspect=vec2(uAspect,1.);
        vec4 n=texture(uNoise,mc*aspect*.9);
        vec4 n2=texture(uNoise,mc*aspect*.23+.3);
        float gate=smoothstep(uReveal,uReveal-.16,length((mc-uDrop)*aspect)+(n.g-.5)*.2);
        // Gravity pulls a wet letter's pigment to its lower edge.
        float pool=.5+.75*n2.b+.18*n.a;
        float t=m*gate*pool;
        float nd=max(d.x,mix(d.x,t,uRate));
        float ny=d.y+(nd-d.x);
        // Right beside the word the paper dries fast, so the letters stay readable
        // while strokes further out linger.
        float near=mc.y>=0.&&mc.y<=1.?smoothstep(.015,.14,textureLod(uMask,mc,5.).r):0.;
        float dry=1.-near*(1.-smoothstep(.05,.5,m))*uDry;
        o=vec4(nd*dry,ny*dry,0.,1.);
      }`,

    show: `${head}
      uniform sampler2D uDye, uNoise; uniform vec2 uRes; uniform float uPage;
      void main(){
        vec2 px=gl_FragCoord.xy+vec2(0.,uPage);
        vec4 n=texture(uNoise,px/300.);
        vec4 n2=texture(uNoise,px/1900.);
        // Capillary wander: the edge never follows the sim exactly.
        vec2 uv=vUv+(n2.rg-.5)*.0034+(n.ba-.5)*.0016;
        vec4 s=texture(uDye,uv);
        float d=s.x;
        float tone=clamp(s.y/max(d,1e-3),0.,1.);
        float dd=d*(.95+.1*n.r);
        float body=smoothstep(.03,.062,dd);          // a wash stops, it does not fade
        float rim=exp(-pow((dd-.078)/.03,2.));       // and it pools where it stopped
        float fill=1.-exp(-dd*2.1);
        float p=body*(.05+fill*.95)+body*rim*.13*(.5+n2.b);
        float dens=p*mix(.5,3.5,tone)*(.93+.14*n.g);
        vec3 T=exp(-vec3(.74,1.,1.3)*dens);
        float a=1.-T.b;
        o=vec4(T-(1.-a),a);
      }`,
  };

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const P = {};
  for (const [name, src] of Object.entries(FRAG)) {
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, src));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    const u = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      u[info.name] = gl.getUniformLocation(prog, info.name);
    }
    P[name] = { prog, u };
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  /* ---------- render targets ---------- */
  function makeTarget(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h, texel: [1 / w, 1 / h] };
  }
  function makePair(w, h) {
    let a = makeTarget(w, h), b = makeTarget(w, h);
    return {
      get read() { return a; }, get write() { return b; },
      swap() { [a, b] = [b, a]; }, w, h, texel: a.texel,
      free() { for (const t of [a, b]) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } },
    };
  }
  function freeTarget(t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }

  /* Tileable noise: R fine tooth, G/B slower, A in between. */
  function makeNoise() {
    const N = 256, data = new Uint8Array(N * N * 4);
    let s = 1337;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const layer = (f) => {
      const g = new Float32Array(f * f).map(rnd);
      return (x, y) => {
        const u = x / N * f, v = y / N * f, i = Math.floor(u), j = Math.floor(v);
        let a = u - i, b = v - j;
        a = a * a * (3 - 2 * a); b = b * b * (3 - 2 * b);
        const at = (p, q) => g[((q + f) % f) * f + ((p + f) % f)];
        return (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b;
      };
    };
    const sets = [[128, 64], [16, 32, 64], [4, 8, 16], [8, 16, 32]].map((fs) => fs.map(layer));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      sets.forEach((ls, c) => {
        let v = 0, amp = 1, tot = 0;
        for (const l of ls) { v += l(x, y) * amp; tot += amp; amp *= .5; }
        data[(y * N + x) * 4 + c] = Math.max(0, Math.min(255, ((v / tot - .5) * 1.9 + .5) * 255));
      });
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
  }
  const noise = makeNoise();

  /* ---------- sizing ---------- */
  let W = 0, H = 0, aspect = 1, velocity, dye, pressure, divergence, curl, maskTex;
  let quality = 1;
  const heroMark = document.getElementById('heroMark');
  let drop = [.5, .5], heroBottom = 1e9;

  function drawMask() {
    const { w, h } = dye;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, w, h);
    const r = heroMark.getBoundingClientRect();
    const k = w / canvas.clientWidth;
    const top = r.top + scrollY;
    const logo = window.LIQUID_LOGO;
    const s = r.width / logo.w * k;
    x.save();
    x.translate(r.left * k, (top + (r.height - logo.h * r.width / logo.w) / 2) * k + logo.h * s);
    x.scale(s / 10, -s / 10);
    x.fillStyle = '#fff';
    x.fill(new Path2D(logo.d));
    x.restore();

    if (!maskTex) maskTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);

    // The drop lands on the Q, where the word is widest.
    drop = [(r.left + r.width * .43) / canvas.clientWidth, 1 - (top + r.height * .5) / canvas.clientHeight];
    heroBottom = document.querySelector('.hero').offsetHeight;
  }

  function size() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = canvas.width = Math.round(cw * dpr);
    H = canvas.height = Math.round(ch * dpr);
    aspect = cw / ch;

    const small = cw < 700;
    const dyeW = Math.round(Math.min(Math.max(cw, 720), small ? 900 : 1400) * quality);
    const dyeH = Math.round(dyeW / aspect);
    const simH = small ? 96 : 128;
    const simW = Math.round(simH * aspect);

    for (const t of [velocity, dye, pressure]) if (t) t.free();
    for (const t of [divergence, curl]) if (t) freeTarget(t);
    velocity = makePair(simW, simH);
    pressure = makePair(simW, simH);
    divergence = makeTarget(simW, simH);
    curl = makeTarget(simW, simH);
    dye = makePair(dyeW, dyeH);
    drawMask();
  }

  /* ---------- drawing helpers ---------- */
  function use(p) { gl.useProgram(p.prog); return p.u; }
  function bind(unit, tex, loc) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }
  function into(t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, t ? t.w : W, t ? t.h : H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* Splats add straight into the live texture, clipped to where they can reach. */
  function stamp(prog, tgt, x, y, radius, setUniforms) {
    const u = use(prog);
    gl.uniform2f(u.uPoint, x, y);
    gl.uniform1f(u.uRadius, radius);
    gl.uniform1f(u.uAspect, aspect);
    setUniforms(u);
    const reach = Math.sqrt(radius) * 2.6;
    const x0 = Math.max(0, Math.floor((x - reach / aspect) * tgt.w));
    const y0 = Math.max(0, Math.floor((y - reach) * tgt.h));
    const x1 = Math.min(tgt.w, Math.ceil((x + reach / aspect) * tgt.w));
    const y1 = Math.min(tgt.h, Math.ceil((y + reach) * tgt.h));
    if (x1 <= x0 || y1 <= y0) return;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x0, y0, x1 - x0, y1 - y0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fbo);
    gl.viewport(0, 0, tgt.w, tgt.h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);
  }

  const queue = [];
  function flush() {
    for (const q of queue) {
      if (q.force) stamp(P.splat, velocity.read, q.x, q.y, q.vr, (u) => gl.uniform3f(u.uValue, q.force[0], q.force[1], 0));
      if (q.burst) stamp(P.radial, velocity.read, q.x, q.y, q.vr, (u) => gl.uniform1f(u.uForce, q.burst));
      if (q.ink) stamp(P.splat, dye.read, q.x, q.y, q.r, (u) => gl.uniform3f(u.uValue, q.ink, q.ink * q.tone, 0));
    }
    queue.length = 0;
  }

  /* ---------- the simulation step ---------- */
  function step(dt, shift, time, heroOn, rate, reveal, stir) {
    const vt = velocity.texel;
    let u;

    u = use(P.curl); bind(0, velocity.read.tex, u.uVel); gl.uniform2fv(u.uTexel, vt); into(curl);

    u = use(P.vort); bind(0, velocity.read.tex, u.uVel); bind(1, curl.tex, u.uCurl);
    gl.uniform2fv(u.uTexel, vt); gl.uniform1f(u.uAmount, 3.5); gl.uniform1f(u.uDt, dt);
    into(velocity.write); velocity.swap();

    u = use(P.div); bind(0, velocity.read.tex, u.uVel); gl.uniform2fv(u.uTexel, vt); into(divergence);

    u = use(P.scale); bind(0, pressure.read.tex, u.uSrc); gl.uniform1f(u.uAmount, .8);
    into(pressure.write); pressure.swap();

    u = use(P.jacobi); bind(1, divergence.tex, u.uDiv); gl.uniform2fv(u.uTexel, vt);
    for (let i = 0; i < 14; i++) { bind(0, pressure.read.tex, u.uP); into(pressure.write); pressure.swap(); }

    u = use(P.grad); bind(0, pressure.read.tex, u.uP); bind(1, velocity.read.tex, u.uVel);
    gl.uniform2fv(u.uTexel, vt); into(velocity.write); velocity.swap();

    u = use(P.advect);
    bind(0, velocity.read.tex, u.uVel); bind(1, velocity.read.tex, u.uSrc);
    gl.uniform2fv(u.uTexel, vt); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uFade, 2.6);
    gl.uniform1f(u.uShift, shift); gl.uniform1f(u.uStir, heroOn ? stir : 0); gl.uniform1f(u.uTime, time);
    into(velocity.write); velocity.swap();

    bind(0, velocity.read.tex, u.uVel); bind(1, dye.read.tex, u.uSrc);
    gl.uniform1f(u.uFade, time < 5 ? .55 : .24); gl.uniform1f(u.uStir, 0);
    into(dye.write); dye.swap();

    if (heroOn) {
      u = use(P.restore);
      bind(0, dye.read.tex, u.uDye); bind(1, maskTex, u.uMask); bind(2, noise, u.uNoise);
      gl.uniform1f(u.uShift, scrollY / canvas.clientHeight);
      gl.uniform1f(u.uRate, rate); gl.uniform1f(u.uReveal, reveal); gl.uniform1f(u.uDry, 1 - Math.exp(-1.5 * dt));
      gl.uniform1f(u.uAspect, aspect); gl.uniform2fv(u.uDrop, drop);
      into(dye.write); dye.swap();
    }
  }

  function show() {
    gl.disable(gl.BLEND);
    const u = use(P.show);
    bind(0, dye.read.tex, u.uDye); bind(1, noise, u.uNoise);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform1f(u.uPage, -scrollY * (W / canvas.clientWidth));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- input ---------- */
  const toUv = (x, y) => [x / canvas.clientWidth, 1 - y / canvas.clientHeight];
  let px = null, py = null, sleepAt = 0;
  const wake = (ms = 9000) => { sleepAt = performance.now() + ms; };

  function brush(x, y) {
    if (px === null) { px = x; py = y; return; }
    const dx = x - px, dy = y - py, dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const n = Math.min(10, Math.ceil(dist / 9));
    // Slow hands lay more pigment, fast ones skim.
    const ink = Math.max(.008, .026 - dist * .00026);
    for (let i = 1; i <= n; i++) {
      const [u, v] = toUv(px + dx * i / n, py + dy * i / n);
      queue.push({ x: u, y: v, r: .00026, vr: .0011, ink, tone: .6, force: i === n ? [dx * 4.5, -dy * 4.5] : null });
    }
    px = x; py = y;
    wake();
  }

  addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') brush(e.clientX, e.clientY); }, { passive: true });
  addEventListener('pointerleave', () => { px = null; }, { passive: true });
  document.addEventListener('mouseleave', () => { px = null; });
  addEventListener('touchstart', (e) => { px = e.touches[0].clientX; py = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', (e) => brush(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  addEventListener('touchend', () => { px = null; }, { passive: true });

  let lastW = 0, lastH = 0;
  addEventListener('resize', () => {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    // A phone's address bar only nudges the height. Keep the paint when that happens.
    if (cw === lastW && Math.abs(ch - lastH) < 140) return;
    lastW = cw; lastH = ch;
    size();
    wake();
  });

  /* ---------- run ---------- */
  size();
  lastW = canvas.clientWidth; lastH = canvas.clientHeight;
  const start = performance.now();
  let last = start, lastY = scrollY, frames = 0, spent = 0, tuned = false;

  // The opening: one heavy drop lands on the Q and throws a wash across the sheet.
  queue.push({ x: drop[0], y: drop[1], r: .012, vr: .05, ink: .62, tone: .62, burst: 70 });
  queue.push({ x: drop[0] - .12, y: drop[1] + .07, r: .0022, vr: .01, ink: .3, tone: .5, burst: 26 });
  queue.push({ x: drop[0] + .16, y: drop[1] - .08, r: .0034, vr: .012, ink: .34, tone: .5, burst: 30 });

  function frame(now) {
    requestAnimationFrame(frame);
    const y = scrollY, dy = y - lastY;
    lastY = y;
    if (dy !== 0 || queue.length) wake();
    const heroOn = y < heroBottom + 40;
    if (!heroOn && now > sleepAt) { last = now; return; }

    const raw = now - last;
    const dt = Math.min(raw / 1000, 1 / 30);
    last = now;
    const t = (now - start) / 1000;
    // The word soaks outward from the drop, then settles to a slow healing rate.
    const reveal = Math.max(0, Math.min(2.2, (t - .7) * (t - .7) * .5 + (t - .7) * .36));
    const rate = 1 - Math.exp(-(t < 3.6 ? 7 : 1.7) * dt);
    // The opening wash swirls freely, then the sheet calms so the word can hold.
    const stir = t < 1.8 ? .3 * (1 - t / 1.8) + .004 : .004;

    flush();
    step(dt, dy / canvas.clientHeight, t, heroOn, rate, reveal, stir);
    show();

    // Weak GPU: drop the dye resolution once rather than stutter for the whole visit.
    if (!tuned && t > 1.5) {
      frames++; spent += raw;
      if (frames === 70) {
        tuned = true;
        if (spent / frames > 30) { quality = .62; size(); }
      }
    }
  }
  requestAnimationFrame(frame);

  window.Wet = {
    active: true,
    /* Drop a wash at a screen point. tone 0..1, reach is a fraction of screen height. */
    bloom(x, y, { reach = .09, ink = .34, tone = .6, push = 260 } = {}) {
      const [u, v] = toUv(x, y);
      // Several overlapping pools, so a wash spreads like water and not like a stamp.
      const pools = reach < .04 ? 1 : 6;
      for (let i = 0; i < pools; i++) {
        const a = Math.random() * 6.283, d = i ? reach * (.5 + Math.random() * .75) : 0;
        const r = reach * (i ? .32 + Math.random() * .42 : .8);
        queue.push({
          x: u + Math.cos(a) * d / aspect, y: v + Math.sin(a) * d,
          r: r * r, vr: r * r * 2.4, ink: ink * (.7 + Math.random() * .5), tone, burst: push * (i ? .5 : 1),
        });
      }
      wake();
    },
  };
})();
