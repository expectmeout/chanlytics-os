/**
 * What scrolls a thread's conversation, and where on the screen it shows (21 Oct 2026). On a desk the pane's own scroller
 * (.ix-th-scroll) holds it. On a phone the window scrolls it, as every page there is scrolled (mobile.css, "The window
 * scrolls"): Safari 26 draws its toolbar as glass over the page, and tucks it away, for the document's own scroll alone,
 * and a thread held still in a box of its own stood on a flat band under the toolbar at its full size (Ruben, 21 Oct 2026:
 * the Inbox floated under the glass, the thread did not). There the thread's head sticks under the frame's top and its foot
 * (what it needs from you, the reply box) stands over the screen's foot, so what shows of the conversation is between them.
 */
import { isDocumentScroller, scrollerOf } from "../../kit/motion/page-scroll";

/** The box that scrolls the conversation `el` (the pane's .ix-th-scroll): itself on a desk, the document's on a phone. */
export const threadScroller = (el: Element): HTMLElement => scrollerOf(el, { self: true });

/**
 * Where the conversation `el` shows on the screen, top and bottom: its box's own edges where the box scrolls itself; where
 * the window scrolls it, the window's, under the thread's head and over its foot, which stand over it there.
 */
export function threadShown(el: Element, box: HTMLElement): { top: number; bottom: number } {
  if (!isDocumentScroller(box)) {
    const r = box.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  }
  const pane = el.closest(".ix-thread-pane");
  const head = pane?.querySelector(":scope > .ix-th-head") ?? null;
  const foot = pane?.querySelector(":scope > .ix-th-foot") ?? null;
  const top = head ? head.getBoundingClientRect().bottom : 0;
  const bottom = foot && foot.getClientRects().length > 0 ? foot.getBoundingClientRect().top : window.innerHeight;
  return { top, bottom: Math.max(top, bottom) };
}
