/**
 * One motion for every strip of views (docs/superpowers/specs/2026-10-08-one-motion-for-every-strip-design.md).
 *
 * A change of view was two animations with nothing between them but the moment React committed. The page leaving moved
 * by an inline style on the element React was about to take away, so it was cut wherever the next page's render fell
 * (16 ms after a press on People, 115 on the Inbox), and the page arriving began 40px to its side at full opacity
 * whatever the first had been doing; a page that stays mounted across its views (Reports) took a third path, and a desk
 * had a fade where a phone had a slide (measured frame by frame, 8 Oct 2026). The deck is the one place a view moves:
 *
 * - One timeline for a change, started at the press, or where the finger left the page and at the finger's speed: a
 *   critically damped spring toward the page's far side, so nothing eases in from rest, stalls or passes its place.
 * - The page leaving never waits. It moves by Web Animations of `transform` and `opacity` alone, which the compositor
 *   runs while React renders the next page.
 * - The page arriving joins the timeline where it should already be, attached to the edge of the one leaving, and
 *   fades in where it joins.
 * - The node React took away is put back beside its successor as a still copy (the node itself, never a clone: its
 *   canvases keep their pictures and nothing is copied), inert and nameless, until it has left.
 *
 * A view is an element that is replaced when the view changes: the frame's `main`, a lens's body, a section's pane. It
 * registers with `view(owner)`, a callback ref, and says which side it arrives from with `data-slide`. `leave` is the
 * press (the strip's, kit/view-tabs), `drag` and `settle` the finger's (kit/motion/swipe.ts `touchSwipe`, through the strip's
 * pager). How far a page travels is the token `--view-travel`: its own width where the page is one column, a short
 * length on a desk, where the page leaving dims and waits and the two cross-fade. Nothing here knows which page it moves.
 * Where the window scrolls the page (a phone, motion/page-scroll.ts), the copy is pinned to the screen where it stood,
 * since the window moves under it as the next page arrives.
 * A view kept mounted and hidden in place rather than taken away (React's Activity: People's scopes, 18 Oct 2026) leaves
 * by a copy of itself, drawn as it stood, and the view itself is left as React keeps it; a hidden view is never the one a
 * gesture or a press moves.
 */
import { documentScroller, isDocumentScroller, scrollerOf, shownHeight } from "./page-scroll";

/** How long a change of view takes: the spring is within a pixel of its place by then. */
export const TIMELINE_MS = 460;
/** The step the timeline is sampled at; the compositor draws straight lines between the samples. */
const SAMPLE_MS = 20;
/** A page that joins a timeline already under way fades in over this, where it joins. */
export const JOIN_FADE_MS = 90;
/** A change of view under reduced motion: a cross-fade, and no travel. */
export const CROSS_FADE_MS = 160;
/** How long past its timeline a page that left waits for its successor before it comes back. */
export const SUCCESSOR_WAIT_MS = 1200;
/** The spring's pull, each millisecond. */
const PULL = 0.02;
/** A desk's travel in pixels, where no token says one. */
const SHORT_TRAVEL = 56;
/** A page that travels this share of its width or more is one that leaves the screen. */
const WHOLE_SHARE = 0.9;
/** What a page leaving the screen has faded to as it goes off it. */
const OFF_SCREEN = 0.5;
/** What a desk's page dims to while it waits for the next, and the share of its travel it has dimmed by. */
const WAITING = 0.4;
const DIMMED_BY = 0.5;

type Side = 1 | -1;

/** The spring's two constants. A speed that would carry the page past its place is held to the fastest that does not. */
function springOf(from: number, to: number, speed: number): { a: number; b: number } {
  const a = from - to;
  const b = speed + PULL * a;
  return { a, b: a !== 0 && Math.sign(b) === Math.sign(a) ? b : 0 };
}

/** Where a page is, `ms` after it was let go at `from` with `speed` (pixels a millisecond) on its way to `to`. */
export function springAt(from: number, to: number, speed: number, ms: number): number {
  const { a, b } = springOf(from, to, speed);
  return to + (a + b * ms) * Math.exp(-PULL * ms);
}

/** How fast it is moving then, in pixels a millisecond. */
export function speedAt(from: number, to: number, speed: number, ms: number): number {
  const { a, b } = springOf(from, to, speed);
  return (b - PULL * (a + b * ms)) * Math.exp(-PULL * ms);
}

/** How far a page of this width travels, by the token as written: a share of its width, or pixels. */
export function travelOf(token: string, width: number): number {
  const said = token.trim();
  const amount = Number.parseFloat(said);
  if (!Number.isFinite(amount)) return SHORT_TRAVEL;
  return said.endsWith("%") ? (width * amount) / 100 : amount;
}

/** What the deck asks of the page around it: the clock, the person's motion setting, the tokens, and a wait. */
interface DeckEnv {
  /** The document timeline's clock, in milliseconds. */
  now(): number;
  reduced(): boolean;
  /** `--view-travel` as the view's styles say it. */
  travel(el: HTMLElement): string;
  /** How far across an element is drawn from where it rests, in pixels. */
  placeOf(el: HTMLElement): number;
  later(ms: number, fn: () => void): void;
  /**
   * Where the window is what scrolls the view (a phone's page: motion/page-scroll.ts), how tall the screen is; else null,
   * and the view scrolls in a box of its own. Absent, no view is scrolled by the window.
   */
  windowOf?(el: HTMLElement): { screen: number } | null;
  /**
   * A view that arrived, where the window scrolls it, put at its top: the window's own for the outermost view (the
   * frame's page), else the view's top under what stands over the page, if the page had gone past it.
   */
  toTop?(el: HTMLElement, nested: boolean): void;
}

/**
 * Where a view the window scrolls stood on the screen as it was asked to leave: its left edge at rest, its width, its top
 * (above the screen's own where the page had scrolled past it) and the screen's height.
 */
interface Pin {
  left: number;
  top: number;
  width: number;
  screen: number;
}

/** A change of view under way: which side, when it began, how far, and a way to move something else in step with it. */
interface Move {
  readonly dir: Side;
  readonly t0: number;
  readonly ms: number;
  readonly from: number;
  readonly travel: number;
  /** The page leaves the screen (a phone), rather than dimming in place (a desk). */
  readonly whole: boolean;
  /** Animate `el` on this timeline: `frame` answers its keyframe at each share of the way, 0 to 1. Null where nothing travels. */
  follow(el: Element, frame: (progress: number) => Keyframe): Animation | null;
}

interface Timeline extends Move {
  /** What a late arrival fades in over, and a waiting page out. */
  readonly fadeMs: number;
  /** Where the page leaving is, `ms` into the timeline. */
  at(ms: number): number;
  /** How fast, then. */
  pace(ms: number): number;
  /** The share of the way it has gone. */
  progress(ms: number): number;
  /** The opacity of the page leaving. */
  out(ms: number): number;
}

interface Spot {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Held {
  /** Null for a page settling back, which is on no change's timeline. */
  move: Timeline | null;
  role: "out" | "in" | "back";
  /** Where the page stood in what holds it, measured as it was asked to leave. */
  spot: Spot | null;
  /** And where it stood on the screen, where the window scrolled it. */
  pin?: Pin | null;
  anims: Animation[];
}

/** Something that moves in step with a page: the strip's highlight follows a change, and a page settling back. */
export type Follow = Pick<Move, "follow">;

interface Deck {
  /** The callback ref of a view: one per owner, the same on every draw. */
  view(owner: string): (el: HTMLElement | null) => void;
  /** Whether a finger walks the view on screen: only where it travels its own width (a page of one column). */
  walks(): boolean;
  /** The finger carries the view on screen. Answers the share of its width it has gone, 0 to 1. */
  drag(dx: number): number;
  /** The finger lifted, at this speed across (pixels a millisecond): what the page leaves at, if it leaves. */
  letGo(speed: number): void;
  /** The finger let go short: back to rest. Null where nothing moves back (reduced motion, no finger). */
  settle(): Follow | null;
  /** The view on screen leaves toward a side: 1 the next, -1 the one before. */
  leave(dir: Side): Move | null;
  /** The view that was leaving stays after all (the press was taken back): it comes back at once. */
  stay(): void;
  /**
   * A timeline for a highlight that moves with no view under it: the tab bar's, whose places are cut in, never slid
   * (tab-bar/tab-bar.tsx). The spring a tapped strip's highlight rides, begun now. Null under reduced motion, where the
   * tab's own class lights it at once.
   */
  alone(): Follow | null;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const shift = (x: number) => `translate3d(${x}px, 0, 0)`;

/** Keyframes at each sample of `ms`, the last on its end. */
function frames(ms: number, at: (t: number) => Keyframe): Keyframe[] {
  const out: Keyframe[] = [];
  for (let t = 0; t < ms; t += SAMPLE_MS) out.push({ offset: t / ms, ...at(t) });
  out.push({ offset: 1, ...at(ms) });
  return out;
}

/** When an animation runs: how long, when it began on the document's clock, and whether it holds its end. */
interface Run {
  ms: number;
  t0: number;
  keep: boolean;
}

/** An animation begun at `t0`, whenever it is made: one made late is already part way. */
function startAt(el: Element, keyframes: Keyframe[], run: Run): Animation {
  const anim = el.animate(keyframes, { duration: run.ms, easing: "linear", fill: run.keep ? "forwards" : "none" });
  anim.startTime = run.t0;
  return anim;
}

/** A spring's path: where it starts, where it is going, and how fast it is let go. */
interface Path {
  from: number;
  to: number;
  speed: number;
}

/** A page's place along a path over `ms`, on its last frame exactly there; `add` is how far behind it another rides. */
const springFrames = (path: Path, ms: number, add = 0) =>
  frames(ms, (t) => ({ transform: shift((t >= ms ? path.to : springAt(path.from, path.to, path.speed, t)) + add) }));

/** The path a change's page is on: from where it was let go to its far side. */
const pathOf = (move: Timeline): Path => ({ from: move.from, to: -move.dir * move.travel, speed: move.pace(0) });

/** What a change starts from: which side, where the page is, how fast, and how wide it is. */
interface Leaving {
  dir: Side;
  from: number;
  speed: number;
  width: number;
}

function timelineOf(env: DeckEnv, el: HTMLElement, leaving: Leaving): Timeline {
  const { dir, from, speed, width } = leaving;
  const still = env.reduced();
  const travel = still ? 0 : travelOf(env.travel(el), width);
  const ms = still ? CROSS_FADE_MS : TIMELINE_MS;
  const to = -dir * travel;
  const whole = travel > 0 && travel >= width * WHOLE_SHARE;
  const t0 = env.now();
  const at = (t: number) => (t >= ms ? to : springAt(from, to, speed, t));
  const progress = (t: number) => (travel === 0 ? clamp(t / ms) : clamp(at(t) / to));
  const out = (t: number) =>
    whole ? 1 - (1 - OFF_SCREEN) * progress(t) : 1 - (1 - WAITING) * Math.min(1, progress(t) / DIMMED_BY);
  return {
    dir,
    t0,
    ms,
    from,
    travel,
    whole,
    fadeMs: still ? CROSS_FADE_MS : JOIN_FADE_MS,
    at,
    pace: (t) => (travel === 0 || t >= ms ? 0 : speedAt(from, to, speed, t)),
    progress,
    out,
    follow: (other, frame) =>
      travel === 0
        ? null
        : startAt(
            other,
            frames(ms, (t) => frame(progress(t))),
            { ms, t0, keep: true },
          ),
  };
}

/**
 * Where an element rests in what holds it (its offset parent), from its place on the screen: less `across`, how far a
 * finger or a change has it from there just now, since that is the animation's to carry and not its place.
 */
function spotOf(el: HTMLElement, rect: DOMRect | Spot, across = 0): Spot {
  const frame = el.offsetParent;
  const within = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
  return {
    left: rect.left - across - within.left - (frame ? frame.clientLeft : 0),
    top: rect.top - within.top - (frame ? frame.clientTop : 0),
    width: rect.width,
    height: rect.height,
  };
}

/** A node React let go of, made a still copy: inert, hidden from a screen reader, and found by no id or test id. */
function makeStill(node: HTMLElement): void {
  for (const named of [node, ...node.querySelectorAll("[id], [data-testid]")]) {
    named.removeAttribute("id");
    named.removeAttribute("data-testid");
  }
  node.setAttribute("inert", "");
  node.setAttribute("aria-hidden", "true");
  node.classList.add("view-leaving");
}

/** Run `then` when an animation ends, however it ends. */
function after(anim: Animation | undefined, then: () => void): void {
  if (anim) anim.finished.then(then, then);
}

/** A finger on a view: where it has it, where the view was when it took it, and how it let go. */
interface Finger {
  el: HTMLElement;
  at: number;
  base: number;
  width: number;
  whole: boolean;
  speed: number;
}

/** A view's seat: the element in it, and the one React last took out of it. */
interface Seat {
  el: HTMLElement | null;
  gone: HTMLElement | null;
}

/** What one deck keeps: who is seated, what it has put on each element, what was scrolled in each, and the finger. */
interface Table {
  env: DeckEnv;
  seats: Map<string, Seat>;
  held: WeakMap<HTMLElement, Held>;
  scrolled: WeakMap<HTMLElement, Map<Element, [number, number]>>;
  finger: Finger | null;
}

/** Whether a view stands inside another seated view (a pane inside the frame's page). */
function nestedIn(table: Table, el: HTMLElement): boolean {
  for (const seat of table.seats.values()) if (seat.el && seat.el !== el && seat.el.contains(el)) return true;
  return false;
}

/** The view a gesture moves: the innermost one on the page. */
function liveOf(table: Table): HTMLElement | null {
  const on: HTMLElement[] = [];
  for (const seat of table.seats.values())
    if (seat.el && seat.el.isConnected && !hiddenInPlace(seat.el)) on.push(seat.el);
  return on.find((el) => !on.some((other) => other !== el && el.contains(other))) ?? null;
}

/** Take everything the deck put on an element off it. */
function stop(table: Table, el: HTMLElement): void {
  const was = table.held.get(el);
  table.held.delete(el);
  for (const anim of was?.anims ?? []) anim.cancel();
}

/** An element at rest as itself once its lead animation has ended, unless something newer holds it by then. */
function restAfter(table: Table, el: HTMLElement, mine: Held, lead: Animation | undefined): void {
  table.held.set(el, mine);
  after(lead, () => {
    if (table.held.get(el) === mine) stop(table, el);
  });
}

/** The finger's own styles, off. */
function clearFinger(el: HTMLElement): void {
  el.style.transform = "";
  el.style.opacity = "";
}

/** Remember where each thing inside a view is scrolled to: a node taken off the page forgets. */
function keepScrolls(table: Table, el: HTMLElement): void {
  // A view kept and shown again (hiddenInPlace) is heard already.
  if (table.scrolled.has(el)) return;
  const seen = new Map<Element, [number, number]>();
  table.scrolled.set(el, seen);
  el.addEventListener(
    "scroll",
    (e) => {
      const t = e.target;
      if (t && "scrollTop" in t) seen.set(t as Element, [(t as Element).scrollTop, (t as Element).scrollLeft]);
    },
    { capture: true, passive: true },
  );
}

/** The copy's animations: where it had got to and out, for a page that never landed; else the change's own exit. */
function leavingAnims(gone: HTMLElement, move: Timeline, was: Held | undefined, now: number): Animation[] {
  const fade: Run = { ms: move.fadeMs, t0: now, keep: true };
  const arriving = was?.role === "in" ? was.move : null;
  if (arriving) {
    const x = arriving.at(now - arriving.t0) + arriving.dir * arriving.travel;
    const hold = arriving.travel ? [startAt(gone, [{ transform: shift(x) }, { transform: shift(x) }], fade)] : [];
    return [...hold, startAt(gone, [{ opacity: 1 }, { opacity: 0 }], fade)];
  }
  const whole: Run = { ms: move.ms, t0: move.t0, keep: true };
  const slide = move.travel ? [startAt(gone, springFrames(pathOf(move), move.ms), whole)] : [];
  const out = move.whole
    ? startAt(
        gone,
        frames(move.ms, (t) => ({ opacity: move.out(t) })),
        whole,
      )
    : // Out in half the time the next takes to come up: they overlap where they stand, and should not both be half there.
      startAt(gone, [{ opacity: move.out(now - move.t0) }, { opacity: 0 }], { ...fade, ms: move.fadeMs / 2 });
  return [...slide, out];
}

/** The page React took away, put back before its successor as a still copy, and removed when it has left. */
function adopt(table: Table, gone: HTMLElement, next: HTMLElement, move: Timeline): void {
  const parent = next.parentNode;
  const was = table.held.get(gone);
  stop(table, gone);
  if (!parent) return;
  const spot = was?.spot ?? spotOf(next, next.getBoundingClientRect());
  const pin = was?.pin ?? null;
  makeStill(gone);
  parent.insertBefore(gone, next);
  if (pin) {
    // A page the window scrolled is pinned to the screen where it stood, and cut to what the screen showed of it: the
    // window goes back to the top under it as the next page arrives (or to the place that page kept), and a page of a
    // hundred rows is no layer to move. What had gone up past the screen's top is scrolled off inside it.
    const top = Math.max(pin.top, 0);
    Object.assign(gone.style, {
      position: "fixed",
      left: `${pin.left}px`,
      top: `${top}px`,
      width: `${pin.width}px`,
      height: `${Math.max(pin.screen - top, 0)}px`,
      margin: "0",
      boxSizing: "border-box",
      overflow: "hidden",
    });
    gone.scrollTop = top - pin.top;
  } else {
    // Its box is the one measured: no margin of its page's own moves it, and no padding widens it.
    Object.assign(gone.style, {
      left: `${spot.left}px`,
      top: `${spot.top}px`,
      width: `${spot.width}px`,
      height: `${spot.height}px`,
      margin: "0",
      boxSizing: "border-box",
    });
  }
  for (const [node, [top, left]] of table.scrolled.get(gone) ?? []) {
    if (!gone.contains(node)) continue;
    node.scrollTop = top;
    node.scrollLeft = left;
  }
  const anims = leavingAnims(gone, move, was, table.env.now());
  // A page that travels its whole width is gone when it has travelled; any other, when it has faded.
  after(was?.role !== "in" && move.whole ? anims[0] : anims.at(-1), () => gone.remove());
}

/** A view React keeps mounted but hidden where it stands (Activity hides it so), rather than one it took away. */
function hiddenInPlace(el: HTMLElement): boolean {
  return el.isConnected && el.style.display === "none";
}

/** Where a node stands under a root: the index of each child on the way down. */
function pathTo(root: Element, node: Element): number[] | null {
  const path: number[] = [];
  for (let n: Element | null = node; n && n !== root; n = n.parentElement) {
    const parent: Element | null = n.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, n));
  }
  return path;
}

/**
 * The copy a kept view leaves by: drawn as the view stood (shown, its boxes scrolled where they were), carrying what the
 * deck held of the view (where it stood, the change it is on), and the view itself let go of: its own animations taken
 * off, so it shows at rest when it is shown again.
 */
function keptCopy(table: Table, kept: HTMLElement): HTMLElement {
  const copy = kept.cloneNode(true) as HTMLElement;
  copy.style.removeProperty("display");
  const scrolls = new Map<Element, [number, number]>();
  for (const [node, at] of table.scrolled.get(kept) ?? []) {
    const path = kept.contains(node) ? pathTo(kept, node) : null;
    let twin: Element | null = path ? copy : null;
    for (const i of path ?? []) twin = twin?.children[i] ?? null;
    if (twin) scrolls.set(twin, at);
  }
  table.scrolled.set(copy, scrolls);
  const was = table.held.get(kept);
  stop(table, kept);
  if (was) table.held.set(copy, { ...was, anims: [] });
  return copy;
}

/** The page arriving, on the timeline of the one leaving and attached to its edge, fading in where it joins. */
function enter(table: Table, el: HTMLElement, move: Timeline): void {
  const now = table.env.now();
  const anims: Animation[] = [];
  if (move.travel) {
    const behind = move.dir * move.travel;
    anims.push(startAt(el, springFrames(pathOf(move), move.ms, behind), { ms: move.ms, t0: move.t0, keep: false }));
  }
  anims.push(startAt(el, [{ opacity: 0 }, { opacity: 1 }], { ms: move.fadeMs, t0: now, keep: false }));
  // It rests when whichever ends last has ended: its travel, or a late arrival's fade.
  const travelLast = move.travel > 0 && move.t0 + move.ms >= now + move.fadeMs;
  restAfter(table, el, { move, role: "in", spot: null, anims }, travelLast ? anims[0] : anims.at(-1));
}

/** A view has mounted: where it says a side, it arrives by the deck, and what it replaced leaves by it. */
function arrive(table: Table, el: HTMLElement, prev: HTMLElement | null): void {
  const side = el.dataset.slide;
  const was = prev ? table.held.get(prev) : undefined;
  // A view begins at its top, as one that scrolled in a box of its own did by being a new box; where the window scrolls
  // it, the window is put there: the frame's page at the window's top whenever it arrives, a view in place of another
  // inside it (a Settings pane, a lens, a tab) at its own. Its page may put back a place it kept after this: People's
  // is an effect (people/hooks/use-place.ts), a person's tabs a layout effect of the page around them (tab-scroll.ts).
  const nested = table.env.toTop ? nestedIn(table, el) : false;
  if (table.env.toTop && (prev || !nested)) table.env.toTop(el, nested);
  if (side !== "next" && side !== "prev") {
    if (prev) stop(table, prev);
    return;
  }
  const dir: Side = side === "next" ? 1 : -1;
  const under = was?.move && was.move.dir === dir ? was.move : null;
  const move = under ?? timelineOf(table.env, el, { dir, from: 0, speed: 0, width: el.getBoundingClientRect().width });
  if (prev && !prev.isConnected) adopt(table, prev, el, move);
  else if (prev && hiddenInPlace(prev)) adopt(table, keptCopy(table, prev), el, move);
  else if (prev) stop(table, prev);
  enter(table, el, move);
}

/** The callback ref of a seat: it hears the element React puts in it and takes out of it. */
function seatRef(table: Table, seat: Seat): (el: HTMLElement | null) => void {
  return (el) => {
    if (!el) {
      if (seat.el) seat.gone = seat.el;
      seat.el = null;
      return;
    }
    if (el === seat.el) return;
    // The same element handed back (development's second call of a ref) is the view it was.
    if (el === seat.gone && el.isConnected) {
      seat.el = el;
      seat.gone = null;
      return;
    }
    const prev = seat.gone ?? seat.el;
    seat.gone = null;
    seat.el = el;
    keepScrolls(table, el);
    arrive(table, el, prev);
  };
}

/** How far of its width a view is from rest, 0 to 1. */
const shareOf = (at: number, width: number) => (width > 0 ? Math.min(1, Math.abs(at) / width) : 0);

function drag(table: Table, dx: number): number {
  const el = liveOf(table);
  if (!el) return 0;
  if (!table.finger || table.finger.el !== el) {
    // A page taken mid-arrival is taken from where it is.
    const base = table.held.has(el) ? table.env.placeOf(el) : 0;
    stop(table, el);
    const width = el.getBoundingClientRect().width;
    const travel = table.env.reduced() ? 0 : travelOf(table.env.travel(el), width);
    table.finger = { el, at: base, base, width, whole: travel > 0 && travel >= width * WHOLE_SHARE, speed: 0 };
  }
  const finger = table.finger;
  finger.at = finger.base + dx;
  const gone = shareOf(finger.at, finger.width);
  el.style.transform = shift(finger.at);
  if (finger.whole) el.style.opacity = String(1 - (1 - OFF_SCREEN) * gone);
  return gone;
}

/** Where a view is on its way home from, and how much of itself it shows there. */
interface Away {
  from: number;
  level: number;
  width: number;
}

/** Back to rest: a finger let go short, or a page nothing replaced. Answers what follows it home, or null where nothing moves. */
function comeHome(table: Table, el: HTMLElement, away: Away): Follow | null {
  const { from, level, width } = away;
  if (table.env.reduced() || from === 0) return null;
  const now = table.env.now();
  const run: Run = { ms: TIMELINE_MS, t0: now, keep: false };
  const anims = [startAt(el, springFrames({ from, to: 0, speed: 0 }, TIMELINE_MS), run)];
  if (level < 1)
    anims.push(startAt(el, [{ opacity: level }, { opacity: 1 }], { ms: JOIN_FADE_MS, t0: now, keep: false }));
  restAfter(table, el, { move: null, role: "back", spot: null, anims }, anims[0]);
  const share = (t: number) => (t >= TIMELINE_MS ? 0 : shareOf(springAt(from, 0, 0, t), width));
  return {
    follow: (other, frame) =>
      startAt(
        other,
        frames(TIMELINE_MS, (t) => frame(share(t))),
        { ...run, keep: true },
      ),
  };
}

function settleBack(table: Table): Follow | null {
  const was = table.finger;
  table.finger = null;
  if (!was) return null;
  clearFinger(was.el);
  const level = was.whole ? 1 - (1 - OFF_SCREEN) * shareOf(was.at, was.width) : 1;
  return comeHome(table, was.el, { from: was.at, level, width: was.width });
}

/** The page left, and nothing took its place (a guard kept it, a move that never landed): it comes back. */
function comeBack(table: Table, el: HTMLElement, move: Timeline): void {
  const was = table.held.get(el);
  if (!was || was.move !== move || was.role !== "out" || liveOf(table) !== el) return;
  const from = table.env.placeOf(el);
  const level = move.out(table.env.now() - move.t0);
  stop(table, el);
  comeHome(table, el, { from, level, width: el.getBoundingClientRect().width });
}

/** A highlight's own timeline: from where it is to where it goes on the spring a change of view rides, from rest. */
function alone(table: Table): Follow | null {
  if (table.env.reduced()) return null;
  const run: Run = { ms: TIMELINE_MS, t0: table.env.now(), keep: true };
  const share = (t: number) => (t >= TIMELINE_MS ? 1 : 1 - springAt(1, 0, 0, t));
  return {
    follow: (el, frame) =>
      startAt(
        el,
        frames(TIMELINE_MS, (t) => frame(share(t))),
        run,
      ),
  };
}

function leave(table: Table, dir: Side): Move | null {
  const el = liveOf(table);
  if (!el) return null;
  const was = table.held.get(el);
  const taken = table.finger && table.finger.el === el ? table.finger : null;
  table.finger = null;
  const now = table.env.now();
  // Where it is: under the finger, part way through a change, or at rest.
  const from = taken ? taken.at : was ? table.env.placeOf(el) : 0;
  const speed = taken ? taken.speed : was?.move ? was.move.pace(now - was.move.t0) : 0;
  const rect = el.getBoundingClientRect();
  stop(table, el);
  if (taken) clearFinger(el);
  const move = timelineOf(table.env, el, { dir, from, speed, width: rect.width });
  const run: Run = { ms: move.ms, t0: move.t0, keep: true };
  const anims: Animation[] = [];
  if (move.travel) anims.push(startAt(el, springFrames(pathOf(move), move.ms), run));
  anims.push(
    startAt(
      el,
      frames(move.ms, (t) => ({ opacity: move.out(t) })),
      run,
    ),
  );
  const scrolled = table.env.windowOf ? table.env.windowOf(el) : null;
  const pin = scrolled ? { left: rect.left - from, top: rect.top, width: rect.width, screen: scrolled.screen } : null;
  table.held.set(el, { move, role: "out", spot: spotOf(el, rect, from), pin, anims });
  table.env.later(move.ms + SUCCESSOR_WAIT_MS, () => comeBack(table, el, move));
  return move;
}

export function createDeck(env: DeckEnv): Deck {
  const table: Table = { env, seats: new Map(), held: new WeakMap(), scrolled: new WeakMap(), finger: null };
  const refs = new Map<string, (el: HTMLElement | null) => void>();
  return {
    view: (owner) => {
      const had = refs.get(owner);
      if (had) return had;
      const seat: Seat = { el: null, gone: null };
      table.seats.set(owner, seat);
      const ref = seatRef(table, seat);
      refs.set(owner, ref);
      return ref;
    },
    walks: () => {
      const el = liveOf(table);
      const width = el ? el.getBoundingClientRect().width : 0;
      return !!el && width > 0 && travelOf(env.travel(el), width) >= width * WHOLE_SHARE;
    },
    drag: (dx) => drag(table, dx),
    letGo: (speed) => {
      if (table.finger) table.finger.speed = speed;
    },
    settle: () => settleBack(table),
    leave: (dir) => leave(table, dir),
    stay: () => {
      const el = liveOf(table);
      const was = el ? table.held.get(el) : undefined;
      if (el && was && was.role === "out" && was.move) comeBack(table, el, was.move);
    },
    alone: () => alone(table),
  };
}

/** The page's own deck: one for the window, since one view is on screen at a time. */
export const viewDeck: Deck = createDeck({
  now: () => Number(document.timeline.currentTime ?? performance.now()),
  reduced: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  travel: (el) => getComputedStyle(el).getPropertyValue("--view-travel"),
  placeOf: (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41,
  later: (ms, fn) => {
    window.setTimeout(fn, ms);
  },
  windowOf: (el) =>
    isDocumentScroller(scrollerOf(el, { self: true })) ? { screen: shownHeight(documentScroller()) } : null,
  toTop: (el, nested) => {
    if (!isDocumentScroller(scrollerOf(el, { self: true }))) return;
    if (!nested) {
      // The browser puts back a scroll of its own on Back, before the page it goes to is drawn: the deck keeps it.
      if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
      if (window.scrollY > 0) window.scrollTo(0, 0);
      return;
    }
    // Just under what stands over the page (the frame's top on a phone: the document's scroll-padding, mobile.css).
    const under = Number.parseFloat(getComputedStyle(documentScroller()).scrollPaddingTop) || 0;
    const top = el.getBoundingClientRect().top;
    if (top < under) window.scrollBy(0, top - under);
  },
});
