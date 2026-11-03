/**
 * A sheet with two rests under a thumb (Sheet's `rest`, kit.css "Two rests"; the lead workbench's pile, canvas B's
 * Motion board): a pull moves it between half and full, following the finger, and lets go at the other rest past a
 * third of the way there (80px) or on a flick; anything less springs back. From half, a pull down past 160px, or a
 * flick down, asks to close, and from full a pull down rests at half first: two pulls to close. What it holds scrolls
 * first: a touch that began in its body while the body is scrolled moves the body, never the sheet, and at full a pull up
 * is the body's. The handle and the head always move it.
 *
 * Transform alone: the finger's place is an inline transform, with the cut that keeps the sheet's foot at its rest's line
 * (kit.css --sheet-held), let go of when the finger lifts, so the sheet's own rule places it at the rest it lands on, on
 * the kit's ease (and at once under reduced motion). A sheet let go to close keeps where the finger left it, and its
 * leaving plays from there.
 */
import type { TouchEvent as ReactTouchEvent } from "react";

/** Where a two-rest sheet stands. */
export type SheetRest = "half" | "full";

/** How far a touch goes before it is a pull and not a tap. */
const GRAB_PX = 6;
/** How far a pull goes before it lands at the other rest. */
const TURN_PX = 80;
/** How far down a pull from half goes before it closes. */
const CLOSE_PX = 160;
/** A flick: fast enough (px a millisecond) over at least this far. */
const FLICK_SPEED = 0.5;
const FLICK_PX = 24;

/** One touch on a sheet: where it began, how far it has gone, and whether it moves the sheet or is the body's. */
interface Grab {
  el: HTMLElement;
  y: number;
  at: number;
  dy: number;
  /** The sheet's place at its rest as the touch began, in px down. */
  base: number;
  moving: boolean;
  /** The body's scroll, not the sheet's: nothing here moves. */
  body: boolean;
  move: (e: TouchEvent) => void;
}

const grabs = new WeakMap<HTMLElement, Grab>();

/** The half rest's length down, as the sheet's rule says it (kit.css `--sheet-rest`). */
function restLength(el: HTMLElement): number {
  const v = parseFloat(getComputedStyle(el).getPropertyValue("--sheet-rest"));
  return Number.isFinite(v) ? v : 0;
}

/** Whether a touch began where what the sheet holds scrolls first: inside its body, scrolled down from its top. */
function inScrolledBody(target: EventTarget | null, el: HTMLElement): boolean {
  const body = target instanceof Element ? target.closest(".rec-sheet-body") : null;
  return !!body && el.contains(body) && body.scrollTop > 0;
}

/** Where the sheet lands as the finger lifts: a rest, closed, or where it was. */
function landing(rest: SheetRest, g: Grab): SheetRest | "close" | null {
  const flick = Math.abs(g.dy) > FLICK_PX && Math.abs(g.dy) / Math.max(1, Date.now() - g.at) > FLICK_SPEED;
  if (rest === "half" && (g.dy > CLOSE_PX || (flick && g.dy > 0))) return "close";
  if (rest === "half" && (g.dy < -TURN_PX || (flick && g.dy < 0))) return "full";
  if (rest === "full" && (g.dy > TURN_PX || (flick && g.dy > 0))) return "half";
  return null;
}

/** The touch handlers for a two-rest sheet: where it is, what a landing does, and whether a thumb moves it at all. */
export function restSwipe(o: {
  rest: SheetRest;
  onRest: (rest: SheetRest) => void;
  onClose: () => void;
  when: () => boolean;
}) {
  const move = (g: Grab, e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || g.body) return;
    const dy = t.clientY - g.y;
    if (!g.moving) {
      if (Math.abs(dy) < GRAB_PX) return;
      // At full a pull up is the body's own scroll.
      if (o.rest === "full" && dy < 0) {
        g.body = true;
        return;
      }
      g.moving = true;
      g.el.style.transition = "none";
    }
    if (e.cancelable) e.preventDefault();
    g.dy = dy;
    const down = `${Math.max(0, g.base + dy)}px`;
    g.el.style.transform = `translate3d(0, ${down}, 0)`;
    // And cut there at its rest's line, as its half rest is (kit.css --sheet-held): nothing of it stands over the foot.
    g.el.style.setProperty("--sheet-held", down);
  };
  const onTouchStart = (e: ReactTouchEvent<HTMLElement>) => {
    const t = e.touches[0];
    const el = e.currentTarget;
    if (!t || !o.when()) return;
    const g: Grab = {
      el,
      y: t.clientY,
      at: Date.now(),
      dy: 0,
      base: o.rest === "half" ? restLength(el) : 0,
      moving: false,
      body: inScrolledBody(e.target, el),
      move: (ev) => move(g, ev),
    };
    grabs.set(el, g);
    // Read from the element itself, not passively, so a pull's default (the page's own scroll) is refused.
    el.addEventListener("touchmove", g.move, { passive: false });
  };
  const onTouchEnd = (e: ReactTouchEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const g = grabs.get(el);
    if (!g) return;
    grabs.delete(el);
    el.removeEventListener("touchmove", g.move);
    if (!g.moving) return;
    const to = landing(o.rest, g);
    // Closing keeps where the finger left it: its leaving plays from there.
    if (to === "close") return o.onClose();
    el.style.transition = "";
    el.style.transform = "";
    el.style.removeProperty("--sheet-held");
    if (to) o.onRest(to);
  };
  return { onTouchStart, onTouchEnd, onTouchCancel: onTouchEnd };
}

/** How far up a pull from folded goes before a docked foot opens. */
const DOCK_OPEN_PX = 16;
/** How far down a pull from open goes before a docked foot folds. */
const DOCK_FOLD_PX = 64;

/** Whether a touch began where words are typed, selected or scrolled: the field's, never the foot's. */
function inField(target: EventTarget | null): boolean {
  const at = target as Element | null;
  return !!at && typeof at.closest === "function" && !!at.closest("textarea, input, select, [contenteditable]");
}

/** One touch on a docked foot: where it began, how far down it has taken the foot, and whether it is the foot's. */
interface DockGrab {
  el: HTMLElement;
  x: number;
  y: number;
  at: number;
  dy: number;
  moving: boolean;
  /** Not the foot's (across the screen, the other way, or already answered): nothing more moves. */
  done: boolean;
  move: (e: TouchEvent) => void;
}

const dockGrabs = new WeakMap<HTMLElement, DockGrab>();

/**
 * A foot docked at the screen's foot with two rests, folded and open, under a thumb as a sheet's two rests are (an open
 * thread's reply box on a phone; Ruben, 3 Nov 2026: "it should also work like the drawer sheets"). A pull up from folded
 * opens it once it has gone DOCK_OPEN_PX, and the foot's height glides there (motion/use-height-glide.ts); a pull down
 * from open follows the finger and folds it past DOCK_FOLD_PX or on a flick, and anything less settles back. A pull the
 * other way, one across the screen (a thread's swipe back), and a touch that began in a field (the reply's words, which
 * scroll and are selected there) move nothing. The finger's place is an inline transform, let go to the foot's own
 * rule, which eases it home.
 */
export function dockSwipe(o: { open: boolean; onOpen: () => void; onFold: () => void; when: () => boolean }) {
  const move = (g: DockGrab, e: TouchEvent) => {
    const t = e.touches[0];
    if (!t || g.done) return;
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (!g.moving) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < GRAB_PX) return;
      if (Math.abs(dx) > Math.abs(dy) || (o.open ? dy < 0 : dy > 0)) {
        g.done = true;
        return;
      }
      g.moving = true;
      if (o.open) g.el.style.transition = "none";
    }
    if (e.cancelable) e.preventDefault();
    if (!o.open) {
      if (-dy < DOCK_OPEN_PX) return;
      g.done = true;
      o.onOpen();
      return;
    }
    g.dy = Math.max(0, dy);
    g.el.style.transform = `translate3d(0, ${g.dy}px, 0)`;
  };
  const onTouchStart = (e: ReactTouchEvent<HTMLElement>) => {
    const t = e.touches[0];
    const el = e.currentTarget;
    if (!t || e.touches.length > 1 || !o.when() || inField(e.target)) return;
    const g: DockGrab = {
      el,
      x: t.clientX,
      y: t.clientY,
      at: Date.now(),
      dy: 0,
      moving: false,
      done: false,
      move: (ev) => move(g, ev),
    };
    dockGrabs.set(el, g);
    // Read from the element itself, not passively, so a pull's default (the page's own scroll) is refused.
    el.addEventListener("touchmove", g.move, { passive: false });
  };
  // Let go, it folds or settles back; a touch the system took (cancelled) always settles back.
  const letGo = (el: HTMLElement, cancelled: boolean) => {
    const g = dockGrabs.get(el);
    if (!g) return;
    dockGrabs.delete(el);
    el.removeEventListener("touchmove", g.move);
    if (!g.moving || !o.open) return;
    const flick = g.dy > FLICK_PX && g.dy / Math.max(1, Date.now() - g.at) > FLICK_SPEED;
    el.style.transition = "";
    el.style.transform = "";
    if (!cancelled && (g.dy > DOCK_FOLD_PX || flick)) o.onFold();
  };
  return {
    onTouchStart,
    onTouchEnd: (e: ReactTouchEvent<HTMLElement>) => letGo(e.currentTarget, false),
    onTouchCancel: (e: ReactTouchEvent<HTMLElement>) => letGo(e.currentTarget, true),
  };
}
