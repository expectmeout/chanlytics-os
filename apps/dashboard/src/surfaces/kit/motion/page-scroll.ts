/**
 * What scrolls a page, and where to hear it scroll.
 *
 * On a desk the frame is one box the height of the window, and a page scrolls inside it: the frame's `main`, or the list
 * a page of panes scrolls in. On a phone the window scrolls (mobile.css, "The window scrolls"): Safari draws its
 * toolbar as glass over the page and tucks it away as the page moves, and it does both only for the document's own
 * scroll, never for a box inside it. So there a page's list is as tall as what it holds, and what reads or moves a
 * page's scroll reads and moves the document's. Since 21 Oct 2026 that is every page on a phone, the Calendar's board, an
 * open thread and Live among them, which kept scrollers of their own until then; a box that still scrolls itself (a
 * sheet's, a desk's pane) is found as one.
 *
 * Nothing here knows a page: it asks the styles. A box scrolls itself where its overflow says so; the document scrolls
 * what no box does.
 */

/** The document's scroller: what moves when the window scrolls. */
export function documentScroller(): HTMLElement {
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Whether this is the document's scroller, whose scroll is heard on the window and not on itself. */
export function isDocumentScroller(el: Element | null | undefined): boolean {
  return !!el && (el === documentScroller() || el === document.documentElement || el === document.body);
}

/**
 * Where a box's view of what it scrolls begins on the screen: under what stands over it (its scroll padding; on a phone
 * the document's is the frame's top, mobile.css). A list's place is read against it (held-list.ts, People's scroller.ts).
 */
export function viewTop(scroller: HTMLElement): number {
  const pad = Number.parseFloat(window.getComputedStyle(scroller).scrollPaddingTop) || 0;
  return isDocumentScroller(scroller) ? pad : scroller.getBoundingClientRect().top + pad;
}

/** What a row of a list is: a table's row, a list's item, a listbox's option, one marked so (Live's calls, a sequence). */
export const ROW = 'tr, li, [role="option"], [role="row"], [data-row]';

/**
 * How far `scroller` scrolls before the first row drawn in `list` reaches the top of its view: past what stands over the
 * rows (the list's head: its channels or filters, its search, a standing line). The first in the page's order, as drawn
 * (a list in groups draws its first group first, whatever its rows' order), and a list drawn in part draws its rows from
 * the one at its top down. Null where no row of it is drawn.
 */
export function rowsBeginAt(list: Element, scroller: HTMLElement): number | null {
  // A stand-in page in a test may have no rows to ask for.
  const rows = list.querySelectorAll?.(ROW);
  if (!rows) return null;
  for (const row of Array.from(rows))
    if (row.getClientRects().length > 0)
      return row.getBoundingClientRect().top - viewTop(scroller) + scroller.scrollTop;
  return null;
}

/**
 * Scrolls a page made of a box for its own sake, not the reader's (a sheet lifting the row it is of above it, People's
 * pipeline/row-above-sheet.ts): where the reader had left the box, while the scroll stands. A page that keeps the reader's
 * place (People's use-place.ts) keeps that one: the Pipeline kept a sheet's lift as its place, and came back lifted, its
 * controls under the frame's top, wherever the sheet had gone (Ruben, 22 Oct 2026).
 */
const madeScrolls = new Map<HTMLElement, { from: number; stands: () => boolean; again: () => void }>();

/**
 * A scroll of `box` made for the page's own sake, from where the reader had left it, while `stands` says it does; `again`
 * makes it again from where the box is now, once the reader's place is put back under it (placeReader).
 */
export function scrollMade(box: HTMLElement, from: number, stands: () => boolean, again: () => void): void {
  madeScrolls.set(box, { from, stands, again });
}

/**
 * The reader's place put back in `box` at `top` (a page's place, kept by the tab, as it arrives or is reloaded), and a
 * scroll the page made over it made again from there: a sheet opened by the address had lifted its row before the place
 * came back, and the place put the rows back under the sheet.
 */
export function placeReader(box: HTMLElement, top: number): void {
  const from = box.scrollTop;
  box.scrollTop = top;
  if (isDocumentScroller(box)) windowAsked(top, from);
  const made = madeScrolls.get(box);
  if (!made) return;
  if (!made.stands()) {
    madeScrolls.delete(box);
    return;
  }
  made.from = top;
  made.again();
}

/** The scroll made of `box` given back: what is heard of it is the reader's again. */
export function scrollGivenBack(box: HTMLElement): void {
  madeScrolls.delete(box);
}

/** The reader's place in `box`, heard at `heard`: where they had left it while the page has scrolled it for itself. */
export function readersScroll(box: HTMLElement, heard: number): number {
  const made = madeScrolls.get(box);
  if (!made) return heard;
  if (made.stands()) return made.from;
  madeScrolls.delete(box);
  return heard;
}

/** Whether the box's own styles make it scroll down its length (it may hold too little to move yet). */
export function scrollsItself(el: Element): boolean {
  if (isDocumentScroller(el)) return true;
  const over = window.getComputedStyle(el).overflowY;
  return over === "auto" || over === "scroll";
}

/**
 * The box that scrolls `node`: the nearest one above it that scrolls itself, `node` itself where `self` says so, and the
 * document's scroller where none does.
 */
export function scrollerOf(node: Element | null | undefined, { self = false }: { self?: boolean } = {}): HTMLElement {
  const body = document.body;
  for (
    let n = node ? (self ? node : node.parentElement) : null;
    n && n !== body && n !== document.documentElement;
    n = n.parentElement
  ) {
    if (scrollsItself(n)) return n as HTMLElement;
  }
  return documentScroller();
}

/**
 * The box that moves `node` as it scrolls now: the nearest above it that scrolls itself AND holds more than it shows,
 * `node` itself where `self` says so, else the document's scroller. A box that scrolls only across (a wide table's) has a
 * computed overflow down its length too, but grows with its rows and holds no more than it shows: passed over, as a
 * phone's table is.
 */
export function movingScrollerOf(node: Element, { self = false }: { self?: boolean } = {}): HTMLElement {
  const body = document.body;
  for (let n = self ? node : node.parentElement; n && n !== body && n !== document.documentElement; n = n.parentElement)
    if (scrollsItself(n) && n.scrollHeight > n.clientHeight + 1) return n as HTMLElement;
  return documentScroller();
}

/**
 * Whether `el` is in a list held under what it opened, or its picture (held-list.ts): no page on the screen, whose rows
 * nothing measures and whose scroll the window is not (shown-rows.ts, People's scroller.ts, page-give.ts). Asked here,
 * beside the scroll it is about, so what only asks (the frame's page-give) loads nothing of the hold.
 */
export function inHeldList(el: Element | null | undefined): boolean {
  return !!el?.closest?.("[data-held]");
}

/** How tall the screen a box shows is: the window's for the document's scroller (its clientHeight is the window's too). */
export function shownHeight(box: Element): number {
  return isDocumentScroller(box) ? document.documentElement.clientHeight : box.clientHeight;
}

/**
 * The cut that keeps a copy of a page, fixed to the screen a moment with its foot at `bottom` (from the screen's top), off
 * the point over the window's foot that Safari reads (tokens.css --foot-clear): the page leaving as the next arrives, a
 * list shown under a page a thumb carries back. Safari paints a band under its bar for a box it reads there, and keeps it
 * for as long as that box is drawn, wherever it stands since: a list put back in its page kept it there for good. `top`
 * cuts as much off its head (from the box's own top), where something drawn over it hides it anyway.
 */
export function clearOfFoot(bottom: number, top = 0): string {
  const head = top >= 0.5 ? `${Math.round(top)}px` : "0";
  return `inset(${head} 0 max(0px, ${Math.round(bottom)}px - 100dvh + var(--foot-clear, 0px)) 0)`;
}

/** Where `el` stands from the top of what `box` scrolls, in pixels: its offset in the box's content. */
export function offsetIn(box: Element, el: Element): number {
  const top = isDocumentScroller(box) ? 0 : box.getBoundingClientRect().top - box.clientTop;
  return el.getBoundingClientRect().top - top + box.scrollTop;
}

/**
 * How many frames the window is heard after it is asked for a top: Safari said where it stood within three on the
 * recording, and its chrome moves in well under twenty.
 */
const SAFARI_PUTS_BACK_FRAMES = 20;
/** How many times the window is asked again within them. A Back on 23 Oct 2026 answered 40 for 4.5 seconds: never a loop. */
const ASK_AGAIN_MAX = 2;
/** What ends the asking: a hand on the window, a wheel, a key. */
const ASKING_ENDS = ["touchstart", "touchmove", "pointerdown", "wheel", "keydown"] as const;

/** The asking under way, to end; null with none. One at a time: a page's next ask replaces the last. */
let asking: (() => void) | null = null;

/** What the asking needs of a window. */
type HeardWindow = Pick<
  Window,
  "scrollY" | "scrollTo" | "addEventListener" | "removeEventListener" | "requestAnimationFrame" | "cancelAnimationFrame"
>;
/** A window as a test may stand in for it: with less of that, it is scrolled once and not heard. */
type AskedWindow = Pick<Window, "scrollY"> & Partial<Omit<HeardWindow, "scrollY">>;

const canBeHeard = (win: AskedWindow): win is HeardWindow =>
  typeof win.addEventListener === "function" &&
  typeof win.removeEventListener === "function" &&
  typeof win.requestAnimationFrame === "function" &&
  typeof win.cancelAnimationFrame === "function" &&
  typeof win.scrollTo === "function";

/**
 * The window heard after it was asked for `top` from `from`, and asked again once Safari has put it back. On an iPhone the
 * window's scroll is Safari's, and a page's own scroll, made in the instant the address changes, is thrown away inside
 * Safari while it changes its chrome (WebKit's WKWebViewIOS.mm `_scrollToContentScrollPosition:` returns, saying nothing,
 * while `_shouldDeferGeometryUpdates` or a restore's commit): the page believes it for a few frames, then Safari says where
 * the window still stands. Every page opened after a little scroll on People sat 22px down from its first frame (Ruben's
 * recording, 7 Nov 2026: the frame top's fade, drawn only while the page believes it is scrolled, blinked off for three
 * frames at each arrival, and the content never moved). So for SAFARI_PUTS_BACK_FRAMES after the ask: the window put
 * back between `top` and where it stood (there, or as far back as a shorter page allows), with no touch, wheel or key
 * since, is asked again, at most ASK_AGAIN_MAX times. A scroll past either is the page's own (a row brought into view),
 * and a page's next ask replaces this one, so what a page scrolls to as it arrives (the Calendar's hour) is what is kept.
 */
export function windowAsked(top: number, from: number, win: AskedWindow = window): void {
  asking?.();
  if (!canBeHeard(win)) return;
  const heard: HeardWindow = win;
  const at = Math.max(0, top);
  const stood = Number.isFinite(from) ? from : at;
  const low = Math.min(at, stood) - 0.5;
  const high = Math.max(at, stood) + 0.5;
  let again = 0;
  let left = SAFARI_PUTS_BACK_FRAMES;
  let frame = 0;
  const end = (): void => {
    if (asking !== end) return;
    asking = null;
    heard.cancelAnimationFrame(frame);
    heard.removeEventListener("scroll", onScroll);
    for (const kind of ASKING_ENDS) heard.removeEventListener(kind, end, true);
  };
  const onScroll = (): void => {
    const y = heard.scrollY;
    if (Math.abs(y - at) < 1 || y < low || y > high) return;
    if (again >= ASK_AGAIN_MAX) return end();
    again += 1;
    heard.scrollTo(0, at);
  };
  const tick = (): void => {
    left -= 1;
    if (left > 0) frame = heard.requestAnimationFrame(tick);
    else end();
  };
  heard.addEventListener("scroll", onScroll, { passive: true });
  for (const kind of ASKING_ENDS) heard.addEventListener(kind, end, { capture: true, passive: true });
  frame = heard.requestAnimationFrame(tick);
  asking = end;
}

/** The window asked for a top (its own `scrollTo`), and heard after (windowAsked). A box of its own is set as before. */
export function windowTo(top: number, win: AskedWindow & Pick<Window, "scrollTo"> = window): void {
  const at = Math.max(0, top);
  const from = win.scrollY;
  win.scrollTo(0, at);
  windowAsked(at, from, win);
}
