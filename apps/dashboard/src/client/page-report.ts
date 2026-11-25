/**
 * The browser's one report seam (decision 0151): every line the dashboard's browser code writes about something that went
 * wrong, or that a person debugging would look for, goes through here, and only this module writes to the console.
 *
 * The server and the packages write through the logger (`packages/log`), one JSON line of a closed set of names, which a
 * query can read. A page's lines stay in the browser's console as they always did, said the same way: a name or a sentence,
 * then what it is about. What changed is that there is one place they leave from, so the day they are sent on (the error
 * beacon's way, client-error.ts) is a change to this module and none of its callers. The console-calls measure counts every
 * other call (`tests/repo/rules/_rules.mjs` CONSOLE_SINKS names this one).
 */
export const pageReport = {
  /** Something went wrong and the page went on: a read that failed, a part that threw. */
  error: (...line: unknown[]): void => console.error(...line),
  /** Something to look at that broke nothing: a door not there, a sign-in refused, a cache too big to keep. */
  warn: (...line: unknown[]): void => console.warn(...line),
};
