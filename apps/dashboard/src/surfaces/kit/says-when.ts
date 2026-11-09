/**
 * The mark an element wears where it says a time or a day, spread on it: `<span {...SAYS_WHEN}>`. A copy of a phone's screen is
 * the frame's own elements cloned (surfaces/frame/first-rows.ts, decision 0101), so it keeps the mark, and once some minutes old
 * it leaves what is marked as its room (outline.css), since "2h" may be 22 by now. A person's own words are theirs and wear none.
 * tests/shell/views/a-time-says-so.test.mjs and e2e/shell/first-rows.spec.ts fail a time that does not wear it.
 */
import { FIRST_ROWS_WHEN_ATTR } from "@chanlytics/contracts";

export const SAYS_WHEN = { [FIRST_ROWS_WHEN_ATTR]: "" } as const;
