/**
 * What scrolls a page, and where to hear it scroll.
 *
 * On a desk the frame is one box the height of the window, and a page scrolls inside it: the frame's `main`, or the list
 * a page of panes scrolls in. On a phone the window scrolls (mobile.css, "The window scrolls"): Safari draws its
 * toolbar as glass over the page and tucks it away as the page moves, and it does both only for the document's own
 * scroll, never for a box inside it. So there a page's list is as tall as what it holds, and what reads or moves a
 * page's scroll reads and moves the document's. A page that holds still on a phone (the Calendar's board, an open
 * thread, Live's cockpit) keeps its own scroller, and is found as one.
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

/** How tall the screen a box shows is: the window's for the document's scroller (its clientHeight is the window's too). */
export function shownHeight(box: Element): number {
  return isDocumentScroller(box) ? document.documentElement.clientHeight : box.clientHeight;
}

/** Where `el` stands from the top of what `box` scrolls, in pixels: its offset in the box's content. */
export function offsetIn(box: Element, el: Element): number {
  const top = isDocumentScroller(box) ? 0 : box.getBoundingClientRect().top - box.clientTop;
  return el.getBoundingClientRect().top - top + box.scrollTop;
}
