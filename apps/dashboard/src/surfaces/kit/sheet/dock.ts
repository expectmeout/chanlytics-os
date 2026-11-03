/**
 * A foot docked at the screen's foot with two rests, folded and open, under a thumb as a sheet's two rests are
 * (rests.ts), on the same reading of a pull (pull.ts): an open thread's reply box on a phone, which takes this module and
 * the handle's (handle.tsx) and none of the sheet's own.
 */
import type { TouchEvent as ReactTouchEvent } from "react";
import { FLICK_PX, FLICK_SPEED, GRAB_PX } from "./pull";

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
