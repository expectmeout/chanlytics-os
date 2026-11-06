/**
 * What a time looks like on a phone's first screen, for the tests that hold every one to its mark (kit/says-when.ts; decision
 * 0101): a browser's walk of a kept copy (first-rows.spec.ts), and a node walk of the rows drawn over states the workspace lacks
 * (tests/shell/views/_unmarked-times.mjs). No product code reads it: a component says it says a time, and these
 * catch one that forgot.
 */

/** "2h", "3 days", "2h ago", "5:51 PM", "tomorrow", "Friday", "Nov 5". */
export const SAYS_A_TIME =
  /\b\d+\s?(?:s|m|h|d|w|mo|y)\b|\b\d+\s(?:sec|secs|min|mins|minutes?|hours?|hrs?|days?|weeks?|months?|years?)\b|\bago\b|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:today|tomorrow|yesterday|tonight)\b|\b(?:mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)(?:day)?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i;

/**
 * Where such words are a name, an act or a person's own, and no time the app is claiming: a heading and a press say what a thing
 * is ("Today so far", "Not today"), the tab bar names a place, and a person's own words are theirs. By tag and class alone, which
 * the node walk and the browser's read the same.
 */
export const NOT_A_TIME = {
  tags: ["button", "h1", "h2", "h3"],
  classes: [
    "btn",
    "tab-bar",
    "ix-thread-who",
    "ix-thread-trail",
    "ix-thread-preview",
    "list-row-name",
    "list-row-said",
    "cl-attn-who",
    "quoted",
  ],
} as const;

/** The same, as a selector, for a browser's `closest`. */
export const notATimeSelector = (): string => [...NOT_A_TIME.tags, ...NOT_A_TIME.classes.map((c) => `.${c}`)].join(",");
