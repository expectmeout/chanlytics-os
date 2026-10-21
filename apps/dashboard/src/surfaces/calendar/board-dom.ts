/**
 * What the board asks of the browser (moved from legacy/pages/calendar.jsx, decision 0015): whether the screen is a phone's,
 * what scrolls the board and how much room it has, and whether a field has the keys. The date picker is the kit's
 * (kit/datepicker), not the browser's.
 */
import { isDocumentScroller, scrollerOf } from "../kit/motion/page-scroll";

/** A phone opens on the agenda: a week grid is four times a phone's width. */
export const crPhone = (): boolean => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);

/**
 * Whether the window scrolls the board's box (a phone, mobile.css "The window scrolls": Safari floats its glass toolbar over
 * the document's own scroll alone), rather than the box itself (a desk).
 */
export const windowScrollsBoard = (box: Element): boolean => isDocumentScroller(scrollerOf(box, { self: true }));

/**
 * How tall the board's box may be where the window scrolls it: from its top in the page to the foot of what the window
 * shows now, so a day that fits stands on one screen. The box is as tall as what it holds there, so its own height is
 * no room to fit to.
 */
export const boardRoomInWindow = (box: Element): number =>
  window.innerHeight - (box.getBoundingClientRect().top + window.scrollY);

/** Whether a field has the keys: the board's arrows and T are not the board's while a person is typing. */
export const crTyping = (): boolean => {
  const el = document.activeElement;
  return (
    !!el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      (el as HTMLElement).isContentEditable)
  );
};
