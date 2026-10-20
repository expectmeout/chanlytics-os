/**
 * A pull past the page's end on a phone: the rows give way under the thumb, and what stands over them holds.
 *
 * On a phone the window scrolls the page (mobile.css, "The window scrolls"), with the frame's top, the tab bar and Ask's
 * circle fixed over it. A pull past the window's top or foot drew the screen's own rubber band, and on an iPhone that
 * band drags what is fixed along with the page: the date, the page's name and its strip came down with the rows (Ruben,
 * 19 Oct 2026, as the head did on 25 Sep), where on the Calendar, which scrolls inside its own box, the board gives way
 * and the bar over it holds. So the screen's band is off there (mobile.css, the root's overscroll-behavior), and the
 * give is drawn here: past the end, what gives follows the thumb on the band's own curve, less the further it goes, and
 * goes back once it is let go. What gives is the page's rows where the page says which box holds them (the custom
 * property `--page-gives`: the Inbox's threads, Conversations' rows, People's table), so the bar, the search and the
 * count over them hold as the Calendar's bar does (Ruben, 19 Oct 2026: "only the table rows should be draggable down");
 * else the route view. The frame's top, the tab bar and Ask's circle are never in it.
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
 *
 * Answers how to stop.
 */
export function watchPageGive(win: Window): () => void {
  if (typeof win.addEventListener !== "function") return () => undefined;
  const doc = win.document;
  let grip: Grip | null = null;
  // What moved, and what was written to move it (as the browser reads it back). It moves by `translate`, never
  // `transform`: the deck moves the route view by its transform, and its arrival plays a transform of its own.
  let moved: { box: HTMLElement; wrote: string } | null = null;
  let backTimer = 0;

  const style = (el: Element) => win.getComputedStyle(el);
  const tall = () => win.innerHeight || doc.documentElement.clientHeight;
  const atTop = () => win.scrollY <= 0;
  const atFoot = () => {
    const scroller = doc.scrollingElement ?? doc.documentElement;
    return win.scrollY >= scroller.scrollHeight - tall() - 1;
  };
  // Where the window's view of the page begins, under the frame's top (mobile.css gives the root that scroll padding).
  const shownFrom = () => parseFloat(style(doc.documentElement).scrollPaddingTop) || 0;

  const place = (box: HTMLElement, by: number, way: "held" | "back") => {
    win.clearTimeout(backTimer);
    box.dataset.give = way;
    box.style.translate = `0 ${by}px`;
    moved = { box, wrote: box.style.translate };
  };
  const clear = () => {
    if (!moved) return;
    const { box, wrote } = moved;
    moved = null;
    delete box.dataset.give;
    if (box.style.translate === wrote) box.style.translate = "";
  };
  // Back to where it stands, on the curve the stylesheet gives `data-give="back"` (none where motion is reduced).
  const goBack = () => {
    if (!moved) return;
    const { box } = moved;
    place(box, 0, "back");
    backTimer = win.setTimeout(clear, cssTimeMs(style(box).transitionDuration) + BACK_SLACK_MS);
  };
  // Where the box still going back stands now, as it is drawn ("0px 37.5px", or none).
  const shownAt = (box: HTMLElement) => parseFloat(style(box).translate.split(" ")[1] ?? "") || 0;

  const onStart = (e: TouchEvent) => {
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
    // A thumb that lands on the page while what gave still goes back holds it where it is, and takes the pull from there.
    if (moved && page?.contains(moved.box) && moved.box.dataset.give === "back") {
      const { box } = moved;
      const at = shownAt(box);
      place(box, at, "held");
      if (at !== 0) {
        grip.box = box;
        grip.way = at > 0 ? 1 : -1;
        grip.from = t.clientY - grip.way * pullOf(Math.abs(at), tall());
      }
    }
  };

  // The pull has gone past an end (`way`): what gives, or null where it holds still this time.
  const giverFor = (page: HTMLElement, way: 1 | -1): HTMLElement | null => {
    const rows = declaredRows(page, style);
    const box = rows ?? page;
    if (holdsFixed(box, style)) return null;
    if (rows && way === -1 && rows.getBoundingClientRect().top > shownFrom()) return null;
    return box;
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
      if (pull > 0) place(g.box, g.way * giveOf(pull, tall()), "held");
      else {
        // Back past where the pull began: the window scrolls the page again, from its end.
        g.way = 0;
        if (moved) place(g.box, 0, "held");
      }
    }
    g.last = y;
  };

  const onEnd = (e: TouchEvent) => {
    const g = grip;
    if (!g || !Array.from(e.changedTouches).some((k) => k.identifier === g.id)) return;
    grip = null;
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
    win.clearTimeout(backTimer);
    clear();
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
/** How long after its way back should have ended the box is let go of, should the browser's last frame be late. */
const BACK_SLACK_MS = 40;
/** The share of the thumb's first pixels past the end the page follows: UIScrollView's band. */
const BAND = 0.55;
/** A touch-action that leaves a vertical pan to the browser: anything else is a box that takes its own drag. */
const PANS_DOWN = /auto|manipulation|pan-y|pan-up|pan-down/;

/** How far the page goes for a pull of `pull` pixels past its end, on a screen `tall` high: never the screen's height. */
function giveOf(pull: number, tall: number): number {
  return (1 - 1 / ((pull * BAND) / tall + 1)) * tall;
}

/** The pull that gives `give` pixels (giveOf, the other way): a box caught going back is held where it stands. */
function pullOf(give: number, tall: number): number {
  return (tall / BAND) * (1 / (1 - Math.min(give, tall - 1) / tall) - 1);
}

/** A CSS time list's first, in milliseconds ("0.36s" -> 360). */
function cssTimeMs(times: string): number {
  const first = times.split(",")[0]?.trim() ?? "";
  const n = parseFloat(first);
  if (!Number.isFinite(n)) return 0;
  return first.endsWith("ms") ? n : n * 1000;
}

/**
 * Whether a pull on `from` may move `page` or its rows: the screen holds and no dialog holds the page, the window
 * scrolls it, the deck is not moving it, and nothing from the thumb up to it holds still, scrolls by itself, stands
 * fixed or takes its own drag.
 */
function mayGive(page: HTMLElement, from: Element | null, doc: Document, style: (el: Element) => CSSStyleDeclaration) {
  const root = style(doc.documentElement);
  if (root.overscrollBehaviorY !== "none" || root.overflowY === "hidden") return false;
  if (style(page).overflowY !== "visible") return false;
  if (page.style.transform) return false;
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
 * property is inherited, so the first in the page's order is the box itself, never a row in it.
 */
function declaredRows(el: Element, style: (el: Element) => CSSStyleDeclaration): HTMLElement | null {
  for (const child of Array.from(el.children)) {
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
