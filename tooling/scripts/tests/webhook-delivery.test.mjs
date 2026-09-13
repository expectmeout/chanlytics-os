/**
 * What a transcript delivery does, made readable — and two ways it could be a
 * silent no-op, closed.
 *
 * The owner's third real call: eight per-turn deliveries reached the webhook
 * while he talked, and the Live page showed no words. The ingest keeps new
 * turns and realtime repaints (both proved), which leaves the delivery
 * itself: a per-turn payload without call_status normalised to "ended", and
 * one without agent_id never reached the ingest at all. Neither could be
 * seen from here — the outcome lived in a log line. Each delivery now leaves
 * a row saying what it carried and what the ingest did with it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCall } from "@chanlytics/channels";
import { readCode } from "./_source.mjs";

test("a payload without call_status normalises to ended — the default the webhook pins a transcript update away from", () => {
  // The pin itself (ongoing before normalising), the routing through the
  // call's own row, and the delivery row run in retell-webhook-door.test.mjs.
  const n = normalizeCall({ call_id: "call_x", transcript_with_tool_calls: [{ role: "user", content: "hi" }] });
  assert.equal(n.status, "ended", "the default the guard exists for");
  assert.equal(n.transcriptObject?.length, 1, "the turns are read from transcript_with_tool_calls");
});

test("the delivery row is readable from /api/diag", () => {
  const diag = readCode("apps/edge/api/diag.ts");
  assert.ok(diag.includes('.eq("kind", "webhook.delivery")'), "readable from /api/diag");
});
