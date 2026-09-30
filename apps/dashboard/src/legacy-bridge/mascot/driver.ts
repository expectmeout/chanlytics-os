/**
 * The driver: puts the character on a canvas and keeps it moving. It owns the frame loop (stopped while the tab is
 * hidden or the canvas is off screen), the canvas's size at the device's pixel ratio, the pointer, the theme's tokens
 * and their re-read when the theme changes, the level a word heard pushes up, and still frames under reduced motion.
 *
 * A face inside a button (the top bar's Ask, the phone's ✦) is an icon: it is attended while the pointer is near
 * that button or the button has focus, it goes quiet after a while alone, and a press on it gathers the stack. Any
 * other face (the Stage, the phone's takeover) is open, so always attended. Either looks at the pointer only while
 * it is near, never from across the page. Its canvas is always a 2D one: while the tiles may fuse (listening, reading,
 * answering) a frame is drawn liquid by the page's one WebGL2 context and copied in (liquid.ts); at rest, and where
 * that cannot draw (no WebGL2, a lost context), the layered mark is drawn in 2D (draw.ts); a frame that would draw
 * what is already there is skipped. Every browser API comes in through `env`, with defaults read from window and
 * document, so the tests run it on node with a fake canvas and a fake clock.
 */
import { createCharacter, fitSide, type Character, type CharacterState, type Reaction } from "./character";
import {
  clonePalette,
  easePalette,
  palette,
  type Palette,
  type ThemeName,
  type ThemeTokens,
  type Tone,
} from "./colour";
import { drawCharacter } from "./draw";
import { liquid as liquidDrawing, type Liquid } from "./liquid";
import { smooth } from "./math";

export interface DriverEnv {
  raf: (cb: (ms: number) => void) => number;
  caf: (id: number) => void;
  now: () => number;
  dpr: () => number;
  reduced: boolean;
  hidden: () => boolean;
  onVisibility: (fn: () => void) => () => void;
  onScreen: (el: Element, fn: (visible: boolean) => void) => () => void;
  onResize: (el: Element, fn: () => void) => () => void;
  onPointer: (fn: (e: { clientX: number; clientY: number } | null) => void) => () => void;
  theme: () => ThemeName;
  tokens: () => ThemeTokens;
  onTheme: (fn: () => void) => () => void;
  /** the page's liquid drawing for one more face, or null where WebGL2 cannot draw here */
  liquid: () => Liquid | null;
}
export type Role = "icon" | "open";
export interface MountOptions {
  /** one tile, in CSS pixels; by default the largest that fits the whole character in the canvas (fitSide) */
  side?: number;
  seed?: number;
  /** drawn on the page (the default) or on a coral button (colour.ts `Tone`) */
  tone?: Tone;
  /** an icon (inside a button) or an open face; by default read from where the canvas sits */
  role?: Role;
  env?: Partial<DriverEnv>;
}
export interface Mounted {
  readonly state: CharacterState;
  readonly role: Role;
  set(next: CharacterState): void;
  /** one tile, in CSS pixels: the drawing eases toward it, so a stage that grows grows its tiles with it */
  setSide(px: number): void;
  side(): number;
  /** a word heard: the level jumps to `v` and falls on its own */
  hear(v: number): void;
  level(): number;
  beat(strength?: number): void;
  react(kind: Reaction): void;
  /** a read that landed */
  pulse(strength?: number): void;
  /** lit at rest, as a page arrives on a phone (mood.ts glow) */
  glow(v: number): void;
  /** advance by hand and draw: captures and tests */
  step(dt?: number, frames?: number): void;
  destroy(): void;
}
/** The canvas as the driver needs it: what a real HTMLCanvasElement has, without asking for one. */
export interface CanvasLike {
  width?: number;
  height?: number;
  clientWidth: number;
  clientHeight: number;
  getContext?: (kind: "2d") => CanvasRenderingContext2D | null;
  getBoundingClientRect?: () => { left: number; top: number; width: number; height: number };
  closest?: (selector: string) => Element | null;
}

/** How near the pointer must be (CSS px from the face) before the three look at it; an icon's button is nearer. */
const LOOK_WITHIN: Record<Role, number> = { icon: 110, open: 240 };
/** How near its button the pointer must be for an icon to count as attended. */
const ATTEND_WITHIN = 90;
/** Seconds at rest, alone, before an icon goes quiet. */
const ICON_QUIET_AFTER = 18;

function browserEnv(): DriverEnv {
  const w = typeof window !== "undefined" ? window : null;
  const d = typeof document !== "undefined" ? document : null;
  const media = (q: string) => !!(w && typeof w.matchMedia === "function" && w.matchMedia(q).matches);
  return {
    raf: (cb) => (w && typeof w.requestAnimationFrame === "function" ? w.requestAnimationFrame(cb) : 0),
    caf: (id) => {
      if (w && typeof w.cancelAnimationFrame === "function") w.cancelAnimationFrame(id);
    },
    now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
    dpr: () => Math.min(2, (w && w.devicePixelRatio) || 1),
    reduced: media("(prefers-reduced-motion: reduce)"),
    hidden: () => !!(d && d.hidden),
    onVisibility: (fn) => {
      if (!d) return () => {};
      d.addEventListener("visibilitychange", fn);
      return () => d.removeEventListener("visibilitychange", fn);
    },
    onScreen: (el, fn) => {
      if (!w || typeof w.IntersectionObserver !== "function") return () => {};
      const io = new w.IntersectionObserver((es) => fn(es.some((e) => e.isIntersecting)));
      io.observe(el);
      return () => io.disconnect();
    },
    onResize: (el, fn) => {
      if (!w || typeof w.ResizeObserver !== "function") return () => {};
      const ro = new w.ResizeObserver(() => fn());
      ro.observe(el);
      return () => ro.disconnect();
    },
    onPointer: (fn) => {
      if (!w) return () => {};
      const move = (e: PointerEvent) => fn(e);
      const gone = () => fn(null);
      w.addEventListener("pointermove", move, { passive: true });
      d?.documentElement.addEventListener("pointerleave", gone);
      return () => {
        w.removeEventListener("pointermove", move);
        d?.documentElement.removeEventListener("pointerleave", gone);
      };
    },
    theme: () => (d?.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    tokens: () => {
      if (!w || !d) return {};
      const cs = w.getComputedStyle(d.documentElement);
      const v = (n: string) => cs.getPropertyValue(n).trim() || null;
      return { bg: v("--bg"), ink: v("--ink"), accent: v("--accent"), accentFg: v("--accent-fg") };
    },
    onTheme: (fn) => {
      if (!w || !d || typeof w.MutationObserver !== "function") return () => {};
      const mo = new w.MutationObserver(fn);
      mo.observe(d.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => mo.disconnect();
    },
    liquid: () => liquidDrawing(() => (d ? d.createElement("canvas") : null)),
  };
}

const r3 = (v: number) => Math.round(v * 1000);
/** Everything a frame draws, as a string: the same string twice is nothing to draw. */
function signature(f: ReturnType<Character["frame"]>, pal: Palette, side: number, w: number, h: number): string {
  const tiles = f.squares.map((s) =>
    [s.x, s.y, s.size, s.rot, s.lift, s.charge, s.live, s.shade, s.layer].map(r3).join(","),
  );
  return [
    tiles.join("|"),
    r3(f.liquid),
    r3(f.corner),
    r3(f.gaze[0]),
    r3(f.gaze[1]),
    r3(pal.rest[0][0]),
    r3(pal.live[2][0]),
    r3(pal.shadowAlpha),
    r3(side),
    w,
    h,
  ].join(";");
}

/**
 * A face's share of the page's WebGL2 context, asked for the first time its tiles may fuse, never at mount: at rest
 * (every page's first draw, and every tab the phone app opens) the mark is 2D, and a context made for it cost each page
 * its GPU memory and, measured on an Android WebView (27 Sep 2026), 1.5 s of the main thread as Today loaded. Until its
 * program links, the draw says so and the 2D mark stands in. None under reduced motion, whose frames are all 2D.
 */
function liquidOnDemand(env: DriverEnv): { now(): Liquid | null; release(): void } {
  let liquid: Liquid | null | undefined = env.reduced ? null : undefined; // undefined: not asked yet
  return {
    now: () => (liquid === undefined ? (liquid = env.liquid() || null) : liquid),
    release: () => liquid?.release(),
  };
}

/**
 * A face as it is mounted: what it draws with, and what changes as it runs. `loop` is the one frame callback of its
 * life, handed to `env.raf` each frame.
 */
interface LiveFace {
  readonly canvas: CanvasLike;
  readonly env: DriverEnv;
  readonly button: Element | null;
  readonly role: Role;
  readonly ctx: CanvasRenderingContext2D;
  readonly liquid: { now(): Liquid | null; release(): void };
  readonly character: Character;
  readonly tone: Tone;
  palTarget: Palette;
  readonly pal: Palette;
  w: number;
  h: number;
  heardLevel: number;
  // the tile's size in CSS px: the target the page sets, and the one drawn, which follows it in about a tenth of a
  // second so the tiles grow with the stage instead of jumping ahead of it
  sideTarget: number;
  sideNow: number;
  raf: number;
  last: number;
  visible: boolean;
  onScreen: boolean;
  dead: boolean;
  attention: number;
  focused: boolean;
  drawn: string;
  readonly undo: (() => void)[];
  readonly loop: (ms: number) => void;
}

/** The face on this canvas, at rest and not yet drawn: null where the canvas has no 2D context. */
function liveFaceOf(canvas: CanvasLike, opts: MountOptions): LiveFace | null {
  const env: DriverEnv = { ...browserEnv(), ...(opts.env ?? {}) };
  const button = typeof canvas.closest === "function" ? canvas.closest("button, a") : null;
  const role: Role = opts.role ?? (button ? "icon" : "open");
  const own = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  if (!own) return null;
  const liquid = liquidOnDemand(env);
  const character: Character = createCharacter({
    seed: opts.seed ?? 7,
    calm: env.reduced,
    enter: !env.reduced,
    light: true,
    quietAfter: role === "icon" ? ICON_QUIET_AFTER : Infinity,
  });
  const tone = opts.tone ?? "page";
  const palTarget = palette(env.theme(), env.tokens(), tone);
  const sideTarget = opts.side ?? 0;
  const face: LiveFace = {
    canvas,
    env,
    button,
    role,
    ctx: own,
    liquid,
    character,
    tone,
    palTarget,
    pal: clonePalette(palTarget),
    w: 0,
    h: 0,
    heardLevel: 0,
    sideTarget,
    sideNow: sideTarget,
    raf: 0,
    last: 0,
    visible: !env.hidden(),
    onScreen: true,
    dead: false,
    attention: role === "icon" ? 0 : 1,
    focused: false,
    drawn: "",
    undo: [],
    loop: (ms) => loopFrame(face, ms),
  };
  return face;
}

function fitCanvas(face: LiveFace): boolean {
  const cw = face.canvas.clientWidth;
  const ch = face.canvas.clientHeight;
  if (!cw || !ch) return false;
  const dpr = face.env.dpr();
  const nw = Math.round(cw * dpr);
  const nh = Math.round(ch * dpr);
  if (nw !== face.w || nh !== face.h) {
    face.w = nw;
    face.h = nh;
    face.canvas.width = face.w;
    face.canvas.height = face.h;
    face.drawn = "";
  }
  return true;
}
function drawFrame(face: LiveFace, dt: number): void {
  const { env, character, pal } = face;
  // a word heard lifts the level to 0.8; it falls to nothing in about half a second of silence
  face.heardLevel = Math.max(0, face.heardLevel - dt * 1.5);
  character.hear(face.heardLevel);
  if (face.sideTarget > 0)
    face.sideNow = env.reduced
      ? face.sideTarget
      : face.sideNow + (face.sideTarget - face.sideNow) * (1 - Math.exp(-dt / 0.1));
  if (!fitCanvas(face)) return;
  const { w, h } = face;
  const side = face.sideTarget > 0 ? face.sideNow * env.dpr() : fitSide(w, h);
  character.detail(side / env.dpr());
  character.attend(face.focused ? 1 : face.attention);
  if (!env.reduced) character.tick(dt);
  easePalette(pal, face.palTarget, env.reduced ? 1e6 : dt);
  const f = character.frame();
  const sig = signature(f, pal, side, w, h);
  if (sig === face.drawn) return;
  face.drawn = sig;
  // the GPU draws only what the 2D drawing cannot: the tiles while they may fuse; at rest, the mark in 2D
  const fused = f.liquid > 0.001 && (face.liquid.now()?.draw(face.ctx, f, pal, side, w, h) ?? false);
  if (!fused) drawCharacter(face.ctx, w, h, f, pal, side);
}
function loopFrame(face: LiveFace, ms: number): void {
  face.raf = face.env.raf(face.loop);
  const dt = Math.min(0.05, Math.max(0, (ms - (face.last || ms)) / 1000));
  face.last = ms;
  drawFrame(face, dt);
}
/** The loop runs while the face is shown, on screen and free to move, and stops otherwise. */
function runLoop(face: LiveFace): void {
  if (face.dead) return;
  const go = face.visible && face.onScreen && !face.env.reduced;
  if (go && !face.raf) {
    face.last = 0;
    face.raf = face.env.raf(face.loop);
  }
  if (!go && face.raf) {
    face.env.caf(face.raf);
    face.raf = 0;
  }
}
function stillFrame(face: LiveFace): void {
  if (!face.env.reduced) return;
  face.character.still();
  drawFrame(face, 0);
}
function lookAtPointer(face: LiveFace, e: { clientX: number; clientY: number } | null): void {
  const { canvas, button, role, character } = face;
  if (face.env.reduced) return;
  if (!e) {
    character.away();
    if (role === "icon") face.attention = 0;
    return;
  }
  const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
  if (!r || !(r.width > 0) || !(r.height > 0)) return;
  const b = button && typeof button.getBoundingClientRect === "function" ? button.getBoundingClientRect() : null;
  // how far outside a box the pointer is, each way
  const outside = (box: { left: number; top: number; width: number; height: number }) =>
    Math.hypot(
      Math.max(box.left - e.clientX, 0, e.clientX - (box.left + box.width)),
      Math.max(box.top - e.clientY, 0, e.clientY - (box.top + box.height)),
    );
  if (role === "icon") face.attention = outside(b ?? r) < ATTEND_WITHIN ? 1 : 0;
  const unit = face.sideTarget > 0 ? face.sideNow : fitSide(r.width, r.height);
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height / 2);
  const within = role === "icon" ? LOOK_WITHIN.icon : Math.max(LOOK_WITHIN.open, r.width * 1.6);
  const dist = Math.hypot(dx, dy);
  // full attention up to half the radius, fading to none at it
  const fade = 1 - smooth((dist - within / 2) / (within / 2));
  if (fade <= 0) {
    character.away();
    return;
  }
  const inside = b ? outside(b) === 0 : dist / unit < 2.3;
  character.look((dx / unit / 4) * fade, (dy / unit / 4) * fade, inside);
}

/**
 * The page's listeners, in order: the tab shown or hidden, the canvas on or off screen, its size, the pointer, the
 * theme.
 */
function listenToPage(face: LiveFace): void {
  const { env, canvas, undo } = face;
  undo.push(
    env.onVisibility(() => {
      face.visible = !env.hidden();
      runLoop(face);
    }),
  );
  undo.push(
    env.onScreen(canvas as unknown as Element, (v) => {
      face.onScreen = v;
      runLoop(face);
    }),
  );
  undo.push(
    env.onResize(canvas as unknown as Element, () => {
      if (!face.raf) drawFrame(face, 0);
    }),
  );
  undo.push(env.onPointer((e) => lookAtPointer(face, e)));
  undo.push(
    env.onTheme(() => {
      face.palTarget = palette(env.theme(), env.tokens(), face.tone);
      stillFrame(face);
      if (!face.raf) drawFrame(face, 0);
    }),
  );
}
/** An icon's button: a press gathers the stack, and its focus attends. */
function listenToButton(face: LiveFace): void {
  const { button, character } = face;
  if (button && typeof button.addEventListener === "function") {
    const down = () => character.press(true);
    const up = () => character.press(false);
    const fin = () => (face.focused = true);
    const fout = () => (face.focused = false);
    const names: [string, () => void][] = [
      ["pointerdown", down],
      ["pointerup", up],
      ["pointercancel", up],
      ["pointerleave", up],
      ["focusin", fin],
      ["focusout", fout],
    ];
    for (const [n, fn] of names) button.addEventListener(n, fn);
    face.undo.push(() => {
      for (const [n, fn] of names) button.removeEventListener(n, fn);
    });
  }
}
/**
 * What the page holds of a mounted face. `destroy` stops the loop, gives back its share of the GPU, then undoes the
 * listeners in the order they were added.
 */
function mountedOf(face: LiveFace): Mounted {
  const { character, env } = face;
  return {
    get state() {
      return character.state;
    },
    role: face.role,
    set(next) {
      character.set(next);
      stillFrame(face);
    },
    setSide(px) {
      face.sideTarget = Math.max(1, px);
      if (env.reduced) face.sideNow = face.sideTarget;
      if (!face.raf) drawFrame(face, 0);
    },
    side: () => face.sideNow,
    hear(v) {
      face.heardLevel = Math.max(face.heardLevel, Math.min(1, Math.max(0, v)));
    },
    level: () => face.heardLevel,
    beat(v) {
      character.beat(v);
    },
    react(kind) {
      // calm ignores every reaction, so under reduced motion nothing is redrawn
      character.react(kind);
    },
    pulse(v) {
      character.pulse(v);
    },
    glow(v) {
      character.glow(v);
      stillFrame(face);
    },
    step(dt = 1 / 60, frames = 1) {
      for (let i = 0; i < frames; i++) drawFrame(face, dt);
    },
    destroy() {
      face.dead = true;
      if (face.raf) env.caf(face.raf);
      face.raf = 0;
      face.liquid.release();
      for (const u of face.undo.splice(0)) u();
    },
  };
}

export function mountCharacter(canvas: CanvasLike, opts: MountOptions = {}): Mounted | null {
  const face = liveFaceOf(canvas, opts);
  if (!face) return null;
  listenToPage(face);
  listenToButton(face);
  runLoop(face);
  if (face.env.reduced) stillFrame(face);
  else drawFrame(face, 0);
  return mountedOf(face);
}
