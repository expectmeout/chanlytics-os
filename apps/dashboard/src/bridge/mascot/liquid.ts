/**
 * The liquid three, on WebGL2 (Ruben, 25 Sep: "liquid style"). Two pictures, mixed by how liquid the moment is: the
 * layered mark (each tile over its shadow, back to front, as draw.ts draws it) and one field of the three joined by a
 * smooth minimum, so tiles that pass close fuse like mercury. The shadows fall off as draw.ts's do (a Gaussian; here
 * its logistic twin), so the two drawings agree where a face passes from one to the other.
 *
 * One WebGL2 context serves every face on the page. It draws offscreen and each face copies the picture into its own
 * 2D canvas, so a face's canvas is never a WebGL one: where WebGL2 is missing, its program fails or its context is
 * lost (a GPU reset, a phone that puts the tab away), `draw` says so and the face draws the layered mark in 2D instead
 * of a broken canvas. The program links without holding up the page where the browser allows
 * (KHR_parallel_shader_compile); until it is linked, `draw` says so too.
 */
import { CENTRE_Y, type CharacterFrame } from "./character";
import { labRgb, type Palette } from "./colour";
import { tilesOf } from "./draw";

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uK; uniform float uLiq; uniform vec3 uSh;
uniform vec4 uA[3]; uniform vec4 uS[3]; uniform vec4 uC[3]; uniform float uR[3];
out vec4 o;
vec2 rot(vec2 q, float a){ float c = cos(a), s = sin(a); return vec2(c*q.x + s*q.y, -s*q.x + c*q.y); }
float box(vec2 q, float h, float r){ vec2 d = abs(q) - vec2(h - r); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
float tile(int i, vec2 P, float grow){ vec4 a = uA[i]; if (a.z < 0.5) return 1e5; return box(rot(P - a.xy, a.w), a.z * 0.5 + grow, max(0.0, uR[i] + grow)); }
float smin(float a, float b, float k){ if (k <= 0.0) return min(a, b); float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
vec4 over(vec4 dst, vec4 src){ return src + dst * (1.0 - src.a); }
float soft(float d, float sigma){ return 1.0 / (1.0 + exp(1.702 * d / sigma)); }
void main(){
  vec2 P = vec2(gl_FragCoord.x - uRes.x * 0.5, (uRes.y - gl_FragCoord.y) - uRes.y * 0.5);
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 3; i++) {
    float sa = uC[i].a * soft(tile(i, P - uS[i].xy, uS[i].w), max(uS[i].z, 0.5));
    acc = over(acc, vec4(uSh * sa, sa));
    float ta = clamp(0.5 - tile(i, P, 0.0), 0.0, 1.0);
    acc = over(acc, vec4(uC[i].rgb * ta, ta));
  }
  if (uLiq <= 0.001) { o = acc; return; }
  float d0 = tile(0, P, 0.0), d1 = tile(1, P, 0.0), d2 = tile(2, P, 0.0);
  float du = smin(smin(d0, d1, uK), d2, uK);
  float s0 = tile(0, P - uS[0].xy, uS[0].w), s1 = tile(1, P - uS[1].xy, uS[1].w), s2 = tile(2, P - uS[2].xy, uS[2].w);
  float su = smin(smin(s0, s1, uK), s2, uK);
  float sa = uC[2].a * soft(su, max(uS[2].z, 0.5));
  float s = max(uK * 0.35, 0.75);
  float m = min(d0, min(d1, d2));
  vec3 w = exp(-(vec3(d0, d1, d2) - m) / s);
  vec3 col = (uC[0].rgb * w.x + uC[1].rgb * w.y + uC[2].rgb * w.z) / (w.x + w.y + w.z);
  if (d2 < 0.5) col = uC[2].rgb;
  float a = clamp(0.5 - du, 0.0, 1.0);
  vec4 uni = over(vec4(uSh * sa, sa), vec4(col * a, a));
  o = mix(acc, uni, smoothstep(0.0, 0.35, uLiq));
}`;

type Uniforms = Record<"res" | "k" | "liq" | "sh" | "a" | "s" | "c" | "r", WebGLUniformLocation | null>;
interface Linking {
  prog: WebGLProgram;
  buf: WebGLBuffer;
}
interface Program extends Linking {
  loc: number;
  u: Uniforms;
}
/** Compiles and links the program, and fills the one triangle, without waiting for the link. */
function linkShaders(gl: WebGL2RenderingContext): Linking | null {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (s) {
      gl.shaderSource(s, src);
      gl.compileShader(s);
    }
    return s;
  };
  const vs = shader(gl.VERTEX_SHADER, VERT);
  const fs = shader(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  const buf = gl.createBuffer();
  if (!vs || !fs || !prog || !buf) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return { prog, buf };
}
/** The linked program's locations, or null where the link failed. */
function finish(gl: WebGL2RenderingContext, l: Linking): Program | null {
  if (!gl.getProgramParameter(l.prog, gl.LINK_STATUS)) return null;
  const at = (n: string) => gl.getUniformLocation(l.prog, n);
  return {
    ...l,
    loc: gl.getAttribLocation(l.prog, "p"),
    u: {
      res: at("uRes"),
      k: at("uK"),
      liq: at("uLiq"),
      sh: at("uSh"),
      a: at("uA"),
      s: at("uS"),
      c: at("uC"),
      r: at("uR"),
    },
  };
}

/** What a face asks of the liquid drawing: draw this frame into my 2D canvas, or say you cannot. */
export interface Liquid {
  /** true when the liquid three were drawn into `into`; false when they could not be, so the face draws in 2D */
  draw(
    into: CanvasRenderingContext2D,
    frame: CharacterFrame,
    pal: Palette,
    side: number,
    w: number,
    h: number,
  ): boolean;
  /** the face is gone; the last face to go lets the context go */
  release(): void;
}
/** An offscreen canvas as the renderer needs it. */
export interface GlCanvas {
  width: number;
  height: number;
  getContext(kind: "webgl2", attrs?: WebGLContextAttributes): WebGL2RenderingContext | null;
  addEventListener?(type: string, fn: (e: Event) => void): void;
}

/** A context that loses itself this often is not tried again on this page. */
const MAX_LOSSES = 3;
interface Shared {
  canvas: GlCanvas;
  gl: WebGL2RenderingContext;
  /** the program while it links */
  linking: Linking | null;
  /** the program once it has linked */
  program: Program | null;
  parallel: { COMPLETION_STATUS_KHR: number } | null;
  users: number;
  losses: number;
  /** the page is letting this context go, so its loss is meant */
  closing: boolean;
}
let shared: Shared | null = null;
let givenUp = false;

function letGo(s: Shared): void {
  s.closing = true;
  if (shared === s) shared = null;
  try {
    s.gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    /* already gone */
  }
}
/** No liquid drawing on this page from here on. */
function giveUp(s: Shared): void {
  givenUp = true;
  s.program = null;
  s.linking = null;
  letGo(s);
}

function open(make: () => GlCanvas | null): Shared | null {
  if (givenUp) return null;
  if (shared) return shared;
  try {
    const canvas = make();
    const gl = canvas?.getContext("webgl2", { premultipliedAlpha: true, antialias: false, alpha: true }) ?? null;
    if (!canvas || !gl) return null;
    const s: Shared = {
      canvas,
      gl,
      linking: linkShaders(gl),
      program: null,
      parallel: gl.getExtension("KHR_parallel_shader_compile"),
      users: 0,
      losses: 0,
      closing: false,
    };
    if (!s.linking) {
      giveUp(s);
      return null;
    }
    canvas.addEventListener?.("webglcontextlost", (e) => {
      if (s.closing) return;
      e.preventDefault();
      s.program = null;
      s.linking = null;
      s.losses += 1;
      if (s.losses >= MAX_LOSSES) giveUp(s);
    });
    canvas.addEventListener?.("webglcontextrestored", () => {
      if (!givenUp && !s.closing) s.linking = linkShaders(gl);
    });
    shared = s;
    return s;
  } catch {
    return null;
  }
}
/** The program once it has linked: null while it links, and for good once the link has failed. */
function programOf(s: Shared): Program | null {
  if (s.program || !s.linking) return s.program;
  if (s.parallel && !s.gl.getProgramParameter(s.linking.prog, s.parallel.COMPLETION_STATUS_KHR)) return null;
  s.program = finish(s.gl, s.linking);
  s.linking = null;
  if (!s.program) giveUp(s);
  return s.program;
}

/**
 * The page's liquid drawing, for one face: null where WebGL2 cannot draw here at all. `make` gives the offscreen
 * canvas (the browser's is `document.createElement("canvas")`); it is asked once per page.
 */
export function liquid(make: () => GlCanvas | null): Liquid | null {
  const s = open(make);
  if (!s) return null;
  s.users += 1;
  const A = new Float32Array(12);
  const S = new Float32Array(12);
  const C = new Float32Array(12);
  const R = new Float32Array(3);
  let released = false;
  return {
    draw(into, frame, pal, side, w, h) {
      const { gl, canvas } = s;
      if (givenUp || s.closing || gl.isContextLost() || w < 1 || h < 1) return false;
      const b = programOf(s);
      if (!b) return false;
      // the offscreen canvas only ever grows; each face draws into its bottom-left corner
      if (canvas.width < w) canvas.width = w;
      if (canvas.height < h) canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(b.prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
      gl.enableVertexAttribArray(b.loc);
      gl.vertexAttribPointer(b.loc, 2, gl.FLOAT, false, 0, 0);
      tilesOf(frame, pal, side).forEach((t, i) => {
        A.set([t.x, t.y + CENTRE_Y * side, t.size, t.rot], i * 4);
        S.set([t.shadow.x, t.shadow.y, t.shadow.sigma, t.shadow.spread], i * 4);
        C.set([...labRgb(t.colour), t.shadow.alpha], i * 4);
        R[i] = t.radius;
      });
      gl.uniform2f(b.u.res, w, h);
      gl.uniform1f(b.u.k, frame.liquid * 0.22 * side);
      gl.uniform1f(b.u.liq, frame.liquid);
      gl.uniform3fv(b.u.sh, labRgb(pal.shadow));
      gl.uniform4fv(b.u.a, A);
      gl.uniform4fv(b.u.s, S);
      gl.uniform4fv(b.u.c, C);
      gl.uniform1fv(b.u.r, R);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (gl.isContextLost()) return false;
      // copied in the same task it was drawn, before the browser may clear the drawing buffer
      into.setTransform(1, 0, 0, 1, 0, 0);
      into.clearRect(0, 0, w, h);
      into.drawImage(canvas as unknown as CanvasImageSource, 0, canvas.height - h, w, h, 0, 0, w, h);
      return true;
    },
    release() {
      if (released) return;
      released = true;
      s.users -= 1;
      // the last face gone: the page gives its context back
      if (s.users <= 0 && shared === s) letGo(s);
    },
  };
}

/** For tests: forget the page's context and any giving up, as a fresh page would. */
export function resetLiquid(): void {
  shared = null;
  givenUp = false;
}
