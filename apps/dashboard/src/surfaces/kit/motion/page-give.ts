/**
 * A pull past the page's end on a phone: the rows give way under the thumb, and what stands over them holds.
 *
 * On a phone the window scrolls the page (mobile.css, "The window scrolls"), with the frame's top, the tab bar and Ask's
 * circle fixed over it. A pull past the window's top or foot drew the screen's own rubber band, and on an iPhone that
 * band drags what is fixed along with the page: the date, the page's name and its strip came down with the rows (Ruben,
 * 19 Oct 2026, as the head did on 25 Sep), where on the Calendar, which scrolls inside its own box, the board gives way
 * and the bar over it holds. So the screen's band is off there (mobile.css, the root's overscroll-behavior), and the
 * give is drawn here: past the end, what gives follows the thumb on the band's own curve, less the further it goes, and
 * goes back on the band's spring once it is let go. What gives is the page's rows where the page says which box holds
 * them (the custom property `--page-gives`: the Inbox's threads, Conversations' rows, People's table), so the bar, the
 * search and the count over them hold as the Calendar's bar does (Ruben, 19 Oct 2026: "only the table rows should be
 * draggable down"); else the route view. The frame's top, the tab bar and Ask's circle are never in it.
 *
 * A flick is the thumb's too. Let go, the window glides on, and with the screen's band off a glide that reached the
 * page's top or foot stopped dead there, where an iPhone carries the page past its end and springs it back (1 Nov 2026).
 * So the window's scroll is heard after a vertical let-go (`hearFlings`): a glide that reaches an end still moving gives
 * what gives that speed, and the spring carries it out and back, as UIScrollView's bounce does. A thumb that lands while
 * it is out holds it there, as it holds one going back.
 *
 * Nothing here knows a page; it asks the styles:
 * - the screen holds (the root's overscroll-behavior-y is none) and the window scrolls the page (the route view, the
 *   document's `main`, is no box of its own): else a pull is the browser's (a desk, a page that holds still in its own
 *   scroller, a dialog that holds the page);
 * - what the thumb is on gives way: nothing under it says it holds still (overscroll-behavior-y: none, as Settings
 *   does), scrolls by itself, stands fixed (a sheet, a peek) or takes its own drag (a map: its touch-action, or
 *   data-own-drag, the house's mark for it);
 * - what would move has nothing fixed on the screen in it as the pull begins (the Inbox's sending strip, a person's
 *   dock): a moved box carries its fixed layers with it, so that pull is left to hold still;
 * - rows go up past the page's foot only once nothing of the page over them is on the screen: on a page shorter than
 *   the screen they would slide up over the search.
 * Where motion is reduced a let-go puts it back at once, and a glide stops at the end as it did.
 *
 * Answers how to stop.
 */
import { inHeldList } from "./page-scroll";

export function watchPageGive(win: Window): () => void {
  if (typeof win.addEventListener !== "function") return () => undefined;
  const doc = win.document;
  let grip: Grip | null = null;

  const style = (el: Element) => win.getComputedStyle(el);
  const tall = () => win.innerHeight || doc.documentElement.clientHeight;
  const atTop = () => win.scrollY <= 0;
  const atFoot = () => {
    const scroller = doc.scrollingElement ?? doc.documentElement;
    return win.scrollY >= scroller.scrollHeight - tall() - 1;
  };
  // Where the window's view of the page begins, under the frame's top (mobile.css gives the root that scroll padding).
  const shownFrom = () => parseFloat(style(doc.documentElement).scrollPaddingTop) || 0;
  const give = mover(win, tall);
  const goBack = () => {
    const was = give.moved();
    if (was) give.settle(was, give.shownAt(was), 0);
  };

  // The pull has gone past an end (`way`): what gives, or null where it holds still this time.
  const giverFor = (page: HTMLElement, way: 1 | -1): HTMLElement | null => {
    const rows = declaredRows(page, style);
    const box = rows ?? page;
    if (holdsFixed(box, style)) return null;
    if (rows && way === -1 && rows.getBoundingClientRect().top > shownFrom()) return null;
    return box;
  };

  // A glide that reached an end still moving: what gives goes on past it at that speed, and the spring brings it back.
  const flings = hearFlings(win, atTop, atFoot, (page, way, speed, at) => {
    if (!screenHolds(page, doc, style)) return;
    const box = giverFor(page, way);
    if (box) give.settle(box, give.shownAt(box), way * Math.min(speed, MAX_FLING), at);
  });

  const onStart = (e: TouchEvent) => {
    flings.disarm();
    const [t, second] = Array.from(e.touches);
    if (!t || second) {
      grip = null;
      goBack();
      return;
    }
    const page = (e.target as Element | null)?.closest?.("main") as HTMLElement | null;
    grip = {
      id: t.identifier,
      x: t.clientX,
      y: t.clientY,
      last: t.clientY,
      axis: null,
      way: 0,
      from: 0,
      page,
      box: null,
    };
    // A thumb that lands on the page while what gave is let go (going back, or out on a glide's bounce) holds it where it
    // is, and takes the pull from there.
    const was = give.moved();
    if (was && page?.contains(was) && was.dataset.give === "back") {
      const at = give.shownAt(was);
      give.place(was, at, "held");
      if (at !== 0) {
        grip.box = was;
        grip.way = at > 0 ? 1 : -1;
        grip.from = t.clientY - grip.way * pullOf(Math.abs(at), tall());
      }
    }
  };

  const onMove = (e: TouchEvent) => {
    const g = grip;
    const t = g && Array.from(e.touches).find((k) => k.identifier === g.id);
    if (!g || !t) return;
    const y = t.clientY;
    if (g.axis === null) {
      const dx = t.clientX - g.x;
      const dy = y - g.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < GRAB_AT) return;
      g.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
      if (g.axis === "x" || !g.page || !mayGive(g.page, e.target as Element | null, doc, style)) {
        g.page = null;
        goBack();
        return;
      }
    }
    const page = g.page;
    if (!page) return;
    if (g.way === 0) {
      const step = y - g.last;
      const way = step > 0 && atTop() ? 1 : step < 0 && atFoot() ? -1 : 0;
      if (way !== 0) {
        g.box = giverFor(page, way);
        if (!g.box) {
          g.page = null;
          return;
        }
        g.way = way;
        g.from = g.last;
      }
    }
    if (g.way !== 0 && g.box) {
      const pull = (y - g.from) * g.way;
      if (pull > 0) give.place(g.box, g.way * giveOf(pull, tall()), "held");
      else {
        // Back past where the pull began: the window scrolls the page again, from its end.
        g.way = 0;
        if (give.moved()) give.place(g.box, 0, "held");
      }
    }
    g.last = y;
  };

  const onEnd = (e: TouchEvent) => {
    const g = grip;
    if (!g || !Array.from(e.changedTouches).some((k) => k.identifier === g.id)) return;
    grip = null;
    // A thumb that scrolled the page up or down may have let it glide: heard until the glide stops.
    if (g.axis === "y" && g.page) flings.arm(g.page);
    goBack();
  };

  const opts: AddEventListenerOptions = { capture: true, passive: true };
  win.addEventListener("touchstart", onStart, opts);
  win.addEventListener("touchmove", onMove, opts);
  win.addEventListener("touchend", onEnd, opts);
  win.addEventListener("touchcancel", onEnd, opts);
  return () => {
    win.removeEventListener("touchstart", onStart, opts);
    win.removeEventListener("touchmove", onMove, opts);
    win.removeEventListener("touchend", onEnd, opts);
    win.removeEventListener("touchcancel", onEnd, opts);
    flings.stop();
    give.clear();
  };
}

/** A thumb on the page, from where it landed to now. */
interface Grip {
  id: number;
  x: number;
  y: number;
  /** Where it was at the last move. */
  last: number;
  /** The way it went once it had gone far enough to say: down the screen or across it. */
  axis: "x" | "y" | null;
  /** Past the page's top (1: what gives goes down), past its foot (-1: up), or neither (0). */
  way: 1 | -1 | 0;
  /** Where the thumb stood when the pull past the end began. */
  from: number;
  /** The route view under it while a pull may move it or its rows, else null. */
  page: HTMLElement | null;
  /** What gives, once the pull has gone past an end. */
  box: HTMLElement | null;
}

/** How far a thumb goes before the gesture says its way: kit/motion/swipe.ts touchSwipe's, so both read a touch alike. */
const GRAB_AT = 8;
/** The share of the thumb's first pixels past the end the page follows: UIScrollView's band. */
const BAND = 0.55;
/** A touch-action that leaves a vertical pan to the browser: anything else is a box that takes its own drag. */
const PANS_DOWN = /auto|manipulation|pan-y|pan-up|pan-down/;
/**
 * The spring's pull, each millisecond: UIScrollView's bounce, critically damped at 10 a second. A box let go 100px out
 * is a tenth of the way out 400ms on, and at rest in about 750ms; a glide that reaches the end at a pixel a millisecond
 * carries what gives about 35px past it, at its furthest 100ms on. The deck's spring (view-deck.ts) is twice as stiff,
 * and never passes its place, where a bounce must go past the end before it comes back.
 */
const GIVE_PULL = 0.01;
/** Where the spring is still enough to call it at rest: half a pixel from its place, at a hundredth of a pixel a ms. */
const REST_PX = 0.5;
const REST_SPEED = 0.01;
/** The slowest glide, in pixels a millisecond, that carries the page past its end: slower stops there, as it did. */
const MIN_FLING = 0.25;
/** The fastest one counted: a harder flick than this goes no further past the end. */
const MAX_FLING = 6;
/** How far back the window's scroll is read for a glide's speed. */
const SPEED_WINDOW_MS = 80;
/** A window that has not scrolled for this long since the thumb let go, or since it last scrolled, is no longer gliding. */
const FLING_GAP_MS = 100;

/** How far the page goes for a pull of `pull` pixels past its end, on a screen `tall` high: never the screen's height. */
function giveOf(pull: number, tall: number): number {
  return (1 - 1 / ((pull * BAND) / tall + 1)) * tall;
}

/** The pull that gives `give` pixels (giveOf, the other way): a box caught going back is held where it stands. */
function pullOf(give: number, tall: number): number {
  return (tall / BAND) * (1 / (1 - Math.min(give, tall - 1) / tall) - 1);
}

/**
 * Where the spring stands `ms` after it was let go `from` its place at `speed` (pixels a millisecond, away from its place
 * where it has the sign of `from`), and how fast it is going then. Critically damped: from rest at its place with a speed
 * it goes out and comes back once, and from out at rest it comes back without passing its place.
 */
function settleAt(from: number, speed: number, ms: number): { at: number; speed: number } {
  const b = speed + GIVE_PULL * from;
  const fade = Math.exp(-GIVE_PULL * ms);
  return { at: (from + b * ms) * fade, speed: (b - GIVE_PULL * (from + b * ms)) * fade };
}

/**
 * What the spring's way out is drawn as, on a screen `tall` high: its own pixels near the place, fewer the further it
 * goes, and never the screen's height. The hardest flick counted (MAX_FLING) carries it out a fifth of the screen.
 */
function soften(out: number, tall: number): number {
  return (out * tall) / (Math.abs(out) + tall);
}

/** The spring's way out that is drawn as `shown` (soften, the other way): a box let go is sprung from where it stands. */
function unsoften(shown: number, tall: number): number {
  return (shown * tall) / (tall - Math.min(Math.abs(shown), tall - 1));
}

/** How far a `translate` puts a box down the screen, as it is written or read back ("0 37.5px", "0px 37.5px", none). */
function downOf(translate: string): number {
  return parseFloat(translate.trim().split(/\s+/)[1] ?? "") || 0;
}

/** Whether motion is to be kept to what the person does with their own hand. */
function stillMotion(win: Window): boolean {
  return typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The window's clock, in the milliseconds its frames are stamped with; null where it keeps none. */
function clockOf(win: Window): number | null {
  return typeof win.performance?.now === "function" ? win.performance.now() : null;
}

/**
 * What gave, and how it is moved: by `translate`, never `transform`, since the deck moves the route view by its
 * transform, and its arrival plays a transform of its own. `place` stands it somewhere (under the thumb, `held`);
 * `settle` lets it go on the spring (`back`), from where it stands and at a speed, frame by frame until it is at rest;
 * `clear` takes off what was written. One box at a time.
 */
function mover(win: Window, tall: () => number) {
  // What moved, and what was written to move it (as the browser reads it back).
  let moved: { box: HTMLElement; wrote: string } | null = null;
  let frame = 0;
  const halt = () => {
    if (frame && typeof win.cancelAnimationFrame === "function") win.cancelAnimationFrame(frame);
    frame = 0;
  };
  const draw = (box: HTMLElement, by: number) => {
    box.style.translate = `0 ${by}px`;
    moved = { box, wrote: box.style.translate };
  };
  const clear = () => {
    halt();
    if (!moved) return;
    const { box, wrote } = moved;
    moved = null;
    delete box.dataset.give;
    if (box.style.translate === wrote) box.style.translate = "";
  };
  const place = (box: HTMLElement, by: number, way: "held" | "back") => {
    halt();
    if (moved && moved.box !== box) clear();
    box.dataset.give = way;
    draw(box, by);
  };
  // `start` is when the spring was let go, on the window's clock: else the first frame it is drawn in.
  const settle = (box: HTMLElement, from: number, speed: number, start: number | null = null) => {
    place(box, from, "back");
    const still = Math.abs(from) < REST_PX && Math.abs(speed) < REST_SPEED;
    if (still || stillMotion(win) || typeof win.requestAnimationFrame !== "function") return clear();
    const high = tall();
    const out = unsoften(from, high);
    let began = start;
    const step = (now: number) => {
      began ??= now;
      const spring = settleAt(out, speed, Math.max(0, now - began));
      if (Math.abs(spring.at) < REST_PX && Math.abs(spring.speed) < REST_SPEED) return clear();
      draw(box, soften(spring.at, high));
      frame = win.requestAnimationFrame(step);
    };
    frame = win.requestAnimationFrame(step);
  };
  // Where a box stands now: what was last written to it, which is what is drawn, since nothing eases it in between.
  const shownAt = (box: HTMLElement) => (moved?.box === box ? downOf(box.style.translate) : 0);
  return { place, settle, clear, shownAt, moved: () => moved?.box ?? null };
}

/** The window's scroll at a moment: where it stood, and when. */
interface Seen {
  at: number;
  y: number;
}

/**
 * The window's glide after a vertical let-go on `page`, heard from its scroll: where it reaches the top (`way` 1) or the
 * foot (-1) at `MIN_FLING` or faster, `reached` is told the page, the end, the speed it reached it at and when. The
 * speed is read from the scroll before the last step, which the end cut short, and "when" is the moment the glide
 * crossed the end at that speed, not the frame that said so: the spring goes on from there, so the frame the end cut
 * short is not a stall with a jump after it (a glide at 5.6 pixels a millisecond went 35px into its last frame, then
 * stood, then the rows went 69px at once: Chromium's own fling, measured 1 Nov 2026). Heard from the let-go until a new
 * touch, an end reached, or the window stops (`FLING_GAP_MS` with no scroll), so a scroll the page makes by itself (a
 * list put back, a tap on the frame's top) is never a glide.
 */
function hearFlings(
  win: Window,
  atTop: () => boolean,
  atFoot: () => boolean,
  reached: (page: HTMLElement, way: 1 | -1, speed: number, at: number) => void,
) {
  let gliding: { page: HTMLElement; last: number } | null = null;
  let seen: Seen[] = [];
  const onScroll = () => {
    const at = clockOf(win);
    if (at === null) return;
    const g = gliding;
    if (g && at - g.last > FLING_GAP_MS) gliding = null;
    else if (g) {
      g.last = at;
      const first = seen[0];
      const last = seen[seen.length - 1];
      const speed = first && last && last.at > first.at ? (last.y - first.y) / (last.at - first.at) : 0;
      const way = speed <= -MIN_FLING && atTop() ? 1 : speed >= MIN_FLING && atFoot() ? -1 : 0;
      if (way !== 0 && last) {
        gliding = null;
        const crossed = last.at + Math.abs(win.scrollY - last.y) / Math.abs(speed);
        reached(g.page, way, Math.abs(speed), Math.min(crossed, at));
      }
    }
    seen = seen.filter((s) => at - s.at <= SPEED_WINDOW_MS);
    seen.push({ at, y: win.scrollY });
  };
  const opts: AddEventListenerOptions = { passive: true };
  win.addEventListener("scroll", onScroll, opts);
  return {
    arm: (page: HTMLElement) => {
      const at = clockOf(win);
      gliding = at === null ? null : { page, last: at };
    },
    disarm: () => {
      gliding = null;
    },
    stop: () => win.removeEventListener("scroll", onScroll, opts),
  };
}

/** Whether the screen holds and the window scrolls `page`: no dialog holds the page, and the deck is not moving it. */
function screenHolds(page: HTMLElement, doc: Document, style: (el: Element) => CSSStyleDeclaration): boolean {
  const root = style(doc.documentElement);
  if (root.overscrollBehaviorY !== "none" || root.overflowY === "hidden") return false;
  if (page.isConnected === false || style(page).overflowY !== "visible") return false;
  return !page.style.transform;
}

/**
 * Whether a pull on `from` may move `page` or its rows: the screen holds (screenHolds), and nothing from the thumb up to
 * it holds still, scrolls by itself, stands fixed or takes its own drag.
 */
function mayGive(page: HTMLElement, from: Element | null, doc: Document, style: (el: Element) => CSSStyleDeclaration) {
  if (!screenHolds(page, doc, style)) return false;
  for (let n: Element | null = from; n; n = n.parentElement) {
    const s = style(n);
    if (s.position === "fixed" || s.overscrollBehaviorY === "none") return false;
    if ((s.overflowY === "auto" || s.overflowY === "scroll") && n.scrollHeight > n.clientHeight + 1) return false;
    if (!PANS_DOWN.test(s.touchAction || "auto") || n.hasAttribute("data-own-drag")) return false;
    if (n === page) return true;
  }
  return false;
}

/**
 * The box of rows the page shows that says it gives (`--page-gives`), the first drawn; null where none does. The
 * property is inherited, so the first in the page's order is the box itself, never a row in it. A list held under what
 * it opened, and its picture (held-list.ts), are not the page on the screen: passed over.
 */
function declaredRows(el: Element, style: (el: Element) => CSSStyleDeclaration): HTMLElement | null {
  for (const child of Array.from(el.children)) {
    if (inHeldList(child)) continue;
    const s = style(child);
    if (s.display === "none") continue;
    if (s.getPropertyValue("--page-gives").trim()) return child as HTMLElement;
    const inside = declaredRows(child, style);
    if (inside) return inside;
  }
  return null;
}

/** Whether anything fixed inside the box is on the screen: moved, the box would take it along. */
function holdsFixed(el: Element, style: (el: Element) => CSSStyleDeclaration): boolean {
  for (const child of Array.from(el.children)) {
    const s = style(child);
    if (s.display === "none") continue;
    if (s.position === "fixed" && s.visibility !== "hidden" && child.getClientRects().length > 0) return true;
    if (holdsFixed(child, style)) return true;
  }
  return false;
}
