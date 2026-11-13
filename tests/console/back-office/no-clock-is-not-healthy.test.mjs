/**
 * No clock at all is not healthy (contracts platformHealthOf, the judgement the Console's card and the edge's
 * /api/health share). Until 13 Nov 2026 a read with no clock and nothing waiting was `ok`, held in back-office.test.mjs as
 * "genuinely quiet". Every clock is registered by a migration, so a read with none is a registry that came back empty,
 * or a read that failed and was handed on as no rows, which the Console's own getPlatformHealth does so that neither of
 * its reads is fatal to the page: nothing is known to be running, and that is not all clear.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { platformHealthOf, platformHealthWords } from "@chanlytics/contracts";
import { getPlatformHealth } from "../../../apps/dashboard/src/server/console/platform.ts";

const NOW = new Date("2026-09-12T12:00:00.000Z");
const clock = (sweep, healthy) => ({
  sweep,
  healthy,
  detail: null,
  last_request_at: null,
  status_code: null,
  scheduled: true,
  alerted_at: null,
});

test("REGRESSION: no clock at all is not healthy -- an empty registry with nothing waiting read as all clear", () => {
  for (const rows of [[], null, undefined]) {
    const none = platformHealthOf(rows, 0, NOW);
    assert.equal(none.ok, false);
    assert.equal(none.clocks, 0);
    assert.deepEqual(none.unhealthy, []);
    assert.equal(platformHealthWords(none), "No clock is on record, so nothing here is known to be running.");
  }
  const one = platformHealthOf([clock("calendar", true)], 0, NOW);
  assert.deepEqual([one.ok, one.clocks], [true, 1]);
  assert.equal(platformHealthWords(one), "Every clock is running and nothing is waiting.");
  // What was already said stays said: an unhealthy clock by its count, an unread backlog as unread.
  assert.equal(platformHealthWords(platformHealthOf([clock("calendar", false)], 0, NOW)), "1 clock not running");
  assert.equal(
    platformHealthWords(platformHealthOf([], null, NOW)),
    "The platform's health could not be read just now.",
  );
});

test("REGRESSION: the Console's own read -- clocks that could not be read, beside a backlog that could and is zero, is not all clear", async () => {
  // With the backlog read and zero, that was "Every clock is running and nothing is waiting", said of clocks nobody
  // had read.
  const db = {
    rpc: async (name) =>
      name === "sweep_health"
        ? { data: null, error: { message: "permission denied for schema cron" } }
        : { data: 0, error: null },
  };
  const health = await getPlatformHealth({ db }, NOW);
  assert.equal(health.ok, false);
  assert.equal(platformHealthWords(health), "No clock is on record, so nothing here is known to be running.");
});
