// Run by shared/the-suite-runs-in-one-zone.test.mjs at two clocks twelve hours apart: a test that holds only in the
// evening in New York, as #2285's playbooks test did (13 Nov 2026). From 20:00 there a playbook's run stops waiting for
// WhatsApp's answer (contracts inLastSendingHour), and that test expected the evening's answer at any hour. CI ran it at
// 23:11 in New York, and it was red on main the other twenty hours of every day. Not a *.test.mjs, so the suite itself
// never globs it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inLastSendingHour } from "@chanlytics/contracts";

test("written in the evening, in New York", () => {
  assert.equal(inLastSendingHour("America/New_York", new Date()), true);
});
