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

const hook = readCode("apps/edge/api/retell-webhook.ts");

test("a payload without call_status normalises to ended — which is why a transcript update is pinned to ongoing first", () => {
  const n = normalizeCall({ call_id: "call_x", transcript_with_tool_calls: [{ role: "user", content: "hi" }] });
  assert.equal(n.status, "ended", "the default the guard exists for");
  assert.equal(n.transcriptObject?.length, 1, "the turns are read from transcript_with_tool_calls");
  assert.ok(hook.includes('if (event === "transcript_updated" && !call.call_status) call.call_status = "ongoing";'));
  assert.ok(hook.indexOf('call.call_status = "ongoing"') < hook.indexOf("const n = normalizeCall(call);"), "pinned BEFORE normalising");
});

test("a delivery without an agent id is routed through the call's own row, not dropped before ingest", () => {
  assert.ok(hook.includes("async function routeByKnownCall("));
  assert.ok(hook.includes('const routed = n.agentId ? await resolveChannel(db, "voice", n.agentId) : await routeByKnownCall(db, n.retellCallId);'));
  assert.ok(!hook.includes("if (db && n.agentId) {"), "REGRESSION: a per-turn payload without agent_id was skipped in silence");
});

test("every ingested delivery leaves a row with what it carried and what the ingest did", () => {
  assert.ok(hook.includes('emitEvent(db, tenantId, "webhook.delivery", "ingest", callId ? "call" : null, callId, { provider: "retell", ...data })'));
  for (const field of ["event: event ?? null", "call_status: call.call_status ?? null", "status: n.status", "turns: n.transcriptObject?.length ?? null", "tool_turns: call.transcript_with_tool_calls?.length ?? null", "skipped: !!res.skipped"]) {
    assert.ok(hook.includes(field), field);
  }
  assert.ok(!/recordDelivery\([^)]*content/.test(hook), "counts and flags only, never the words");
  const diag = readCode("apps/edge/api/diag.ts");
  assert.ok(diag.includes('.eq("kind", "webhook.delivery")'), "readable from /api/diag");
});
