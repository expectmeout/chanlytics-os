/**
 * A thumb's gestures (moved from legacy/components/data-bits.jsx, the one-system plan's step 2): one reader of a touch,
 * for what a thumb walks or lets go of. A lead's peek walks its pile across; a sheet on a phone, the peek and an open
 * thread are let go of. `touchSwipe({ onLeft, onRight, onDown, onBack, onAway, min, when, onGrab })` gives the handlers for
 * the element the gesture is on. Nothing is kept between draws: a touch's state is held against the element the browser
 * hands back. A move is read from the element itself first (`swipeHold`, below), where the browser's own scroll can still
 * be refused: React hears touchmove passively, and an iPhone kept scrolling the page it had also handed to the finger, so
 * a thumb could carry Reports in circles (Ruben's recording, 9 Oct 2026). While the touch carries something across (a
 * page, a thread back, the drawer away) the list under it never scrolls.
 *
 * A let-go FOLLOWS the finger. `onDown` is a pull down from the top: once the touch has gone 8px, mostly down, from a
 * scroller at its top (the first ancestor under the finger that scrolls, so a scroll back up through a list is never a
 * pull), and where `when` says (a phone's width), the element moves with the finger and the wash behind it (its previous
 * sibling, when that is a backdrop) fades as it goes. `onBack` is the same, across to the right: an open thread on a phone
 * goes back to its list, and `onGrab(el, on, way)` lets the page show what is under it while it moves. `onAway` is the same
 * across to the left, with its wash fading as a sheet's does: the phone's drawer slides back where it came from. Nothing
 * opens one by a swipe (from the screen's edge that is the phone's own back). A drawer is slid shut by its own rules rather
 * than taken away, so after the close its inline styles go and those rules take it on. Let go past a third of the element
 * (160px at most) or with a flick, it leaves the way it was pulled and then the close is called; short of that, or when the
 * page kept it open (it asks first about what was typed), it settles back. Under reduced motion it still follows the
 * finger, which is the person's own motion, and the rest happens at once.
 *
 * `pages(el, from)` is the third that follows: a page under a strip, walked across (the kit's viewPager, kit/view-tabs).
 * Asked once, as a touch is taken across (never from 24px of either edge, the phone's own back), with where the touch
 * began: `{ prev, next, drag(dx, step, open), settle(), go(step, speed) }`, or null. This only reads the touch: the page
 * moves itself, by the deck every change of view moves by (view-deck.ts). `drag` hears how far the finger is, which side,
 * and whether a page is there (toward none: a quarter of the drag, 48px at most). Let go past a third (160px at most) or
 * with a flick, `go(step, speed)` at once, at the finger's speed across in pixels a millisecond, so the page carries on at
 * it; otherwise `settle()`. Kept with the touch, so a redraw loses nothing. `back` goes first. A page that `stays` (the
 * Calendar's days) says only `{ prev, next, stays, go(step) }` and is turned in place (swipeStays): it follows, leaves, is
 * asked for the next, waits until `go` lands it, and comes back in from its side. With both (a person's page), a page to
 * the left is walked first, and `onBack` is what lies left of the first one.
 *
 * A swipe across, with nothing following, is `onLeft`/`onRight`: `min` of travel (80px) along the axis it went further
 * on, so a scroll is never a move and a move never a scroll. A touch the browser reports only at its ends is read the
 * same way, down included.
 *
 * A let-go is read at the finger's speed as it lifts, never its average since it landed: a quick flick at the end of a
 * slow drag goes, and a page past the line but flicked back stays (as a phone's own back is read). What goes carries on
 * from that speed (`carryOn`): it slowed as the finger lifted and sped up again, on a fixed curve that started at rest
 * (Ruben, 20 Oct 2026, "Back to your place"). Whether the page let it go is judged once it has had the time to (a Back
 * that moves the address, `backNavigates`, lands later than a close in place): one still on the page by then was kept.
 * `under` is what lies under a page carried back: a list held under the row's page it opened, with the frame's chrome over
 * it (held-list.ts), which comes in from a little to its left and brightens as the page goes, and goes back as the page
 * settles; `along` is what goes with the page (what it drew in the frame's top for itself), moved as the page is.
 * A page opened over the list it was opened from comes in as that swipe back played forward (`pushIn`, iOS's push).
 */
import type { TouchEvent } from "react";
import type { ViewPage } from "../view-tabs/pager";

/**
 * A page that stays as a swipe walks it (the Calendar's days: the same element shows the next): what is each side and
 * how to turn. It is turned in place (`swipeStays`).
 */
export interface StayingPage {
  prev: boolean;
  next: boolean;
  stays: true;
  go: (step: number) => void;
}

/** A page a swipe walks: one under a strip of views, which moves itself by the deck (the kit's `viewPager`), or one that stays. */
type SwipePage = ViewPage | StayingPage;

/** Which way a touch was taken: let go of down, back or away; a page walked; or nothing that follows. */
type Way = "down" | "back" | "away" | "page" | "none";

/** What a swipe answers to: each is the page's own to do, called once the thumb has let go. */
export interface SwipeOptions {
  onLeft?: (() => void) | null;
  onRight?: (() => void) | null;
  onDown?: (() => void) | null;
  onBack?: (() => void) | null;
  onAway?: (() => void) | null;
  pages?: ((el: Element, from: EventTarget | null) => SwipePage | null) | null;
  min?: number;
  when?: (() => boolean) | null;
  /** Grabbed (`on`, with the way it moves) or let go: what is under it can show while it moves. */
  onGrab?: ((el: Element, on: boolean, way?: "down" | "back" | "away") => void) | null;
  /** What lies under a page carried back, asked as it is grabbed: it comes in under the page as the page goes. */
  under?: (() => readonly HTMLElement[]) | null;
  /** What goes with a page carried back, asked once it is grabbed (and `under` asked): it moves as the page does. */
  along?: (() => readonly HTMLElement[]) | null;
  /**
   * Whether `onBack` moves the address (a page carried back to its list), which takes the page away later than a close in
   * place: it is waited for before the page is judged kept. A card swiped back and kept (the bell's read, a lead's keep)
   * says nothing, and settles back as soon as it is seen to stay.
   */
  backNavigates?: boolean;
}

/** The handlers a swipe spreads onto the element it is on. */
export interface SwipeHandlers {
  onTouchStart?: (e: TouchEvent<HTMLElement>) => void;
  onTouchMove?: (e: TouchEvent<HTMLElement>) => void;
  onTouchEnd?: (e: TouchEvent<HTMLElement>) => void;
  onTouchCancel?: (e: TouchEvent<HTMLElement>) => void;
}

/** A touch as React hands it and as the element's own listener hears it. */
interface SwipeEvent {
  touches?: ArrayLike<{ clientX: number; clientY: number }>;
  changedTouches?: ArrayLike<{ clientX: number; clientY: number }>;
  currentTarget: EventTarget | null;
  target: EventTarget | null;
  cancelable?: boolean;
  preventDefault?: () => void;
}

type Handler = (e: SwipeEvent) => void;

interface Handlers {
  onTouchStart: Handler;
  onTouchMove: Handler;
  onTouchEnd: Handler;
  onTouchCancel: Handler;
}

/** What a page walked is asked, whether a strip's (it moves itself) or one that stays (turned here). */
interface Walked {
  prev: boolean;
  next: boolean;
  drag(dx: number, step: 1 | -1, open: boolean): void;
  settle(): void;
  go(step: 1 | -1, speed: number): void;
}

/** A touch, kept against the element it began on. */
interface Held {
  el: HTMLElement;
  h: Handlers;
  held: boolean;
  x: number;
  y: number;
  at: number;
  top: boolean;
  way: Way | null;
  onGrab: SwipeOptions["onGrab"];
  /** What the swipe answers to, and the travel a swipe across takes. */
  o: SwipeOptions;
  min: number;
  wash: HTMLElement | null;
  from: EventTarget | null;
  pages: Walked | null;
  step: number;
  /** Where the finger was at its last move, when, and how fast it was going then (pixels a millisecond). */
  mx: number;
  my: number;
  mt: number;
  vx: number;
  vy: number;
  /** What lies under a page carried back (`under`), and what goes with it (`along`), while it is carried. */
  below: readonly HTMLElement[];
  along: readonly HTMLElement[];
}

const elementOf = (e: SwipeEvent | null | undefined): HTMLElement | null =>
  e ? (e.currentTarget as HTMLElement | null) : null;
const firstTouchOf = (list: SwipeEvent["touches"]) => (list ? list[0] : undefined);

// The element itself counts: a short sheet is its own scroller.
const swipeScrollerAtTop = (from: EventTarget | null, upTo: HTMLElement): boolean => {
  for (let n = from as HTMLElement | null; n; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1) {
      const over = window.getComputedStyle ? window.getComputedStyle(n).overflowY : "auto";
      if (over === "auto" || over === "scroll") return n.scrollTop <= 0;
    }
    if (n === upTo) break;
  }
  return true;
};
// A touch begun in what takes a drag of its own (a field's caret, a row that scrolls across) is that thing's, never a
// let-go; so is one begun outside the element's nodes: a portal's, which React hands up the tree it was drawn from.
const swipeOwnDrag = (from: EventTarget | null, upTo: HTMLElement): boolean => {
  for (let n = from as HTMLElement | null; n; n = n.parentElement) {
    if (n.matches && n.matches("input, textarea, select, [contenteditable='true']")) return true;
    if (n.scrollWidth > n.clientWidth + 1) {
      const over = window.getComputedStyle ? window.getComputedStyle(n).overflowX : "visible";
      if (over === "auto" || over === "scroll") return true;
    }
    if (n === upTo) return false;
  }
  return !!(from && (from as Node).nodeType);
};

/** Whether the person asked for less motion. */
export const motionReduced = (): boolean =>
  !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

const touches = new WeakMap<object, Held>();

/** The wash behind an overlay: its previous sibling, when that is a backdrop. */
export const washBehind = (el: Element | null | undefined): HTMLElement | null => {
  const prev = el && el.previousElementSibling;
  return prev && /backdrop/.test(String(prev.className || "")) ? (prev as HTMLElement) : null;
};

const GRAB_AT = 8;
/** The longest a let-go takes to leave, and the shortest: a fast finger's is shorter, never shorter than this. */
const LEAVE_MS = 180;
const LEAVE_MIN_MS = 120;
const SETTLE_MS = 240;
/** Back where it was: the settle's own length and curve, gathering no pace. */
const SETTLE = { ms: SETTLE_MS, easing: "var(--ease-out)" };
/**
 * A page opened over what it was opened from comes in on iOS's push: quick off the edge and long to land, never past its
 * place (UIKit's navigation curve, near enough; its spring takes about as long).
 */
const PUSH = { ms: 420, easing: "cubic-bezier(0.32, 0.72, 0, 1)" };
// Long enough for React to have taken it away after the close: judged sooner, a sheet on its way out read as kept,
// and settled back into view for a frame before it went.
const KEPT_AFTER_MS = 60;
// A Back that moves the address (`backNavigates`) is drawn a commit or more later than a close in place: a page carried
// back and still on the page is looked at again this often, for this long, before it is judged kept. A thread let go
// settled back into view for a frame and then went.
const KEPT_STEP_MS = 40;
const KEPT_WAIT_MS = 360;
/** Where what lies under a page carried back starts, as a share of the page's width to its left, and how dim. */
const UNDER_SHARE = 0.3;
const UNDER_DIM = 0.6;
// A finger that has not moved for this long before it lifts lets go at rest.
const STILL_MS = 80;
const EDGE = 24;
const RESIST = 0.25;
const RESIST_MAX = 48;
const ARRIVE_PX = 40;
const DEFAULT_SIZE = 600;
const LEAVE_LINE_MAX = 160;
const FLICK_PX = 24;
const FLICK_PACE = 0.5;
const screenWide = (el: HTMLElement) =>
  (typeof window.innerWidth === "number" && window.innerWidth) || (el && el.offsetWidth) || 0;
const pageStep = (dx: number): 1 | -1 => (dx < 0 ? 1 : -1);
const pageOpen = (p: { prev: boolean; next: boolean } | null, step: number) => !!(p && (step > 0 ? p.next : p.prev));
const swipePageOf = (pages: SwipeOptions["pages"], el: HTMLElement, g: Held): SwipePage | null =>
  pages && g.x > EDGE && g.x < screenWide(el) - EDGE ? pages(el, g.from) : null;
// How fast the finger is going, in pixels a millisecond, from its last two places: what a let-go is read and let go at.
const swipePace = (g: Held, x: number, y: number) => {
  const now = Date.now();
  if (now > g.mt) {
    g.vx = (x - g.mx) / (now - g.mt);
    g.vy = (y - g.my) / (now - g.mt);
  }
  g.mx = x;
  g.my = y;
  g.mt = now;
};
// How fast the finger was going the way it pulls as it lifted (down, back or away): none where it stood still first.
const liftSpeed = (g: Held): number => {
  if (Date.now() - g.mt > STILL_MS) return 0;
  return g.way === "down" ? g.vy : g.way === "away" ? -g.vx : g.vx;
};
/**
 * The curve a let-go leaves on, from `d` of `size` at `speed`: as fast as the finger as it begins, then over what is left
 * in as long as that takes to slow to rest (LEAVE_MIN_MS to LEAVE_MS). A curve's first slope is its speed against the
 * straight line's, so it is the finger's speed times the time over the distance (a third of the way along, slowed at its
 * end): a finger at rest starts it at rest, and a flick never makes it pass its place and come back.
 */
const carryOn = (d: number, size: number, speed: number): { ms: number; easing: string } => {
  const left = Math.max(1, size - d);
  const pace = Math.max(0, speed);
  const ms = Math.round(Math.min(LEAVE_MS, Math.max(LEAVE_MIN_MS, pace > 0 ? (2 * left) / pace : LEAVE_MS)));
  const slope = Math.min(3, (pace * ms) / left);
  return { ms, easing: `cubic-bezier(0.33, ${(slope / 3).toFixed(3)}, 0.67, 1)` };
};
// Where what lies under a page carried back stands, with the page `share` of its way gone.
const placeUnder = (below: readonly HTMLElement[], width: number, share: number) => {
  const s = Math.min(1, Math.max(0, share));
  for (const el of below) {
    el.style.translate = `${Math.round(-UNDER_SHARE * width * (1 - s))}px 0`;
    el.style.opacity = String(UNDER_DIM + (1 - UNDER_DIM) * s);
  }
};
// Put back as it stands, never animated: given back with the carry's own transition gone, the tab bar's (mobile.css, on
// translate and opacity) played from where the carry left it to the same place, and on an iPhone its glass drew again.
const clearUnder = (below: readonly HTMLElement[]) => {
  const first = below[0];
  if (!first) return;
  for (const el of below) {
    el.style.transition = "none";
    el.style.translate = "";
    el.style.opacity = "";
  }
  // Drawn so before the page's own transitions are theirs again.
  void first.offsetWidth;
  for (const el of below) el.style.transition = "";
};
// What goes with a page carried back, `dx` across, on `move` (a transition, or none while the finger holds it).
const moveAlong = (along: readonly HTMLElement[], dx: number, move: string) => {
  for (const el of along) {
    el.style.transition = move === "none" ? "none" : `transform ${move}`;
    el.style.transform = `translate3d(${Math.round(dx)}px, 0, 0)`;
  }
};
const clearAlong = (along: readonly HTMLElement[]) => {
  for (const el of along) {
    el.style.transition = "";
    el.style.transform = "";
  }
};
/** What a settle moves: the element, the wash behind it, what lies under it and goes with it, and whom it tells. */
type Settling = Pick<Held, "el" | "wash" | "below" | "along" | "onGrab">;
// Back where it was, on `curve` (the settle's own); its inline styles go when it is there, so the page's own rules
// (an entrance, a sheet's frame) own it again. What lay under it goes back with it, and out of sight once it is covered.
const swipeSettle = (g: Settling, curve: { ms: number; easing: string } = SETTLE) => {
  const { el, wash, below, along } = g;
  const covered = () => {
    clearUnder(below);
    clearAlong(along);
    g.below = [];
    g.along = [];
    if (g.onGrab) g.onGrab(el, false);
  };
  if (!el.style) {
    covered();
    return;
  }
  const now = motionReduced();
  const move = `${curve.ms}ms ${curve.easing}`;
  el.style.transition = now ? "none" : `transform ${move}`;
  el.style.transform = "translate3d(0, 0, 0)";
  if (wash && wash.style) {
    wash.style.transition = now ? "none" : `opacity ${move}`;
    wash.style.opacity = "";
  }
  for (const b of below) b.style.transition = now ? "none" : `translate ${move}, opacity ${move}`;
  placeUnder(below, el.offsetWidth || DEFAULT_SIZE, 0);
  moveAlong(along, 0, now ? "none" : move);
  setTimeout(
    () => {
      el.style.transition = "";
      el.style.transform = "";
      if (wash && wash.style) wash.style.transition = "";
      covered();
    },
    now ? 0 : curve.ms + 20,
  );
};

/**
 * A page opened over the list it was opened from comes in as a thumb carrying it back would leave, played forward (iOS's
 * push; Ruben, 20 Oct 2026: "make it motion transition to the page cleanly like iphone imessage"): from the screen's
 * right edge, what lies under it going a little to its left and dimming as it is covered, what goes with it arriving with
 * it. Its options are its own swipe back's (`onGrab`, `under`, `along`), so what it comes in over is what a thumb would
 * uncover, and every moment of the push is one the swipe back passes through. It takes no touch until it has landed.
 * Nothing moves under reduced motion.
 */
export const pushIn = (el: HTMLElement, o: Pick<SwipeOptions, "onGrab" | "under" | "along">): void => {
  if (!el.style || motionReduced()) return;
  // Told first, as a grab is: what lies under it and goes with it is drawn as it is told (held-list.ts showHeld).
  if (o.onGrab) o.onGrab(el, true, "back");
  const g: Settling = {
    el,
    wash: null,
    below: o.under ? o.under() : [],
    along: o.along ? o.along() : [],
    onGrab: (page, on, way) => {
      if (!on) el.style.pointerEvents = "";
      if (o.onGrab) o.onGrab(page, on, way);
    },
  };
  const width = el.offsetWidth || DEFAULT_SIZE;
  el.style.pointerEvents = "none";
  el.style.transition = "none";
  el.style.transform = `translate3d(${width}px, 0, 0)`;
  for (const b of g.below) b.style.transition = "none";
  placeUnder(g.below, width, 1);
  moveAlong(g.along, width, "none");
  // Drawn at the far side first, so the move has somewhere to start from.
  void el.offsetWidth;
  swipeSettle(g, PUSH);
};
// A page that stays turns in place: in from the side it is going to, on the settle's curve.
const swipeArrive = (g: Held) => {
  const { el } = g;
  if (g.onGrab) g.onGrab(el, false);
  if (!el.style) return;
  const now = motionReduced();
  el.style.transition = "none";
  el.style.transform = now ? "" : `translate3d(${g.step * ARRIVE_PX}px, 0, 0)`;
  if (now) return;
  void el.offsetWidth;
  el.style.transition = `transform ${SETTLE_MS}ms var(--ease-out)`;
  el.style.transform = "translate3d(0, 0, 0)";
  setTimeout(() => {
    el.style.transition = "";
    el.style.transform = "";
  }, SETTLE_MS + 20);
};
// Let go of for good: its inline styles go, and its own rules have it again.
const swipeClear = (g: Held) => {
  clearUnder(g.below);
  clearAlong(g.along);
  g.below = [];
  g.along = [];
  if (g.onGrab) g.onGrab(g.el, false);
  if (!g.el.style) return;
  g.el.style.transition = "";
  g.el.style.transform = "";
  if (g.wash && g.wash.style) {
    g.wash.style.transition = "";
    g.wash.style.opacity = "";
  }
};
// Where a let-go leaves for, by the way it was pulled.
const leaveTo = (g: Held, w: number) =>
  g.way === "down"
    ? "translate3d(0, 100%, 0)"
    : g.way === "away"
      ? "translate3d(-100%, 0, 0)"
      : g.way === "page"
        ? `translate3d(${-g.step * w}px, 0, 0)`
        : "translate3d(100%, 0, 0)";
// Whether the page let it go, judged once it has had the time to: gone, it is let go of; still on the page when the
// longest its close takes has passed (a Back's, where the Back moves the address), it was kept (a page that asks first),
// and it settles back. One still on the page while it plays its leaving (the kit's Sheet: Base UI lets it go after) stays
// where it went.
const swipeJudge = (g: Held, waited = 0) => {
  setTimeout(
    () => {
      const { el } = g;
      if (el.dataset && el.dataset.leaving === "true") return;
      const shown = el.isConnected !== false && (!el.getClientRects || el.getClientRects().length > 0);
      const now = waited === 0 ? KEPT_AFTER_MS : waited + KEPT_STEP_MS;
      if (!shown) swipeClear(g);
      else if (now >= (g.way === "back" && g.o.backNavigates ? KEPT_WAIT_MS : KEPT_AFTER_MS)) swipeSettle(g);
      else swipeJudge(g, now);
    },
    waited === 0 ? KEPT_AFTER_MS : KEPT_STEP_MS,
  );
};
/** The leave a page that stays takes (the Calendar's days): the settle's length, gathering pace. */
const TURN = { ms: LEAVE_MS, easing: "var(--ease-in)" };
// Away the way it was pulled, on `curve`, then the close; still on screen after it, it settles back. What lay under a page
// carried back comes in as it goes. A page that stays is asked for the next once it has left, and comes back in when that
// has landed.
const swipeLeave = (g: Held, close: () => unknown, curve: { ms: number; easing: string } = TURN) => {
  const { el, wash, way, below, along } = g;
  const done = () => {
    if (way === "page") {
      void Promise.resolve(close()).then(() => swipeArrive(g));
      return;
    }
    close();
    if (way === "away") {
      setTimeout(() => swipeClear(g), KEPT_AFTER_MS);
      return;
    }
    swipeJudge(g);
  };
  const width = el.offsetWidth || DEFAULT_SIZE;
  if (!el.style || motionReduced()) {
    placeUnder(below, width, 1);
    done();
    return;
  }
  const move = `${curve.ms}ms ${curve.easing}`;
  el.style.transition = `transform ${move}`;
  el.style.transform = leaveTo(g, width);
  if (wash && wash.style) {
    wash.style.transition = `opacity ${move}`;
    wash.style.opacity = "0";
  }
  for (const b of below) b.style.transition = `translate ${move}, opacity ${move}`;
  placeUnder(below, width, 1);
  moveAlong(along, width, move);
  setTimeout(done, curve.ms);
};
// A page that stays (the Calendar's days) says only what is each side and how to turn: it is given a strip page's three
// words here, over the element itself. It follows the finger, leaves, turns, and comes back in.
const swipeStays = (g: Held, page: StayingPage): Walked => ({
  prev: page.prev,
  next: page.next,
  drag: (d) => {
    if (g.el.style) Object.assign(g.el.style, { transition: "none", transform: `translate3d(${d}px, 0, 0)` });
  },
  settle: () => swipeSettle(g),
  go: (step) => {
    g.step = step;
    swipeLeave(g, () => page.go(step));
  },
});
// A move read from the element itself, non-passive, and its default refused while the touch carries something across.
const swipeHold = (e: SwipeEvent) => {
  const g = e.currentTarget ? touches.get(e.currentTarget) : undefined;
  if (!g) return;
  g.h.onTouchMove(e);
  if ((g.way === "page" || g.way === "back" || g.way === "away") && e.cancelable !== false && e.preventDefault)
    e.preventDefault();
};
const swipeDrop = (el: HTMLElement) => {
  touches.delete(el);
  if (el.removeEventListener) el.removeEventListener("touchmove", swipeHold);
};

// Which way a touch is taken, once it has gone GRAB_AT: a pull down, a thread back, the drawer away, a page walked, or
// nothing that follows.
const swipeWay = (g: Held, dx: number, dy: number): Way => {
  const { o, el } = g;
  const allowed = !o.when || o.when();
  const down = Math.abs(dy) > Math.abs(dx);
  const page = down || !allowed ? null : swipePageOf(o.pages, el, g);
  if (down) return dy > 0 && g.top && o.onDown && allowed ? "down" : "none";
  if (dx > 0 && o.onBack && allowed && g.x > EDGE && !(page && page.prev)) return "back";
  if (dx < 0 && o.onAway && allowed) return "away";
  if (!page) return "none";
  g.pages = "drag" in page ? page : swipeStays(g, page);
  return g.pages.prev || g.pages.next ? "page" : "none";
};
// The touch taken: what moves with the finger stops easing, and the page is told what it holds.
const swipeTake = (g: Held, dx: number, dy: number) => {
  const { o, el } = g;
  g.way = swipeWay(g, dx, dy);
  if (g.way === "none") return;
  g.wash = washBehind(el);
  // A page moves itself (the strip's, by the deck; one that stays, by swipeStays); anything else is the element.
  if (g.way !== "page" && el.style) el.style.transition = "none";
  if (g.wash && g.wash.style) g.wash.style.transition = "none";
  if (o.onGrab && g.way !== "page") o.onGrab(el, true, g.way);
  // What lies under a page carried back, shown by the grab, starts a little to its left, and dim; what goes with it holds.
  g.below = g.way === "back" && o.under ? o.under() : [];
  g.along = g.way === "back" && o.along ? o.along() : [];
  for (const b of g.below) b.style.transition = "none";
  placeUnder(g.below, el.offsetWidth || DEFAULT_SIZE, 0);
  moveAlong(g.along, 0, "none");
};
// What follows the finger, as far as it has gone.
const swipeFollow = (g: Held, dx: number, dy: number) => {
  const { el } = g;
  if (g.way === "down") {
    const d = Math.max(0, dy);
    el.style.transform = `translate3d(0, ${d}px, 0)`;
    if (g.wash && g.wash.style) g.wash.style.opacity = String(Math.max(0, 1 - d / (el.offsetHeight || DEFAULT_SIZE)));
  } else if (g.way === "back") {
    el.style.transform = `translate3d(${Math.max(0, dx)}px, 0, 0)`;
    const width = el.offsetWidth || DEFAULT_SIZE;
    placeUnder(g.below, width, Math.max(0, dx) / width);
    moveAlong(g.along, Math.max(0, dx), "none");
  } else if (g.way === "away") {
    const d = Math.min(0, dx);
    el.style.transform = `translate3d(${d}px, 0, 0)`;
    if (g.wash && g.wash.style) g.wash.style.opacity = String(Math.max(0, 1 + d / (el.offsetWidth || DEFAULT_SIZE)));
  } else if (g.way === "page" && g.pages) {
    const step = pageStep(dx);
    const open = pageOpen(g.pages, step);
    g.pages.drag(open ? dx : Math.sign(dx) * Math.min(RESIST_MAX, Math.abs(dx) * RESIST), step, open);
  }
};
// A let-go that followed the finger, read at its speed as it lifted: flicked, or past the line and not flicked back, it
// leaves, carrying on from that speed; else it settles back.
const swipeLetGo = (g: Held, dx: number, dy: number) => {
  const { o, el } = g;
  const d = g.way === "down" ? dy : g.way === "away" ? -dx : dx;
  const size = (g.way === "down" ? el.offsetHeight : el.offsetWidth) || DEFAULT_SIZE;
  const speed = liftSpeed(g);
  const flick = d > FLICK_PX && speed > FLICK_PACE;
  const past = d > Math.min(size / 3, LEAVE_LINE_MAX) && speed > -FLICK_PACE;
  const close = g.way === "down" ? o.onDown : g.way === "away" ? o.onAway : o.onBack;
  if ((past || flick) && close) swipeLeave(g, close, carryOn(d, size, speed));
  else swipeSettle(g);
};
// A page walked and let go: past the line or flicked, the page beside at the finger's speed; else back.
const swipePageLetGo = (g: Held, pages: Walked, dx: number) => {
  const { el } = g;
  const step = pageStep(dx);
  const size = el.offsetWidth || DEFAULT_SIZE;
  const flick = Math.abs(dx) > FLICK_PX && Math.abs(dx) / Math.max(1, Date.now() - g.at) > FLICK_PACE;
  if (pageOpen(pages, step) && (Math.abs(dx) > Math.min(size / 3, LEAVE_LINE_MAX) || flick))
    pages.go(step, Date.now() - g.mt > STILL_MS ? 0 : g.vx);
  else pages.settle();
};
// Nothing followed: read at its ends, along the axis it went further on, `min` of travel. A page is walked here too,
// for a touch the browser reported only at its ends.
const swipeEnds = (g: Held, dx: number, dy: number) => {
  const { o, el, min } = g;
  const allowed = !o.when || o.when();
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (Math.abs(dx) < min) return;
    const p = g.way === null && allowed ? swipePageOf(o.pages, el, g) : null;
    if (p && "drag" in p && pageOpen(p, pageStep(dx))) {
      p.go(pageStep(dx), 0);
      return;
    }
    if (p && !("drag" in p) && pageOpen(p, pageStep(dx))) {
      p.go(pageStep(dx));
      return;
    }
    const back = dx > 0 && o.onBack && allowed && g.x > EDGE;
    const away = dx < 0 && o.onAway && allowed;
    const way = away ? o.onAway : dx < 0 ? o.onLeft : back ? o.onBack : o.onRight;
    if (way) way();
    return;
  }
  if (dy < min || !g.top || !o.onDown) return;
  if (!allowed) return;
  o.onDown();
};

/** The handlers for the element a gesture is on (see the header). */
export const touchSwipe = (options: SwipeOptions): SwipeHandlers => {
  const o: SwipeOptions = {
    onLeft: null,
    onRight: null,
    onDown: null,
    onBack: null,
    onAway: null,
    pages: null,
    ...options,
  };
  const min = o.min ?? 80;
  const onTouchStart: Handler = (e) => {
    const t = firstTouchOf(e && e.touches);
    const el = elementOf(e);
    if (!t || !el) return;
    if (swipeOwnDrag(e.target, el)) {
      swipeDrop(el);
      return;
    }
    if (el.addEventListener) el.addEventListener("touchmove", swipeHold, { passive: false });
    touches.set(el, {
      el,
      h,
      held: !!el.addEventListener,
      x: t.clientX,
      y: t.clientY,
      at: Date.now(),
      top: swipeScrollerAtTop(e.target, el),
      way: null,
      onGrab: o.onGrab ?? null,
      o,
      min,
      wash: null,
      from: e.target,
      pages: null,
      step: 0,
      mx: t.clientX,
      my: t.clientY,
      mt: Date.now(),
      vx: 0,
      vy: 0,
      below: [],
      along: [],
    });
  };
  const onTouchMove: Handler = (e) => {
    const t = firstTouchOf(e && e.touches);
    const el = elementOf(e);
    const g = el && touches.get(el);
    if (!t || !el || !g) return;
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    swipePace(g, t.clientX, t.clientY);
    if (g.way === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < GRAB_AT) return;
      swipeTake(g, dx, dy);
      if (g.way === "none") return;
    }
    if (!el.style) return;
    swipeFollow(g, dx, dy);
  };
  const onTouchEnd: Handler = (e) => {
    const t = firstTouchOf(e && e.changedTouches);
    const el = elementOf(e);
    const g = el && touches.get(el);
    if (!t || !el || !g) return;
    swipeDrop(el);
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (g.way === "down" || g.way === "back" || g.way === "away") swipeLetGo(g, dx, dy);
    else if (g.way === "page" && g.pages) swipePageLetGo(g, g.pages, dx);
    else swipeEnds(g, dx, dy);
  };
  const onTouchCancel: Handler = (e) => {
    const el = elementOf(e);
    const g = el && touches.get(el);
    if (!el || !g) return;
    swipeDrop(el);
    if (g.way === "page" && g.pages) g.pages.settle();
    else if (g.way === "down" || g.way === "back" || g.way === "away") swipeSettle(g);
  };
  const h: Handlers = { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
  // React's move handler reads only a touch the element's own listener did not (a test's stub element, which adds none).
  return {
    ...h,
    onTouchMove: (e) => {
      const g = e && e.currentTarget ? touches.get(e.currentTarget) : undefined;
      if (g && !g.held) h.onTouchMove(e);
    },
  };
};
