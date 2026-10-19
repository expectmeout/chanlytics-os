/**
 * A pull past the page's end on a phone: the page gives way under the thumb, and the frame's top holds.
 *
 * On a phone the window scrolls the page (mobile.css, "The window scrolls"), with the frame's top, the tab bar and Ask's
 * circle fixed over it. A pull past the window's top or foot drew the screen's own rubber band, and on an iPhone that
 * band drags what is fixed along with the page: the date, the page's name and its strip came down with the rows (Ruben,
 * 19 Oct 2026, as the head did on 25 Sep), where on the Calendar, which scrolls inside its own box, the board gives way
 * and the bar over it holds. So the screen's band is off there (mobile.css, the root's overscroll-behavior), and the
 * give is drawn here: past the end, the route view follows the thumb on the band's own curve, less the further it goes,
 * and goes back once it is let go. The frame's top, the tab bar and Ask's circle are not in it, and never move.
 *
 * Nothing here knows a page; it asks the styles:
 * - the screen holds (the root's overscroll-behavior-y is none) and the window scrolls the page (the route view, the
 *   document's `main`, is no box of its own): else a pull is the browser's (a desk, a page that holds still in its own
 *   scroller, a dialog that holds the page);
 * - what the thumb is on gives way: nothing under it says it holds still (overscroll-behavior-y: none, as Settings
 *   does), scrolls by itself, or stands fixed (a sheet, a peek);
 * - the page has nothing fixed on the screen as the pull begins (the Inbox's sending strip, a person's dock): a moved
 *   box carries its fixed layers with it, so that pull is left to hold still.
 *
 * Answers how to stop.
 */
export function watchPageGive(win: Window): () => void {
  if (typeof win.addEventListener !== "function") return () => undefined;
  const doc = win.document;
  let grip: Grip | null = null;
  // The page moved, and what was written to move it (as the browser reads it back). It moves by `translate`, never
  // `transform`: the deck moves the same view by its transform, and its arrival plays a transform of its own.
  let moved: { page: HTMLElement; wrote: string } | null = null;
  let backTimer = 0;

  const style = (el: Element) => win.getComputedStyle(el);
  const tall = () => win.innerHeight || doc.documentElement.clientHeight;
  const atTop = () => win.scrollY <= 0;
  const atFoot = () => {
    const scroller = doc.scrollingElement ?? doc.documentElement;
    return win.scrollY >= scroller.scrollHeight - tall() - 1;
  };

  const place = (page: HTMLElement, by: number, way: "held" | "back") => {
    win.clearTimeout(backTimer);
    page.dataset.give = way;
    page.style.translate = `0 ${by}px`;
    moved = { page, wrote: page.style.translate };
  };
  const clear = () => {
    if (!moved) return;
    const { page, wrote } = moved;
    moved = null;
    delete page.dataset.give;
    if (page.style.translate === wrote) page.style.translate = "";
  };
  // Back to where it stands, on the curve the stylesheet gives `data-give="back"` (none where motion is reduced).
  const goBack = () => {
    if (!moved) return;
    const { page } = moved;
    place(page, 0, "back");
    backTimer = win.setTimeout(clear, cssTimeMs(style(page).transitionDuration) + BACK_SLACK_MS);
  };
  // Where the page still going back stands now, as it is drawn ("0px 37.5px", or none).
  const shownAt = (page: HTMLElement) => parseFloat(style(page).translate.split(" ")[1] ?? "") || 0;

  const onStart = (e: TouchEvent) => {
    const [t, second] = Array.from(e.touches);
    if (!t || second) {
      grip = null;
      goBack();
      return;
    }
    const page = (e.target as Element | null)?.closest?.("main") as HTMLElement | null;
    grip = { id: t.identifier, x: t.clientX, y: t.clientY, last: t.clientY, axis: null, way: 0, from: 0, page };
    // A thumb that lands on the page still going back holds it where it is, and takes the pull from there.
    if (moved && moved.page === page && page.dataset.give === "back") {
      const at = shownAt(page);
      place(page, at, "held");
      if (at !== 0) {
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
      if (step > 0 && atTop()) g.way = 1;
      else if (step < 0 && atFoot()) g.way = -1;
      if (g.way !== 0) {
        if (holdsFixed(page, style)) {
          g.page = null;
          g.way = 0;
          return;
        }
        g.from = g.last;
      }
    }
    if (g.way !== 0) {
      const pull = (y - g.from) * g.way;
      if (pull > 0) place(page, g.way * giveOf(pull, tall()), "held");
      else {
        // Back past where the pull began: the window scrolls the page again, from its end.
        g.way = 0;
        if (moved) place(page, 0, "held");
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
  /** Past the page's top (1: the page goes down), past its foot (-1: up), or neither (0). */
  way: 1 | -1 | 0;
  /** Where the thumb stood when the pull past the end began. */
  from: number;
  /** The route view under it while it may give, else null. */
  page: HTMLElement | null;
}

/** How far a thumb goes before the gesture says its way: data-bits touchSwipe's, so both read a touch alike. */
const GRAB_AT = 8;
/** How long after its way back should have ended the page is let go of, should the browser's last frame be late. */
const BACK_SLACK_MS = 40;
/** The share of the thumb's first pixels past the end the page follows: UIScrollView's band. */
const BAND = 0.55;

/** How far the page goes for a pull of `pull` pixels past its end, on a screen `tall` high: never the screen's height. */
function giveOf(pull: number, tall: number): number {
  return (1 - 1 / ((pull * BAND) / tall + 1)) * tall;
}

/** The pull that gives `give` pixels (giveOf, the other way): a page caught going back is held where it stands. */
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
 * Whether a pull on `from` may move `page`: the screen holds and no dialog holds the page, the window scrolls it, the
 * deck is not moving it, and nothing from the thumb up to it holds still, scrolls by itself or stands fixed.
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
    if (n === page) return true;
  }
  return false;
}

/** Whether anything fixed inside the page is on the screen: moved, the page would take it along. */
function holdsFixed(el: Element, style: (el: Element) => CSSStyleDeclaration): boolean {
  for (const child of Array.from(el.children)) {
    const s = style(child);
    if (s.display === "none") continue;
    if (s.position === "fixed" && s.visibility !== "hidden" && child.getClientRects().length > 0) return true;
    if (holdsFixed(child, style)) return true;
  }
  return false;
}
