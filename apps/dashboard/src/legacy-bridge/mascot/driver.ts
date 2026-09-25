/**
 * The driver: puts the character on a canvas and keeps it moving. It owns the frame loop (stopped while the tab is
 * hidden or the canvas is off screen), the canvas's size at the device's pixel ratio, the pointer, the theme's tokens
 * and their re-read when the theme changes, the level a word heard pushes up, and still frames under reduced motion.
 *
 * A face inside a button (the top bar's Ask, the phone's ✦) is an icon: it is attended while the pointer is near
 * that button or the button has focus, it goes quiet after a while alone, and a press on it gathers the stack. Any
 * other face (the Stage, the phone's takeover) is open, so always attended. Either looks at the pointer only while
 * it is near, never from across the page. Its canvas is always a 2D one: each frame is drawn liquid by the page's one
 * WebGL2 context and copied in (liquid.ts), or, where that cannot draw (no WebGL2, a lost context), as the layered mark
 * in 2D (draw.ts); a frame that would draw what is already there is skipped. Every browser API comes in through `env`,
 * with defaults read from window and document, so the tests run it on node with a fake canvas and a fake clock.
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
import { liquid as liquidDrawing, type GlCanvas, type Liquid } from "./liquid";

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
    liquid: () => liquidDrawing(() => (d ? (d.createElement("canvas") as unknown as GlCanvas) : null)),
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

export function mountCharacter(canvas: CanvasLike, opts: MountOptions = {}): Mounted | null {
  const env: DriverEnv = { ...browserEnv(), ...(opts.env ?? {}) };
  const button = typeof canvas.closest === "function" ? canvas.closest("button, a") : null;
  const role: Role = opts.role ?? (button ? "icon" : "open");
  const own = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  if (!own) return null;
  const ctx: CanvasRenderingContext2D = own;
  const liquid: Liquid | null = env.reduced ? null : env.liquid() || null;
  const character: Character = createCharacter({
    seed: opts.seed ?? 7,
    calm: env.reduced,
    enter: !env.reduced,
    light: true,
    quietAfter: role === "icon" ? ICON_QUIET_AFTER : Infinity,
  });
  const tone = opts.tone ?? "page";
  let palTarget = palette(env.theme(), env.tokens(), tone);
  const pal: Palette = clonePalette(palTarget);
  let w = 0;
  let h = 0;
  let heardLevel = 0;
  // the tile's size in CSS px: the target the page sets, and the one drawn, which follows it in about a tenth of a
  // second so the tiles grow with the stage instead of jumping ahead of it
  let sideTarget = opts.side ?? 0;
  let sideNow = sideTarget;
  let raf = 0;
  let last = 0;
  let visible = !env.hidden();
  let onScreen = true;
  let dead = false;
  let attention = role === "icon" ? 0 : 1;
  let focused = false;
  let drawn = "";
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
      drawn = "";
    }
    return true;
  }
  function frame(dt: number): void {
    // a word heard lifts the level to 0.8; it falls to nothing in about half a second of silence
    heardLevel = Math.max(0, heardLevel - dt * 1.5);
    character.hear(heardLevel);
    if (sideTarget > 0)
      sideNow = env.reduced ? sideTarget : sideNow + (sideTarget - sideNow) * (1 - Math.exp(-dt / 0.1));
    if (!fit()) return;
    const side = sideTarget > 0 ? sideNow * env.dpr() : fitSide(w, h);
    character.detail(side / env.dpr());
    character.attend(focused ? 1 : attention);
    if (!env.reduced) character.tick(dt);
    easePalette(pal, palTarget, env.reduced ? 1e6 : dt);
    const f = character.frame();
    const sig = signature(f, pal, side, w, h);
    if (sig === drawn) return;
    drawn = sig;
    if (!liquid || !liquid.draw(ctx, f, pal, side, w, h)) drawCharacter(ctx, w, h, f, pal, side);
  }
  function loop(ms: number): void {
    raf = env.raf(loop);
    const dt = Math.min(0.05, Math.max(0, (ms - (last || ms)) / 1000));
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
  function pointer(e: { clientX: number; clientY: number } | null): void {
    if (env.reduced) return;
    if (!e) {
      character.away();
      if (role === "icon") attention = 0;
      return;
    }
    const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    if (!r || !r.width) return;
    if (role === "icon") {
      const b = button && typeof button.getBoundingClientRect === "function" ? button.getBoundingClientRect() : r;
      const gx = Math.max(b.left - e.clientX, 0, e.clientX - (b.left + b.width));
      const gy = Math.max(b.top - e.clientY, 0, e.clientY - (b.top + b.height));
      attention = Math.hypot(gx, gy) < ATTEND_WITHIN ? 1 : 0;
    }
    const unit = sideTarget > 0 ? sideNow : fitSide(r.width, r.height);
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const within = role === "icon" ? LOOK_WITHIN.icon : Math.max(LOOK_WITHIN.open, r.width * 1.6);
    const dist = Math.hypot(dx, dy);
    // full attention up to half the radius, fading to none at it
    const u = Math.max(0, Math.min(1, (dist - within / 2) / (within / 2)));
    const fade = 1 - u * u * (3 - 2 * u);
    if (fade <= 0) {
      character.away();
      return;
    }
    const inside = button
      ? (() => {
          const b = button.getBoundingClientRect();
          return e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
        })()
      : dist / unit < 2.3;
    character.look((dx / unit / 4) * fade, (dy / unit / 4) * fade, inside);
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
  undo.push(env.onPointer(pointer));
  undo.push(
    env.onTheme(() => {
      palTarget = palette(env.theme(), env.tokens(), tone);
      stillFrame();
      if (!raf) frame(0);
    }),
  );
  if (button && typeof button.addEventListener === "function") {
    const down = () => character.press(true);
    const up = () => character.press(false);
    const fin = () => (focused = true);
    const fout = () => (focused = false);
    const names: [string, () => void][] = [
      ["pointerdown", down],
      ["pointerup", up],
      ["pointercancel", up],
      ["pointerleave", up],
      ["focusin", fin],
      ["focusout", fout],
    ];
    for (const [n, fn] of names) button.addEventListener(n, fn);
    undo.push(() => {
      for (const [n, fn] of names) button.removeEventListener(n, fn);
    });
  }
  run();
  if (env.reduced) stillFrame();
  else frame(0);

  return {
    get state() {
      return character.state;
    },
    role,
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
    pulse(v) {
      character.pulse(v);
    },
    step(dt = 1 / 60, frames = 1) {
      for (let i = 0; i < frames; i++) frame(dt);
    },
    destroy() {
      dead = true;
      if (raf) env.caf(raf);
      raf = 0;
      liquid?.release();
      for (const u of undo.splice(0)) u();
    },
  };
}
