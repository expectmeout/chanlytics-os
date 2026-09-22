/**
 * "Live" has to mean live.
 *
 * `calls.status = 'ongoing'` is written from Retell's own call_status and is
 * only ever cleared by a LATER webhook. So one lost `call_ended` — a deploy
 * mid-call, a provider blip, a 500 on our side — leaves that row 'ongoing'
 * permanently, and any surface reading the flag alone shows a call in progress
 * that hung up days ago.
 *
 * A status flag is a claim. isLiveCall wants evidence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isLiveCall, CALL_HEARTBEAT_MS, toCallVM } from "@chanlytics/contracts";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const NOW = new Date("2026-08-29T12:00:00.000Z");
const agoMs = (ms) => new Date(NOW.getTime() - ms).toISOString();

test("a call with a recent heartbeat is live", () => {
  assert.equal(isLiveCall({ status: "ongoing", updated_at: agoMs(30_000) }, NOW), true);
});

test("REGRESSION: an 'ongoing' call nobody has heard from is NOT live", () => {
  // The phantom. Before this, a lost call_ended showed here forever.
  assert.equal(isLiveCall({ status: "ongoing", updated_at: agoMs(CALL_HEARTBEAT_MS + 1000) }, NOW), false);
});

test("a day-old 'ongoing' row is emphatically not live", () => {
  assert.equal(isLiveCall({ status: "ongoing", updated_at: agoMs(86_400_000) }, NOW), false);
});

test("only 'ongoing' can be live, however fresh the row", () => {
  for (const status of ["ended", "registered", "error"]) {
    assert.equal(isLiveCall({ status, updated_at: agoMs(1000) }, NOW), false, `${status} must never render as live`);
  }
});

test("started_at is the fallback when there is no heartbeat", () => {
  // Rows written before every ingest touched updated_at.
  assert.equal(isLiveCall({ status: "ongoing", started_at: agoMs(5000) }, NOW), true);
  assert.equal(isLiveCall({ status: "ongoing", started_at: agoMs(CALL_HEARTBEAT_MS + 1) }, NOW), false);
});

test("a heartbeat outranks the fallback", () => {
  // An old start with a recent turn is a long call still in progress.
  const d = { status: "ongoing", started_at: agoMs(86_400_000), updated_at: agoMs(2000) };
  assert.equal(isLiveCall(d, NOW), true);
});

test("no evidence at all is not live", () => {
  assert.equal(isLiveCall({ status: "ongoing" }, NOW), false);
  assert.equal(isLiveCall({ status: "ongoing", updated_at: null, started_at: null }, NOW), false);
  // A malformed timestamp must not become NaN and silently compare false-y in
  // the wrong direction.
  assert.equal(isLiveCall({ status: "ongoing", updated_at: "not a date" }, NOW), false);
});

test("the viewmodel the Live surface would read uses the rule, not the flag", () => {
  const base = {
    id: "c1",
    retell_call_id: "r1",
    direction: "inbound",
    call_type: "phone_call",
    from_e164: "+13475550101",
    from_raw: null,
    to_e164: "+13085550000",
    started_at: agoMs(60_000),
    ended_at: null,
    duration_ms: null,
    disconnection_reason: null,
    sentiment: null,
    call_successful: null,
    in_voicemail: null,
    summary: null,
    transcript_object: null,
    recording: null,
    conversation_id: null,
    contact_id: null,
    message_id: null,
    contact: null,
  };
  // `live` is a conditional spread — present as true, or absent. The mockup
  // reads it for truthiness, so assert that rather than a literal false.
  assert.equal(toCallVM({ ...base, status: "ongoing", updated_at: agoMs(5_000) }, ZONE, NOW).live, true);
  assert.ok(
    !toCallVM({ ...base, status: "ongoing", updated_at: agoMs(CALL_HEARTBEAT_MS + 5_000) }, ZONE, NOW).live,
    "a stale ongoing row must not reach the UI as live",
  );
  assert.ok(!toCallVM({ ...base, status: "ended", updated_at: agoMs(1_000) }, ZONE, NOW).live);
});
