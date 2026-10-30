/**
 * Until a condition holds: the one wait a test makes for work it cannot await. It looks a turn of the loop at a time for
 * as long as `ms` allows, and says what never came if it does not.
 *
 * A count of turns is no wait. An import() goes through tsx's loader, off the main thread, and takes anything from one
 * turn to some hundreds, more on a busy machine; every write the bridge makes reads its refresh map that way. Two page
 * tests that counted turns failed so on 29 Oct 2026 beside a second run of the suite.
 *
 * The turn is setImmediate's: a page test whose window is globalThis may stub setTimeout out (inbox-place.test.mjs does).
 */
import assert from "node:assert/strict";

export const until = async (cond, what, ms = 5000) => {
  for (const from = Date.now(); !cond() && Date.now() - from < ms;) await new Promise((r) => setImmediate(r));
  assert.ok(cond(), `never: ${what}`);
};
