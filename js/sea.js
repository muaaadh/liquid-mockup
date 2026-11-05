/* The coffee sea. One graded frame, with the water flowing past a steady boat.
 * Two copies of the picture slide along the current and hand over to each other, so
 * the motion never reaches a loop point: no seam, no second boat, and it scales cleanly.
 */
(() => {
  'use strict';

  const box = document.querySelector('.sea');
  const img = box.querySelector('img');
  const btn = box.querySelector('[data-pause="sea"]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { btn.hidden = true; return; }

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
  if (!gl) { btn.hidden = true; return; }

  const VERT = 'attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}';
  const FRAG = `
    precision highp float;
    varying vec2 v;
    uniform sampler2D tex;
    uniform float time;
    const vec2 BOAT = vec2(.4275, .4655);   // where the boat sits in the frame
    const vec2 HEAD = vec2(-.3, .95);      // the way the water runs past it
    const float PERIOD = 3.2, TRAVEL = .075;

    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
    }
    void main(){
      float near = mix(.18, 1.3, smoothstep(.12, 1., v.y));          // near water passes faster
      float d = length((v - BOAT) * vec2(1.78, 1.));
      float hold = smoothstep(.016, .058, d);                         // the boat itself stays put
      vec2 drift = vec2(n(v * 5. + time * .13) - .5, n(v * 5. + 9. - time * .11) - .5);
      vec2 flow = (HEAD + drift * .5) * near * hold;

      float pa = fract(time / PERIOD), pb = fract(pa + .5);
      vec3 a = texture2D(tex, v - flow * (pa - .5) * TRAVEL).rgb;
      vec3 b = texture2D(tex, v - flow * (pb - .5) * TRAVEL).rgb;
      vec3 c = mix(a, b, abs(2. * pa - 1.));

      // The hull rides the swell a little.
      vec2 bob = vec2(0., sin(time * 1.7) * .0007) * (1. - hold);
      c = mix(texture2D(tex, v + bob).rgb, c, hold);
      gl_FragColor = vec4(c, 1.);
    }`;

  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uTime = gl.getUniformLocation(prog, 'time');

  let ready = false, running = false, held = false, visible = false, clock = 0, last = 0;

  function frame(now) {
    if (!running) return;
    clock += Math.min(.05, (now - last) / 1000);
    last = now;
    gl.uniform1f(uTime, clock);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(frame);
  }
  function sync() {
    const go = ready && visible && !held;
    if (go && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    if (!go) running = false;
  }

  function load() {
    try {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      canvas.setAttribute('aria-hidden', 'true');
      img.after(canvas);
      ready = true;
      sync();
    } catch (err) {
      // Opened straight from disk: browsers refuse the texture, so the still picture stays.
      btn.hidden = true;
    }
  }
  if (img.complete && img.naturalWidth) load(); else img.addEventListener('load', load, { once: true });

  btn.addEventListener('click', () => {
    held = !held;
    btn.textContent = held ? 'Play' : 'Pause';
    sync();
  });
  new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; sync(); }, { threshold: .05 }).observe(box);
})();
