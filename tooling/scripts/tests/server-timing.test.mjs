/**
 * Every /api/v1 answer says how long its session check and its handler took (server/server-timing.ts, with-route.ts;
 * 25 Sep 2026): a Server-Timing header the browser's timing panel and field data read. Measured on production, a
 * person's read took 773 ms alone and 3,236 among the boot's, and nothing on the wire said where the time went.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "./_source.mjs";

const { serverTimingHeader } = await importSrc("apps/dashboard/src/server/server-timing.ts");

test("one part per name, in the order given, whole milliseconds, never below zero", () => {
  assert.equal(serverTimingHeader({ auth: 12.4, app: 310.6 }), "auth;dur=12, app;dur=311");
  assert.equal(serverTimingHeader({ app: -3 }), "app;dur=0", "a clock that went backwards says nothing false");
  assert.equal(serverTimingHeader({ app: Number.NaN }), "app;dur=0");
  assert.equal(serverTimingHeader({}), "");
});
