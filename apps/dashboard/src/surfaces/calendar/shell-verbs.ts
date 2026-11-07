/**
 * The one more thing the Calendar asks of the shell (decision 0015), beside frame-verbs.ts: a function that calls the
 * window's own where it is, typed, and does what the JSX did where it is not. A surface never reads the window itself; it
 * imports this. People's rows, the deal sheet's globals and the routes it once spelled by hand went with the visit's own
 * facts (contracts calendar-person-facts.ts) and the record's addresses (addressOf), and the days' swipe is the kit's own
 * (frame-verbs.ts touchSwipe).
 */

/** Run a change so it is drawn at once (React's flushSync, which the shell publishes with its React), else just run it. */
export function flushChange(change: () => void): void {
  const flush = window.ReactDOM?.flushSync;
  if (flush) flush(change);
  else change();
}
