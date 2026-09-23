/**
 * The driver: puts the character on a canvas and keeps it moving. It owns the frame loop (stopped while the tab is
 * hidden or the canvas is off screen), the canvas's size at the device's pixel ratio, the pointer's gaze, the
 * theme's tokens and their re-read when the theme changes, the level a word heard pushes up, and still frames under
 * reduced motion. Every browser API comes in through `env`, with defaults read from window and document, so the
 * tests run it on node with a fake canvas and a fake clock.
 */
import { createCharacter, UNITS, type Character, type CharacterState, type Reaction } from "./character";
import { clonePalette, easePalette, palette, type Palette, type ThemeName, type ThemeTokens } from "./colour";
import { drawCharacter } from "./draw";

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
}
export interface MountOptions {
  /** one square, in CSS pixels; by default the canvas's shorter side holds UNITS squares */
  side?: number;
  seed?: number;
  env?: Partial<DriverEnv>;
}
export interface Mounted {
  readonly state: CharacterState;
  set(next: CharacterState): void;
  /** one square, in CSS pixels: the drawing eases toward it, so a stage that grows grows its squares with it */
  setSide(px: number): void;
  side(): number;
  /** a word heard: the level jumps to `v` and falls on its own */
  hear(v: number): void;
  level(): number;
  beat(strength?: number): void;
  react(kind: Reaction): void;
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
}

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
      return { bg: v("--bg"), ink: v("--ink"), accent: v("--accent") };
    },
    onTheme: (fn) => {
      if (!w || !d || typeof w.MutationObserver !== "function") return () => {};
      const mo = new w.MutationObserver(fn);
      mo.observe(d.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => mo.disconnect();
    },
  };
}

export function mountCharacter(canvas: CanvasLike, opts: MountOptions = {}): Mounted | null {
  const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  if (!ctx) return null;
  const env: DriverEnv = { ...browserEnv(), ...(opts.env ?? {}) };
  const character: Character = createCharacter({ seed: opts.seed ?? 7, calm: env.reduced, enter: !env.reduced });
  let palTarget = palette(env.theme(), env.tokens());
  const pal: Palette = clonePalette(palTarget);
  let w = 0;
  let h = 0;
  let heardLevel = 0;
  // the square's size in CSS px: the target the page sets, and the one drawn, which follows it in about a tenth of a
  // second so the squares grow with the stage instead of jumping ahead of it
  let sideTarget = opts.side ?? 0;
  let sideNow = sideTarget;
  let raf = 0;
  let last = 0;
  let visible = !env.hidden();
  let onScreen = true;
  let dead = false;
  const undo: (() => void)[] = [];

  function fit(): boolean {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return false;
    const dpr = env.dpr();
    const nw = Math.round(cw * dpr);
    const nh = Math.round(ch * dpr);
    if (nw !== w || nh !== h) {
      w = nw;
      h = nh;
      canvas.width = w;
      canvas.height = h;
    }
    return true;
  }
  function frame(dt: number): void {
    // a word heard lifts the level to 0.8; it falls to nothing in about half a second of silence
    heardLevel = Math.max(0, heardLevel - dt * 1.5);
    character.hear(heardLevel);
    if (!env.reduced) character.tick(dt);
    easePalette(pal, palTarget, env.reduced ? 1e6 : dt);
    if (sideTarget > 0)
      sideNow = env.reduced ? sideTarget : sideNow + (sideTarget - sideNow) * (1 - Math.exp(-dt / 0.1));
    if (!fit()) return;
    const side = sideTarget > 0 ? sideNow * env.dpr() : Math.min(w, h) / UNITS;
    drawCharacter(ctx as CanvasRenderingContext2D, w, h, character.frame(), pal, side);
  }
  function loop(ms: number): void {
    raf = env.raf(loop);
    const dt = Math.min(0.05, (ms - (last || ms)) / 1000);
    last = ms;
    frame(dt);
  }
  function run(): void {
    if (dead) return;
    const go = visible && onScreen && !env.reduced;
    if (go && !raf) {
      last = 0;
      raf = env.raf(loop);
    }
    if (!go && raf) {
      env.caf(raf);
      raf = 0;
    }
  }
  function stillFrame(): void {
    if (!env.reduced) return;
    character.still();
    frame(0);
  }
  function gaze(e: { clientX: number; clientY: number } | null): void {
    if (env.reduced) return;
    if (!e) {
      character.away();
      return;
    }
    const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    if (!r || !r.width) return;
    const unit = sideTarget > 0 ? sideNow : Math.min(r.width, r.height) / UNITS;
    const dx = (e.clientX - (r.left + r.width / 2)) / unit;
    const dy = (e.clientY - (r.top + r.height / 2)) / unit;
    character.look(dx / 4, dy / 4, Math.hypot(dx, dy) < 2.3);
  }

  undo.push(
    env.onVisibility(() => {
      visible = !env.hidden();
      run();
    }),
  );
  undo.push(
    env.onScreen(canvas as unknown as Element, (v) => {
      onScreen = v;
      run();
    }),
  );
  undo.push(
    env.onResize(canvas as unknown as Element, () => {
      if (!raf) frame(0);
    }),
  );
  undo.push(env.onPointer(gaze));
  undo.push(
    env.onTheme(() => {
      palTarget = palette(env.theme(), env.tokens());
      stillFrame();
      if (!raf) frame(0);
    }),
  );
  run();
  if (env.reduced) stillFrame();
  else frame(0);

  return {
    get state() {
      return character.state;
    },
    set(next) {
      character.set(next);
      stillFrame();
    },
    setSide(px) {
      sideTarget = Math.max(1, px);
      if (env.reduced) sideNow = sideTarget;
      if (!raf) frame(0);
    },
    side: () => sideNow,
    hear(v) {
      heardLevel = Math.max(heardLevel, Math.min(1, Math.max(0, v)));
    },
    level: () => heardLevel,
    beat(v) {
      character.beat(v);
    },
    react(kind) {
      // calm ignores every reaction, so under reduced motion nothing is redrawn
      character.react(kind);
    },
    step(dt = 1 / 60, frames = 1) {
      for (let i = 0; i < frames; i++) frame(dt);
    },
    destroy() {
      dead = true;
      if (raf) env.caf(raf);
      raf = 0;
      for (const u of undo.splice(0)) u();
    },
  };
}
