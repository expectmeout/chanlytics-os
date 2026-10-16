/**
 * A sheet with two rests under a thumb (Sheet's `rest`, kit.css "Two rests"; the lead workbench's pile, canvas B's
 * Motion board): a pull moves it between half and full, following the finger, and lets go at the other rest past a
 * third of the way there (80px) or on a flick; anything less springs back. From half, a pull down past 160px, or a
 * flick down, asks to close, and from full a pull down rests at half first: two pulls to close. What it holds scrolls
 * first: a touch that began in its body while the body is scrolled moves the body, never the sheet, and at full a pull up
 * is the body's. The handle and the head always move it.
 *
 * Transform alone: the finger's place is an inline transform, let go of when the finger lifts, so the sheet's own rule
 * places it at the rest it lands on, on the kit's ease (and at once under reduced motion). A sheet let go to close keeps
 * where the finger left it, and its leaving plays from there.
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
    g.el.style.transform = `translate3d(0, ${Math.max(0, g.base + dy)}px, 0)`;
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
    if (to) o.onRest(to);
  };
  return { onTouchStart, onTouchEnd, onTouchCancel: onTouchEnd };
}
