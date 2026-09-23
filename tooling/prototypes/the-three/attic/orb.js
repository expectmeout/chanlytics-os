// The orb — a voice presence you talk to.
//
// One fragment shader draws a soft cloud sphere: weather drifting over a lit
// globe, a feathered edge that dissolves into the page, and a silhouette that
// swells with your voice and ripples while it speaks. Everything that moves is
// a smoothed target, so a change of state is a morph, never a cut.
//
// No dependencies. WebGL2 or WebGL1 (GLSL ES 1.00). Premultiplied alpha, so it
// composites over any page colour. Pauses when hidden or off screen. Honors
// prefers-reduced-motion with a still frame.
//
//   import { createOrb, PALETTES } from './orb.js';
//   const orb = createOrb(canvas, { palette: 'sky', theme: 'light' });
//   orb.setState('listening');        // idle | listening | thinking | speaking
//   orb.setLevel(0.6);                // a live level, 0..1 (mic or output audio)
//   orb.pulse();                      // a burst that decays (a text delta, a word)
//   await orb.attachMic();            // level from the microphone
//   orb.attachAudio(audioElement);    // level from what it is saying
//   orb.setTheme('dark'); orb.setPalette('ink'); orb.destroy();

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform float uTime, uCloudT, uRot, uRadius, uBreath, uLevel, uSpeak, uListen, uThink, uSoft, uRimMix, uGlow, uSeed, uTintAmt;
uniform vec3 uDeep, uMid, uLight, uBg, uTint;

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yxz + 19.19);
  return -1.0 + 2.0 * fract(vec3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx);
}

// simplex noise, -1..1
float snoise3(vec3 p) {
  const float K1 = 0.333333333;
  const float K2 = 0.166666667;
  vec3 i = floor(p + (p.x + p.y + p.z) * K1);
  vec3 d0 = p - (i - (i.x + i.y + i.z) * K2);
  vec3 e = step(vec3(0.0), d0 - d0.yzx);
  vec3 i1 = e * (1.0 - e.zxy);
  vec3 i2 = 1.0 - e.zxy * (1.0 - e);
  vec3 d1 = d0 - (i1 - K2);
  vec3 d2 = d0 - (i2 - K1);
  vec3 d3 = d0 - 0.5;
  vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0);
  vec4 n = h * h * h * h * vec4(dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0)));
  return dot(vec4(31.316), n);
}

// three octaves: soft weather, not a planet's coastlines
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 3; k++) { s += a * snoise3(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
float fbm2(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 2; k++) { s += a * snoise3(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y));
  float d = length(uv);
  float ang = atan(uv.y, uv.x);
  vec2 dir = vec2(cos(ang), sin(ang));

  // the silhouette: talking ripples the outline, listening swells it
  float w1 = snoise3(vec3(dir * 1.4, uTime * 1.6 + uSeed));
  float w2 = snoise3(vec3(dir * 2.8 + 5.0, uTime * 2.4));
  float wob = uSpeak * (0.045 * w1 + 0.022 * w2) * (0.35 + uLevel)
            + uListen * 0.018 * w1 * (0.3 + uLevel);
  float R = uRadius * (1.0 + uBreath + uLevel * (0.06 * uListen + 0.03 * uSpeak) + wob);
  float feather = uSoft * uRadius;
  float body = 1.0 - smoothstep(R - feather, R + feather, d);

  // a globe behind the silhouette, spinning slowly
  vec2 p = uv / R;
  float pp = min(dot(p, p), 1.0);
  float z = sqrt(1.0 - pp);
  vec3 n = vec3(p, z);
  float c = cos(uRot), s = sin(uRot);
  vec3 nr = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);

  // weather: domain-warped clouds drifting over the surface
  vec3 q = nr * 0.75 + vec3(0.0, uCloudT * 0.35, uSeed);
  vec3 warp = vec3(fbm2(q + 2.1), fbm2(q + 7.3), fbm2(q + 13.9));
  float cloud = fbm(q + warp * 1.2 + vec3(uCloudT * 0.6, 0.0, 0.0));
  cloud = smoothstep(-0.30, 0.22, cloud);

  // lit from the top left; the far side sinks into the deep colour
  vec3 L = normalize(vec3(-0.55, 0.72, 0.42));
  float lam = clamp(dot(n, L), 0.0, 1.0);
  vec3 col = mix(uMid, uLight, cloud);
  col = mix(uDeep, col, 0.35 + 0.65 * lam);
  col += uLight * pow(lam, 3.0) * 0.22;
  col = mix(col, uTint, uTintAmt);
  col += uLevel * 0.06 * uListen;

  // the rim dissolves into the page, or lifts into light on a dark page;
  // while it works, the accent lives in the rim, not the body
  float rim = pow(1.0 - z, 2.2);
  vec3 rimCol = mix(mix(uBg, uLight, uRimMix), uTint, uTintAmt * 1.6);
  col = mix(col, rimCol, rim * 0.8);

  // a halo past the edge, mostly for dark pages
  // it must die before the canvas edge, or the glow is cut into a square
  float halo = uGlow * (1.0 - body) * pow(clamp(1.0 - (d - R) / (R * 0.4), 0.0, 1.0), 2.5);
  vec3 haloCol = mix(uMid, uLight, 0.5);

  float a = clamp(body + halo * 0.7, 0.0, 1.0);
  vec3 outc = min(col * body + haloCol * halo * 0.7, vec3(1.0));
  gl_FragColor = vec4(outc, a);
}
`;

// ------------------------------------------------------------------ palettes
// deep: the far side · mid: the body · light: the lit clouds · tint: what it
// turns toward while it works (the page's one accent), by how much.
export const PALETTES = {
  sky: {
    light: { deep: '#3f8cf5', mid: '#9cccff', light: '#ffffff', tint: '#9cccff', rimMix: 0.25, glow: 0.0 },
    dark:  { deep: '#1d5fd6', mid: '#4f9cff', light: '#dff0ff', tint: '#4f9cff', rimMix: 0.75, glow: 0.45 },
  },
  ink: {
    light: { deep: '#666b7c', mid: '#c2c6d1', light: '#ffffff', tint: '#e8633f', rimMix: 0.2, glow: 0.0 },
    dark:  { deep: '#3a3f4c', mid: '#8b93a8', light: '#e9ecf3', tint: '#f07a58', rimMix: 0.7, glow: 0.35 },
  },
};

const STATES = ['idle', 'listening', 'thinking', 'speaking'];

const hex = (h) => {
  const v = parseInt(h.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader failed');
  return sh;
}

// A pseudo voice for when it speaks without audio: syllables at speech rate,
// phrases with breaths between them.
function syntheticVoice(t) {
  const inPhrase = (t % 2.7) < 2.05 ? 1 : 0;
  const syllable = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 5.1);
  const slow = 0.72 + 0.28 * Math.sin(t * Math.PI * 2 * 0.8 + 1.3);
  return inPhrase * syllable * slow;
}

export function createOrb(canvas, options = {}) {
  const opts = {
    palette: 'sky',
    theme: 'light',
    bg: null,               // page colour behind the orb; defaults per theme
    radius: 0.70,           // fraction of the half canvas; the rest is room for the swell and the halo
    autoVoice: true,        // synthesize a voice while speaking with no level
    dprMax: 2,
    ...options,
  };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl2', GL_OPTS) || canvas.getContext('webgl', GL_OPTS);

  const orb = {
    ok: !!gl,
    state: 'idle',
    theme: opts.theme,
    setState() {}, setLevel() {}, pulse() {}, setTheme() {}, setPalette() {},
    attachMic: async () => ({ stop() {} }),
    attachAudio: () => ({ stop() {} }),
    destroy() {},
  };
  if (!gl) { canvas.parentElement && canvas.parentElement.classList.add('orb-fallback'); return orb; }

  // ---- program
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const name of ['uRes', 'uTime', 'uCloudT', 'uRot', 'uRadius', 'uBreath', 'uLevel', 'uSpeak', 'uListen', 'uThink', 'uSoft', 'uRimMix', 'uGlow', 'uSeed', 'uTintAmt', 'uDeep', 'uMid', 'uLight', 'uBg', 'uTint']) U[name] = gl.getUniformLocation(prog, name);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);

  // ---- live values (current) and where they are going (target)
  const seed = Math.random() * 100;
  const cur = { listen: 0, think: 0, speak: 0, level: 0, tintAmt: 0, breath: 0 };
  const tgt = { listen: 0, think: 0, speak: 0 };
  let time = 0, cloudT = 0, rot = 0, speakT = 0;
  let extLevel = 0, extAt = -1e9, pulseLevel = 0;
  const pal = { deep: [0, 0, 0], mid: [0, 0, 0], light: [0, 0, 0], tint: [0, 0, 0], rimMix: 0, glow: 0 };
  const palTgt = { ...pal };
  let bg = [1, 1, 1];
  let dpr = 1, w = 0, h = 0;

  const resolvePalette = (name, theme) => {
    const p = typeof name === 'string' ? (PALETTES[name] || PALETTES.sky)[theme] : name;
    return { deep: hex(p.deep), mid: hex(p.mid), light: hex(p.light), tint: hex(p.tint || p.mid), rimMix: p.rimMix ?? 0.3, glow: p.glow ?? 0 };
  };
  const applyPalette = (p, instant) => {
    Object.assign(palTgt, p);
    if (instant) Object.assign(pal, p);
  };
  let paletteName = opts.palette;
  const bgFor = (theme) => hex(opts.bg || (theme === 'dark' ? '#0c0d0f' : '#ffffff'));
  bg = bgFor(opts.theme);
  applyPalette(resolvePalette(paletteName, opts.theme), true);

  // ---- size
  function resize() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return false;                          // hidden: keep the old buffer
    dpr = Math.min(opts.dprMax, devicePixelRatio || 1);
    const nw = Math.round(cw * dpr), nh = Math.round(ch * dpr);
    if (nw !== w || nh !== h) { w = nw; h = nh; canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    return true;
  }

  // ---- one frame
  function draw() {
    if (!resize()) return;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uTime, time);
    gl.uniform1f(U.uCloudT, cloudT);
    gl.uniform1f(U.uRot, rot);
    gl.uniform1f(U.uRadius, opts.radius);
    gl.uniform1f(U.uBreath, cur.breath);
    gl.uniform1f(U.uLevel, cur.level);
    gl.uniform1f(U.uSpeak, cur.speak);
    gl.uniform1f(U.uListen, cur.listen);
    gl.uniform1f(U.uThink, cur.think);
    gl.uniform1f(U.uSoft, 0.11 + cur.level * 0.03 + cur.think * 0.02);
    gl.uniform1f(U.uRimMix, pal.rimMix);
    gl.uniform1f(U.uGlow, pal.glow * (0.7 + 0.5 * cur.level + 0.3 * cur.speak));
    gl.uniform1f(U.uSeed, seed);
    gl.uniform1f(U.uTintAmt, cur.tintAmt);
    gl.uniform3fv(U.uDeep, pal.deep);
    gl.uniform3fv(U.uMid, pal.mid);
    gl.uniform3fv(U.uLight, pal.light);
    gl.uniform3fv(U.uBg, bg);
    gl.uniform3fv(U.uTint, pal.tint);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---- motion
  function tick(dt, now) {
    for (const k of ['listen', 'think', 'speak']) cur[k] = ease(cur[k], tgt[k], dt, 0.35);

    // the level: a live one wins; otherwise the pseudo voice while speaking; a pulse rides on top
    pulseLevel = Math.max(0, pulseLevel - dt * 5.5);
    const live = now - extAt < 250;
    let want = live ? extLevel : 0;
    if (!live && orb.state === 'speaking' && opts.autoVoice) want = syntheticVoice(speakT) * 0.9;
    want = Math.max(want, pulseLevel);
    cur.level = ease(cur.level, want, dt, want > cur.level ? 0.045 : 0.16);

    // the accent comes in while it works, never at rest
    const working = Math.max(tgt.think, tgt.speak * 0.8, tgt.listen * 0.45);
    cur.tintAmt = ease(cur.tintAmt, working * 0.14 * (paletteName === 'ink' ? 1 : 0.35), dt, 0.5);

    cur.breath = 0.010 * Math.sin(time * 0.9) + cur.think * 0.012 * Math.sin(time * 3.1);
    time += dt * (1 + cur.speak * 0.6);
    cloudT += dt * (0.045 + cur.think * 0.12 + cur.level * 0.06);
    rot += dt * (0.10 + cur.think * 0.25 + cur.speak * 0.05 + cur.listen * 0.03);
    if (orb.state === 'speaking') speakT += dt;

    for (const k of ['deep', 'mid', 'light', 'tint']) for (let i = 0; i < 3; i++) pal[k][i] = ease(pal[k][i], palTgt[k][i], dt, 0.45);
    pal.rimMix = ease(pal.rimMix, palTgt.rimMix, dt, 0.45);
    pal.glow = ease(pal.glow, palTgt.glow, dt, 0.45);
  }

  // ---- the loop: runs only while visible, on screen and not reduced-motion
  let raf = 0, last = 0, visible = true, onScreen = true, dead = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    tick(dt, now);
    draw();
  }
  function schedule() {
    if (dead) return;
    const run = visible && onScreen && !reduced;
    if (run && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    if (reduced) { settleStill(); draw(); }
  }
  // reduced motion: jump to the state's resting look, one frame, no ripple
  function settleStill() {
    Object.assign(cur, { listen: tgt.listen, think: tgt.think, speak: 0, level: 0, breath: 0 });
    Object.assign(pal, palTgt);
  }
  const onVis = () => { visible = !document.hidden; schedule(); };
  document.addEventListener('visibilitychange', onVis);
  let io = null;
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); schedule(); });
    io.observe(canvas);
  }
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => { if (reduced) draw(); }); ro.observe(canvas); }
  schedule();

  // ---- audio helpers
  let audioCtx = null;
  const ctx = () => (audioCtx ||= new (window.AudioContext || window.webkitAudioContext)());
  function levelFrom(analyser, gain = 1) {
    const buf = new Float32Array(analyser.fftSize);
    let id = 0;
    const read = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      orb.setLevel(clamp01(Math.pow(rms * 4.2 * gain, 0.8)));
      id = requestAnimationFrame(read);
    };
    id = requestAnimationFrame(read);
    return () => cancelAnimationFrame(id);
  }

  // ---- api
  orb.setState = (state) => {
    if (!STATES.includes(state) || state === orb.state) return;
    orb.state = state;
    if (state === 'speaking') speakT = 0;
    tgt.listen = state === 'listening' ? 1 : 0;
    tgt.think = state === 'thinking' ? 1 : 0;
    tgt.speak = state === 'speaking' ? 1 : 0;
    if (reduced) schedule();
  };
  orb.setLevel = (v) => { extLevel = clamp01(v); extAt = performance.now(); };
  orb.pulse = (v = 0.8) => { pulseLevel = Math.max(pulseLevel, clamp01(v)); };
  orb.setTheme = (theme) => {
    orb.theme = theme === 'dark' ? 'dark' : 'light';
    bg = bgFor(orb.theme);
    applyPalette(resolvePalette(paletteName, orb.theme), false);
    if (reduced) schedule();
  };
  orb.setPalette = (name, instant = false) => {
    paletteName = typeof name === 'string' ? name : 'custom';
    applyPalette(resolvePalette(name, orb.theme), instant);
    if (reduced) schedule();
  };
  orb.attachMic = async (constraints = { audio: { echoCancellation: true, noiseSuppression: true } }) => {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const c = ctx();
    if (c.state === 'suspended') await c.resume();
    const src = c.createMediaStreamSource(stream);
    const an = c.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.4;
    src.connect(an);
    const stopRead = levelFrom(an, 1.6);
    return { stop() { stopRead(); src.disconnect(); stream.getTracks().forEach((t) => t.stop()); } };
  };
  orb.attachAudio = (source, gain = 1) => {
    const c = ctx();
    const node = source instanceof AudioNode ? source : c.createMediaElementSource(source);
    const an = c.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.5;
    node.connect(an);
    if (!(source instanceof AudioNode)) an.connect(c.destination);
    const stopRead = levelFrom(an, gain);
    return { stop() { stopRead(); node.disconnect(); } };
  };
  // advance the motion by hand and draw one frame: tests, captures, reduced motion
  orb.step = (dt = 1 / 60, frames = 1) => {
    const now = performance.now();
    for (let i = 0; i < frames; i++) tick(dt, now);
    draw();
  };
  orb.destroy = () => {
    dead = true;
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener('visibilitychange', onVis);
    io && io.disconnect();
    ro && ro.disconnect();
    const lose = gl.getExtension('WEBGL_lose_context');
    lose && lose.loseContext();
  };
  return orb;
}

const GL_OPTS = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' };
