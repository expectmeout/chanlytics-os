/**
 * A connection's verb is one its page runs: what Settings › Connections' rows offer (the page's model,
 * surfaces/settings/connections/model/setup.ts) is answered by the page that draws them (pane.tsx), its case or its table
 * of verbs run in one step. A verb is a string on one side and a switch case on the other with no type between them,
 * and this rule stands in for that type, so it is the repository's: read over the two modules' source. Moved here from
 * connections/connections.test.mjs on 26 Nov 2026 (lane 4, area c). The sole-proprietor OTP row once offered
 * `verb:resend-otp`, which no page handled, on the one row where a person is against a 24-hour clock.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCode, readRaw } from "../../_source.mjs";

test("every verb a row can offer is a verb the page runs", () => {
  // A button that does nothing is worse than no button, and this is where one
  // shipped: the sole-proprietor OTP row offered "Send it again" pointing at
  // `verb:resend-otp`, which no page ever handled. The click did nothing at
  // all, on the one row in this product where a person is against a 24-hour
  // clock -- and nothing failed, because a verb is a string on one side and a
  // switch case on the other with no type between them.
  //
  // This is that missing type. Anything the contract can put on a row has to be
  // answered by the page that renders it, or by a route the shell knows.
  const rows = readRaw("apps/dashboard/src/surfaces/settings/connections/model/setup.ts");
  const offered = [...rows.matchAll(/to:\s*"verb:([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(offered.length >= 5, "the verbs were found at all");
  const page = readCode("apps/dashboard/src/surfaces/settings/connections/pane.tsx");
  // A verb is run by its case, or by the table of verbs run in one step (pane.tsx ONE_STEP_VERBS).
  const handled = [
    ...[...page.matchAll(/case\s*"verb:([a-z-]+)":/g)].map((m) => m[1]),
    ...[...page.matchAll(/"verb:([a-z-]+)":\s*(?:\(\)\s*=>|armDisconnect)/g)].map((m) => m[1]),
  ];
  for (const v of new Set(offered)) {
    assert.ok(handled.includes(v), `verb:${v} is offered by a row and handled by nobody`);
  }
  assert.ok(!offered.includes("resend-otp"), "REGRESSION: the OTP row promised a resend this product cannot yet make");
});
