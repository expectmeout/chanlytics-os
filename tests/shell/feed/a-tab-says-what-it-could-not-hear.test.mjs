/**
 * What a tab could not hear or read is said beside its page speed (legacy-bridge/hearing/freshness.ts; the page-open PRD of
 * 3 Nov 2026, L7; 00509): how long its feed was down, how many times it came back, and each surface's failed reads under
 * the surface's name as a page's part. Only what happened, counts and durations, and forgotten once said.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PageVitalReport } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { noteFeed, noteReadFailed, freshnessReports } = await importSrc(
  "apps/dashboard/src/legacy-bridge/hearing/freshness.ts",
);

test("a tab that heard and read everything says nothing", () => {
  assert.deepEqual(freshnessReports(1_000), []);
});

test("the feed's time down, its returns and each surface's failed reads, said once, each a report the beacon takes", () => {
  noteFeed(true, 1_000);
  noteFeed(true, 2_000);
  noteFeed(false, 31_000);
  noteFeed(true, 40_000);
  noteFeed(false, 45_000);
  noteReadFailed("reports_headline");
  noteReadFailed("reports_headline");
  noteReadFailed("inbox");
  const said = freshnessReports(50_000);
  assert.deepEqual(said, [
    { name: "FEED_DOWN", value: 35_000 },
    { name: "FEED_BACK", value: 2 },
    { name: "READ_FAILED", value: 2, part: "reports-headline" },
    { name: "READ_FAILED", value: 1, part: "inbox" },
  ]);
  for (const r of said)
    assert.ok(
      PageVitalReport.safeParse({ id: "f1-1", page: "today", ...r }).success,
      `${r.name} is a report the table keeps`,
    );
  assert.deepEqual(freshnessReports(60_000), [], "said once, then forgotten");
});

test("a feed still down when the page is put away is said to then, and goes on counting from there", () => {
  noteFeed(true, 100_000);
  assert.deepEqual(freshnessReports(130_000), [{ name: "FEED_DOWN", value: 30_000 }]);
  noteFeed(false, 140_000);
  assert.deepEqual(freshnessReports(150_000), [
    { name: "FEED_DOWN", value: 10_000 },
    { name: "FEED_BACK", value: 1 },
  ]);
});
