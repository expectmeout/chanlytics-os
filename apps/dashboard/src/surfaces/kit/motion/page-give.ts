/**
 * The page's ends on a phone: the screen's own band, and the one pull it is not given.
 *
 * On a phone the window scrolls the page (mobile.css, "The window scrolls"), with the frame's top, the tab bar and Ask's
 * circle fixed over it, and past the page's top or foot the screen's own band carries the page on and springs it back:
 * a glide that reaches an end, a thumb that scrolls on past one. It runs on the screen's own clock, and what is fixed
 * holds where it stands through it, since WebKit places fixed layers by a viewport the document does not bound while
 * the page bands (WebPageProxy::unconstrainedLayoutViewportRect). The band was off from 19 Oct 2026 and drawn here, and a
 * bounce drawn by the page could never take over from the screen's glide without a stall or a jump: the screen stops
 * the glide at the end by itself, and the page hears of it frames later (1 Nov 2026: "it flickers, it glitches when
 * transitioning to the bounce"). So the band is the screen's again.
 *
 * But for one pull: a thumb pulling down a page at rest at its top. Safari takes that for its pull to refresh, which
 * slides the whole screen down, the frame's top in it, to show its spinner (Ruben, 19 Oct 2026: the date, the page's
 * name and its strip came down with the rows), and reloads the app when let go far enough. So while the page rests at
 * its top its band is off (watchRest: `data-page-top` on the root, mobile.css), and that pull is drawn here: what gives
 * follows the thumb on the band's curve, less the further it goes, and goes back on the band's spring once let go,
 * played by the compositor. What gives is the page's rows where the page says which box holds them (the custom property
 * `--page-gives`: the Inbox's threads, Conversations' rows, People's table, an open thread's conversation), so the bar,
 * the search and the count over them hold (Ruben, 19 Oct 2026: "only the table rows should be draggable down"), and so
 * does what is stuck to the screen's foot (a thread's reply box), as it holds through the screen's band; else the route
 * view. An app on the home screen has no pull to refresh and keeps its band at the top too (mobile.css), so nothing
 * here moves there.
 *
 * Nothing here knows a page; it asks the styles. A pull is drawn where the root's band is off (its overscroll-behavior-y
 * is none) and the window scrolls the page (the route view, the document's `main`, is no box of its own); where nothing
 * from the thumb up to the page holds still (overscroll-behavior-y: none, as Settings does), scrolls by itself, stands
 * fixed (a sheet, a peek) or takes its own drag (a map's touch-action, or data-own-drag); where what would give holds
 * nothing fixed on the screen, which a moved box carries along (the Inbox's sending strip, a person's dock); and rows go
 * up past a short page's foot only once nothing over them is on the screen. Where motion is reduced a let-go puts what
 * gave back at once.
 *
 * Answers how to stop.
 */
import { inHeldList } from "./page-scroll";

export function watchPageGive(win: Window): () => void {
  if (typeof win.addEventListener !== "function") return () => undefined;
  const doc = win.document;
  const style = (el: Element) => win.getComputedStyle(el);
  const tall = () => win.innerHeight || doc.documentElement.clientHeight;
  const atTop = () => win.scrollY <= 0;
  const atFoot = () => {
    const scroller = doc.scrollingElement ?? doc.documentElement;
    return win.scrollY >= scroller.scrollHeight - tall() - 1;
  };
  // Whether the screen leaves the page's end to us now: its band is off, as it is while the page rests at its top.
  const bandOff = () => style(doc.documentElement).overscrollBehaviorY === "none";
  // Where the window's view of the page begins, under the frame's top (mobile.css gives the root that scroll padding).
  const shownFrom = () => parseFloat(style(doc.documentElement).scrollPaddingTop) || 0;
  // The pull has gone past an end (`way`): what gives, or null where it holds still this time.
  const giverFor = (page: HTMLElement, way: 1 | -1): HTMLElement | null => {
    const rows = declaredRows(page, style);
    const box = rows ?? page;
    if (holdsFixed(box, style)) return null;
    if (rows && way === -1 && rows.getBoundingClientRect().top > shownFrom()) return null;
    return box;
  };
  const stopRest = watchRest(win, doc.documentElement);
  const give = mover(win);
  let grip: Grip | null = null;

  const onStart = (e: TouchEvent) => {
    const [t, second] = Array.from(e.touches);
    if (!t || second) {
      grip = null;
      give.goBack(0);
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
      seen: [],
    };
    // A thumb that lands on the page while what gave goes back holds it where it is drawn, and takes the pull on from
    // there.
    const was = give.box();
    if (was && page?.contains(was) && give.going()) {
      const at = give.drawnAt();
      give.hold(was, at);
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
        grip = null;
        give.goBack(0);
        return;
      }
    }
    const page = g.page;
    if (!page) return;
    if (g.way === 0) {
      const step = y - g.last;
      const way = step > 0 && atTop() ? 1 : step < 0 && atFoot() ? -1 : 0;
      if (way !== 0) {
        // Past an end the page gives only where the screen's band is off there; else the band is the screen's.
        g.box = bandOff() ? giverFor(page, way) : null;
        if (!g.box) {
          grip = null;
          return;
        }
        g.way = way;
        g.from = g.last;
      }
    }
    if (g.way !== 0 && g.box) {
      const pull = (y - g.from) * g.way;
      const at = pull > 0 ? g.way * giveOf(pull, tall()) : 0;
      // Back past where the pull began, it is at its place, and the window scrolls the page again from its end.
      if (pull <= 0) g.way = 0;
      if (pull > 0 || give.box() === g.box) {
        give.hold(g.box, at);
        g.seen = [...g.seen.filter((s) => nowOf(win) - s.t <= SPEED_WINDOW_MS), { t: nowOf(win), at }];
      }
    }
    g.last = y;
  };

  const onEnd = (e: TouchEvent) => {
    const g = grip;
    if (!g || !Array.from(e.changedTouches).some((k) => k.identifier === g.id)) return;
    grip = null;
    give.goBack(releaseSpeed(g.seen, nowOf(win)));
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
    give.clear();
    stopRest();
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
  /** Past the page's top (1: the page goes down), past its foot (-1: up), or neither (0). */
  way: 1 | -1 | 0;
  /** Where the thumb stood when the pull past the end began. */
  from: number;
  /** The route view under it, while a pull may move it or its rows. */
  page: HTMLElement | null;
  /** What gives, once the pull has gone past an end. */
  box: HTMLElement | null;
  /** Where the page was drawn under the thumb lately, and when: how fast it was going as it was let go. */
  seen: { t: number; at: number }[];
}

/** How far a thumb goes before the gesture says its way: kit/motion/swipe.ts touchSwipe's, so both read a touch alike. */
const GRAB_AT = 8;
/** The share of the thumb's first pixels past the end the page follows: UIScrollView's band. */
const BAND = 0.55;
/** A touch-action that leaves a vertical pan to the browser: anything else is a box that takes its own drag. */
const PANS_DOWN = /auto|manipulation|pan-y|pan-up|pan-down/;
/** The root's mark while the page rests at its top, which turns the screen's band off there (mobile.css). */
const PAGE_TOP = "data-page-top";
/**
 * How long the window stands still at its top before the page rests there: the screen's own band settling back to the
 * top scrolls the window every frame until it is home, so the band is never turned off under a page still banding.
 */
const REST_MS = 120;
/**
 * The spring's pull, each millisecond: UIScrollView's, critically damped at 10 a second. A page let go 100px past its
 * end is a tenth of the way out 400ms on, and at rest in about 750ms, never passing its place.
 */
const GIVE_PULL = 0.01;
/** Where the spring is still enough to call it at rest: half a pixel from its place, at a hundredth of a pixel a ms. */
const REST_PX = 0.5;
const REST_SPEED = 0.01;
/** The spring's frames are written this far apart; the compositor draws straight lines between them. */
const SAMPLE_MS = 16;
/** The longest a settle is written for: a page let go at the furthest a thumb can pull is at rest well within it. */
const SETTLE_MAX_MS = 2000;
/** How far back the thumb's last moves are read for how fast the page was going as it was let go. */
const SPEED_WINDOW_MS = 80;
/** A thumb that had stood still this long before it let go let the page go at rest. */
const STILL_MS = 50;
/** The fastest a page let go still going out goes on: on, a little, then back, never far past where it was let go. */
const OUT_SPEED_MAX = 1;

/** How far the page goes for a pull of `pull` pixels past its end, on a screen `tall` high: never the screen's height. */
function giveOf(pull: number, tall: number): number {
  return (1 - 1 / ((pull * BAND) / tall + 1)) * tall;
}

/** The pull that gives `give` pixels (giveOf, the other way): a page caught going back is held where it stands. */
function pullOf(give: number, tall: number): number {
  return (tall / BAND) * (1 / (1 - Math.min(give, tall - 1) / tall) - 1);
}

/** The window's clock, in milliseconds. */
function nowOf(win: Window): number {
  return typeof win.performance?.now === "function" ? win.performance.now() : Date.now();
}

/**
 * How fast the page was going as the thumb let it go, in pixels a millisecond down the screen, from where it was drawn
 * over the last moves: none where the thumb had stood still, and no faster out than OUT_SPEED_MAX.
 */
function releaseSpeed(seen: readonly { t: number; at: number }[], now: number): number {
  const first = seen[0];
  const last = seen[seen.length - 1];
  if (!first || !last || last.t <= first.t || now - last.t > STILL_MS) return 0;
  const speed = (last.at - first.at) / (last.t - first.t);
  const out = Math.sign(speed) === Math.sign(last.at);
  return out ? Math.sign(speed) * Math.min(Math.abs(speed), OUT_SPEED_MAX) : speed;
}

/**
 * The spring's way home from `from` pixels past the page's place, let go at `speed`, as the frames of a web animation:
 * one each SAMPLE_MS until it is at rest, the last exactly at its place. Critically damped, and a speed home that would
 * carry it past its place is held to the fastest that does not, so it never passes it.
 */
function homeFrames(from: number, speed: number): { frames: Keyframe[]; ms: number } {
  const lead = speed + GIVE_PULL * from;
  const b = from !== 0 && Math.sign(lead) !== -Math.sign(from) ? lead : 0;
  const at = (t: number) => (from + b * t) * Math.exp(-GIVE_PULL * t);
  const pace = (t: number) => (b - GIVE_PULL * (from + b * t)) * Math.exp(-GIVE_PULL * t);
  let ms = SAMPLE_MS;
  while (ms < SETTLE_MAX_MS && !(Math.abs(at(ms)) < REST_PX && Math.abs(pace(ms)) < REST_SPEED)) ms += SAMPLE_MS;
  const frames: Keyframe[] = [];
  for (let t = 0; t < ms; t += SAMPLE_MS) frames.push({ offset: t / ms, translate: `0 ${at(t)}px` });
  frames.push({ offset: 1, translate: "0 0px" });
  return { frames, ms };
}

/** How far a `translate` puts a box down the screen, as it is written or read back ("0 37.5px", "0px 37.5px", none). */
function downOf(translate: string): number {
  return parseFloat(translate.trim().split(/\s+/)[1] ?? "") || 0;
}

/** Whether motion is to be kept to what the person does with their own hand. */
function stillMotion(win: Window): boolean {
  return typeof win.matchMedia === "function" && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The root marked while the page rests at its top (`data-page-top`), which turns the screen's band off there
 * (mobile.css): from the first draw at the top, and once the window has stood at its top for REST_MS since it last
 * moved; unmarked the moment it scrolls from it, and while it bands past it. Answers how to stop.
 */
function watchRest(win: Window, root: HTMLElement): () => void {
  let quiet = 0;
  const home = () => Math.abs(win.scrollY) < 0.5;
  const mark = (top: boolean) => {
    if (top !== root.hasAttribute(PAGE_TOP)) root.toggleAttribute(PAGE_TOP, top);
  };
  const onScroll = () => {
    win.clearTimeout(quiet);
    if (!home()) mark(false);
    else quiet = win.setTimeout(() => mark(home()), REST_MS);
  };
  mark(home());
  const opts: AddEventListenerOptions = { passive: true };
  win.addEventListener("scroll", onScroll, opts);
  return () => {
    win.clearTimeout(quiet);
    win.removeEventListener("scroll", onScroll, opts);
    root.removeAttribute(PAGE_TOP);
  };
}

/**
 * The page as the thumb holds it and the spring takes it home. It moves by `translate`, never `transform`, since the deck
 * moves the route view by its transform, and its arrival plays a transform of its own. `hold` stands it where the thumb
 * has it (`data-give="held"`, which mobile.css lifts onto a layer of its own); `goBack` lets it go on the spring
 * (`back`), from where it is drawn and at a speed, as one web animation the compositor plays to rest; `clear` takes off
 * what was written. One page at a time.
 */
function mover(win: Window) {
  const style = (el: Element) => win.getComputedStyle(el);
  // What moved, and what was written to move it (as the browser reads it back).
  let moved: { box: HTMLElement; wrote: string } | null = null;
  let playing: Animation | null = null;
  const halt = () => {
    const was = playing;
    playing = null;
    was?.cancel();
  };
  const write = (box: HTMLElement, by: number) => {
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
  // Where the page is drawn now: where the thumb put it, or where the spring has it this frame.
  const drawnAt = () => (moved ? downOf(style(moved.box).translate) : 0);
  const hold = (box: HTMLElement, by: number) => {
    if (moved && moved.box !== box) clear();
    else halt();
    box.dataset.give = "held";
    write(box, by);
  };
  const goBack = (speed: number) => {
    if (!moved) return;
    const { box } = moved;
    const from = drawnAt();
    halt();
    // Where it rests is what is written: the spring's frames play over it, and leave it there as they end.
    box.dataset.give = "back";
    write(box, 0);
    const still = Math.abs(from) < REST_PX && Math.abs(speed) < REST_SPEED;
    if (still || stillMotion(win) || typeof box.animate !== "function") return clear();
    const home = homeFrames(from, speed);
    const anim = box.animate(home.frames, { duration: home.ms, easing: "linear", fill: "none" });
    anim.onfinish = () => {
      if (playing === anim) clear();
    };
    playing = anim;
  };
  return { hold, goBack, clear, drawnAt, box: () => moved?.box ?? null, going: () => playing !== null };
}

/**
 * Whether a pull on `from` may move `page` or its rows: no dialog holds the page, the window scrolls it, the deck is not
 * moving it, and nothing from the thumb up to it holds still, scrolls by itself, stands fixed or takes its own drag.
 */
function mayGive(page: HTMLElement, from: Element | null, doc: Document, style: (el: Element) => CSSStyleDeclaration) {
  if (style(doc.documentElement).overflowY === "hidden") return false;
  if (page.isConnected === false || style(page).overflowY !== "visible" || page.style.transform) return false;
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
