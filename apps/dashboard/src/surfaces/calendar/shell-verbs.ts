/**
 * The few more things the Calendar asks of the shell (decision 0015), beside legacy-verbs.ts: each is one function that
 * calls the window's own where it is, typed, and does what the JSX did where it is not. A surface never reads the
 * window itself; it imports these. Each is a line to delete on the day its owner moves: the touch list with the frame's
 * components. People's rows, the deal sheet's globals and the routes it once spelled by hand went with the visit's own
 * facts (contracts calendar-person-facts.ts) and the record's addresses (addressOf).
 */
import type { StayingPage, SwipeHandlers } from "../legacy-verbs";

/** Run a change so it is drawn at once (React's flushSync, which the shell publishes with its React), else just run it. */
export function flushChange(change: () => void): void {
  const flush = window.ReactDOM?.flushSync;
  if (flush) flush(change);
  else change();
}

/**
 * A thumb's gestures for the Calendar's days, a page that stays (kit/motion/swipe.ts StayingPage: the same element shows
 * the next days, so the swipe turns it in place after `go`): none where the shell has none.
 */
export function touchSwipeStaying(options: {
  pages: (el: Element, from: EventTarget | null) => StayingPage | null;
  when: () => boolean;
}): SwipeHandlers {
  return window.touchSwipe ? window.touchSwipe(options) : {};
}
