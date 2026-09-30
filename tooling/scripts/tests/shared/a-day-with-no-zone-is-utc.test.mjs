/**
 * The day Ask's quick answer reads from "today" and "tomorrow" is the workspace's, and with no zone (or one Intl cannot
 * use) it is the UTC day, never the machine's. The edge runs in UTC, so nothing changes there; a machine twelve hours
 * east said the day after the one UTC says, and `ask-tool-names.test.mjs` failed under Pacific/Auckland on 29 Sep 2026.
 *
 * This file runs twelve hours east on purpose, and sets the zone before contracts is imported, since a formatter
 * built at import keeps the zone it was built in.
 */
process.env.TZ = "Pacific/Auckland";
const { test } = await import("node:test");
const assert = (await import("node:assert/strict")).default;
const { dayFromQuestion } = await import("@chanlytics/contracts");

test("the machine is twelve hours east: without that, nothing below could fail", () => {
  assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, "Pacific/Auckland");
  // 12:00 UTC on 7 March is 01:00 on the 8th in Auckland (NZDT, UTC+13).
  assert.equal(new Date("2026-03-07T12:00:00Z").getDate(), 8);
});

test("Ask's quick answer with no zone reads today and tomorrow in UTC, as it does for a zone it cannot use", () => {
  const noon = Date.parse("2026-03-07T12:00:00Z");
  for (const zone of [null, undefined, "Mars/Olympus"]) {
    assert.equal(dayFromQuestion("what's open today?", noon, zone), "2026-03-07", String(zone));
    assert.equal(dayFromQuestion("what's open tomorrow?", noon, zone), "2026-03-08", String(zone));
  }
  // and a zone it can use is the workspace's, wherever the machine is
  assert.equal(dayFromQuestion("what's open today?", noon, "Pacific/Auckland"), "2026-03-08");
  assert.equal(dayFromQuestion("what's open today?", noon, "America/Chicago"), "2026-03-07");
});
