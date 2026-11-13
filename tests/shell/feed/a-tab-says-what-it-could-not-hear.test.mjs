/**
 * What a tab could not hear or read is said beside its page speed (bridge/hearing/freshness.ts; the page-open PRD of
 * 3 Nov 2026, L7; 00509): how long its feed was down, how many times it came back, and each surface's failed reads under
 * the surface's name as a page's part. Only what happened, counts and durations, and forgotten once said.
 *
 * A failed read says why, and whether the tab was hidden when it failed (13 Nov 2026). Ten days of these rows said
 * that nearly half of all tabs had a read fail, across every surface alike, and nothing of why: the reason the client
 * holds (timed out, no connection, told to wait, refused, the read's own code threw) was dropped as it was counted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PageVitalReport } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { noteFeed, noteReadFailed, freshnessReports } = await importSrc(
  "apps/dashboard/src/bridge/hearing/freshness.ts",
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
  noteReadFailed("reports_headline", "timeout", true);
  noteReadFailed("reports_headline", "timeout", true);
  noteReadFailed("reports_headline", "rate_limited", false);
  noteReadFailed("inbox", "network", false);
  const said = freshnessReports(50_000);
  assert.deepEqual(said, [
    { name: "FEED_DOWN", value: 35_000 },
    { name: "FEED_BACK", value: 2 },
    { name: "READ_FAILED", value: 2, part: "reports-headline", detail: { reason: "timeout", hidden: true } },
    { name: "READ_FAILED", value: 1, part: "reports-headline", detail: { reason: "rate-limited", hidden: false } },
    { name: "READ_FAILED", value: 1, part: "inbox", detail: { reason: "network", hidden: false } },
  ]);
  for (const r of said) {
    const kept = PageVitalReport.safeParse({ id: "f1-1", page: "today", ...r });
    assert.ok(kept.success, `${r.name} is a report the table keeps`);
    // What the check lets through is what is sent: a reason it dropped would never reach the table.
    assert.deepEqual(kept.data.detail, r.detail, `${r.name} keeps what it says of itself`);
  }
  assert.deepEqual(freshnessReports(60_000), [], "said once, then forgotten");
});

test("a read that fails says why, and whether the tab was hidden: the refusal's own code, or that the read's code threw", async () => {
  const { ApiError } = await importSrc("apps/dashboard/src/client/api.ts");
  const { activateOverride } = await importSrc("apps/dashboard/src/bridge/surface-data.ts");
  const was = { error: console.error, document: globalThis.document };
  console.error = () => {};
  const read = (key, fail) => activateOverride({ key, reads: [], fresh: "live", apply: fail });
  try {
    globalThis.document = { visibilityState: "hidden" };
    assert.equal(
      await read("calendar", async () => {
        throw new ApiError("timeout", 0, "It took too long.");
      }),
      false,
    );
    globalThis.document = { visibilityState: "visible" };
    assert.equal(
      await read("billing", async () => {
        throw new ApiError("forbidden", 403, "Not yours to read.");
      }),
      false,
    );
    assert.equal(
      await read("people", async () => {
        throw new TypeError("rows is not iterable");
      }),
      false,
    );
    // A session that ended is the sign-out's to say, never a failed read: it was not counted, and is not now.
    await assert.rejects(
      read("today", async () => {
        throw new ApiError("unauthorized", 401, "Sign in required.");
      }),
    );
    assert.deepEqual(freshnessReports(70_000), [
      { name: "READ_FAILED", value: 1, part: "calendar", detail: { reason: "timeout", hidden: true } },
      { name: "READ_FAILED", value: 1, part: "billing", detail: { reason: "forbidden", hidden: false } },
      { name: "READ_FAILED", value: 1, part: "people", detail: { reason: "threw", hidden: false } },
    ]);
  } finally {
    console.error = was.error;
    if (was.document === undefined) delete globalThis.document;
    else globalThis.document = was.document;
  }
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
