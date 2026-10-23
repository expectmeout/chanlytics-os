/**
 * The box that scrolls (moved from legacy/pages/people.jsx ldScroller, decision 0015): on a desktop the table's own
 * (pl-table-scroll), else the pane itself, and on a phone, where the window scrolls the page (mobile.css, "The window
 * scrolls"), the document's scroller.
 */
import {
  documentScroller,
  inHeldList,
  isDocumentScroller,
  rowsBeginAt,
  scrollsItself,
} from "../../kit/motion/page-scroll";

export const ldScroller = (pane: HTMLElement | null): HTMLElement | null => {
  if (!pane) return null;
  // A stand-in page in a test has no styles to ask: its pane is what scrolls, as it was.
  const styled = typeof window !== "undefined" && typeof window.getComputedStyle === "function";
  // The table's box only where it scrolls itself (a desktop's): on a phone it is as tall as its cards, and a pixel's
  // rounding past its height took the place put back on Back, which then went nowhere.
  const inner = pane.querySelector?.<HTMLElement>(".pl-table-scroll");
  if (inner && inner.scrollHeight > inner.clientHeight && (!styled || scrollsItself(inner))) return inner;
  return !styled || scrollsItself(pane) ? pane : documentScroller();
};

/**
 * Hear the list scroll, and only the list (ldScroller): on the pane in the capture phase, since a scroll does not bubble
 * and on a desktop the box that scrolls is the table's, inside it; and on the window, which scrolls it on a phone. A menu
 * scrolling inside the pane is not the list moving. Answers how to stop hearing it.
 */
export function heardListScroll(pane: HTMLElement, heard: (scroller: HTMLElement) => void): () => void {
  const onPane = (e: Event) => {
    const sc = ldScroller(pane);
    if (sc && e && e.target === sc) heard(sc);
  };
  // The window is every view's: a view on its way out (taken off the page, or its still copy while it leaves, kit
  // motion/view-deck.ts) hears the next one's scroll to its top, and that is no scroll of its list; nor is one held under
  // a person's page (kit motion/held-list.ts), whose scroll the window is then.
  const onWindow = () => {
    if (!pane.isConnected || pane.closest(".view-leaving") || inHeldList(pane)) return;
    const sc = ldScroller(pane);
    if (sc && isDocumentScroller(sc)) heard(sc);
  };
  // A stand-in page in a test may have no window to hear.
  const page = typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null;
  pane.addEventListener("scroll", onPane, { passive: true, capture: true });
  if (page) page.addEventListener("scroll", onWindow, { passive: true });
  return () => {
    pane.removeEventListener("scroll", onPane, { capture: true });
    if (page) page.removeEventListener("scroll", onWindow);
  };
}

/**
 * A list's scroll as its place keeps it and puts it back. One that never reached its rows (the first row drawn in the
 * pane, kit/motion/page-scroll.ts rowsBeginAt) is the list's top: a thumb's short swipe that tucks Safari's toolbar, a
 * landing pushed down by a line in the frame's top, each left the list a little down, and every arrival and refresh after
 * put it back so, with the page's controls and search under the frame's top (Ruben, 22 Oct 2026). A list scrolled into its
 * rows keeps the scroll. A pane out of sight draws no row, and its scroll is kept as it is.
 */
export function keptTop(pane: HTMLElement, sc: HTMLElement, top: number): number {
  if (top <= 0) return top;
  const rows = rowsBeginAt(pane, sc);
  return rows !== null && top < rows ? 0 : top;
}
