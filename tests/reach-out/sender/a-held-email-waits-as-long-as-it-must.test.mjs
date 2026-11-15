/**
 * How long a held send waits before it is planned again (apps/edge/lib/campaigns/reach-out/sender/lanes.ts claimedTurns
 * hold). A hold its owner must mend (no address, no subject, no name to sign with) waits an hour: nothing changes in a
 * minute. A send held for its lead's own receptionist (decision 0079: preview_building) waits for a build that takes
 * about half a minute, so with the switch on it is planned again a few minutes on (PREVIEW_HOLD_MS), not an hour: the
 * review of 12 November 2026 found every email that carries the link going an hour late, or the next morning. With the
 * switch off nothing is being made, and it waits the hour as any hold does.
 *
 * What the tick's end then does with each list is the database suites' (reach-out-sender.db.test.mjs).
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeLog } from "../../_fake-db.mjs";
import { at } from "../../_cron-doors-world.mjs";

const { claimedTurns, HOLD_MS, PREVIEW_HOLD_MS } = await import(
  at("apps/edge/lib/campaigns/reach-out/sender/lanes.ts")
);

const SEND = {
  id: "5e000000-0000-4000-8000-000000000001",
  tenant_id: "a0000000-0000-4000-8000-000000000001",
  step_id: "s1",
};
const tickOf = () => ({
  db: null,
  now: new Date("2026-11-15T15:00:00Z"),
  lane: null,
  log: fakeLog(),
  reads: null,
  replan: [],
  later: [],
  soon: [],
  said: new Set(),
  capped: new Set(),
  cappedSends: new Set(),
});
const was = process.env.LEAD_PREVIEWS;
afterEach(() => {
  if (was === undefined) delete process.env.LEAD_PREVIEWS;
  else process.env.LEAD_PREVIEWS = was;
});

test("a send held for a receptionist being made is planned again in minutes, not an hour", () => {
  process.env.LEAD_PREVIEWS = "on";
  const tick = tickOf();
  assert.equal(claimedTurns(tick, SEND).hold("preview_building"), "held");
  assert.deepEqual([tick.soon.length, tick.later.length], [1, 0]);
  assert.equal(tick.soon[0].send, SEND);
  assert.ok(PREVIEW_HOLD_MS >= 2 * 60_000, "long enough for a build of half a minute and its first retry");
  assert.ok(PREVIEW_HOLD_MS <= 5 * 60_000 && PREVIEW_HOLD_MS < HOLD_MS, "and far short of the hour");
});

test("a hold its owner must mend still waits the hour", () => {
  process.env.LEAD_PREVIEWS = "on";
  for (const reason of ["no_business_address", "no_subject", "no_signed_by", "no_booking_link", "unknown_slot"]) {
    const tick = tickOf();
    claimedTurns(tick, SEND).hold(reason);
    assert.deepEqual([tick.soon.length, tick.later.length], [0, 1], reason);
  }
});

test("with the switch off nothing is being made: the send waits the hour, as any hold", () => {
  delete process.env.LEAD_PREVIEWS;
  const tick = tickOf();
  claimedTurns(tick, SEND).hold("preview_building");
  assert.deepEqual([tick.soon.length, tick.later.length], [0, 1]);
});
