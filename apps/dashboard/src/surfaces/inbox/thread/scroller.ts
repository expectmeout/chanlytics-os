/**
 * What scrolls a thread's conversation, and where on the screen it shows (21 Oct 2026). The pane's own scroller
 * (.ix-th-scroll) holds it, on a desk and on a phone alike. From 21 Oct to 3 Nov 2026 the window scrolled it on a phone,
 * as every other page there is scrolled (mobile.css, "The window scrolls"), with the thread's head stuck under the frame's
 * top and its foot over the screen's foot; since then a phone's thread is a screen of its own, its foot on the screen's
 * bottom edge and on the keys (Ruben's recording, 3 Nov 2026: the foot floated at a thread's end, and the scroll to the
 * end undid the keyboard's lift). What scrolls it is asked, never assumed, so the window's case is still answered.
 */
import { isDocumentScroller, scrollerOf, shownHeight } from "../../kit/motion/page-scroll";

/** The box that scrolls the conversation `el` (the pane's .ix-th-scroll): itself, or the document's where it does not. */
export const threadScroller = (el: Element): HTMLElement => scrollerOf(el, { self: true });

/**
 * How far `box` scrolls at most: the conversation's end, where its newest message shows. Asked for its whole height
 * instead, an iPhone's Safari took the window that far past the page's end for three or four frames before it drew it
 * back, and the frame's top, the tab bar and the thread's foot, all of them fixed to the screen, jumped up the screen and
 * down again as a thread opened (Ruben's iPhone, 23 Oct 2026: 800 of a page that scrolls 40). Chrome stops at the end.
 */
export const threadEnd = (box: HTMLElement): number => Math.max(0, box.scrollHeight - shownHeight(box));

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
