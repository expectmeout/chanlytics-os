/**
 * What a call event decides, apart from the wire (planCallEvent, apps/edge/lib/voice/call-event.ts), for the three
 * things decision 0092 added:
 *   - a customer's call that never connected leaves a line in their thread as it ends ("Missed call"), so the text
 *     receptionist and the next call know they rang; the receptionist's own unanswered dial does not;
 *   - a call that ended the platform's way (the provider's credit, our inbound webhook, a provider's error) pages the
 *     platform, and an ordinary ending pages nobody;
 *   - a spoken price's correction names the call's own row, whose claim (guard_corrected_at) holds it to once a call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MISSED_CALL_LINE, callSummaryLine, normalizeCall } from "@chanlytics/channels";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { planCallEvent } = await import(at("apps/edge/lib/voice/call-event.ts"));

const NOW = Date.now();
const CALLER = "+16465550123";
const LINE = "+13055550100";

const call = (over = {}) => ({
  call_id: "call_plan_1",
  agent_id: "agent_plan",
  direction: "inbound",
  from_number: CALLER,
  to_number: LINE,
  start_timestamp: NOW - 40_000,
  end_timestamp: NOW - 30_000,
  ...over,
});

const ingest = (over = {}) => ({
  call_id: "row-1",
  is_new: false,
  skipped: false,
  recording_state: null,
  recording_attempts: null,
  contact_id: "contact-1",
  conversation_id: "conv-1",
  ...over,
});

const plan = (event, c, facts = {}) =>
  planCallEvent(
    { event, call: c, n: normalizeCall(c), bodyKeys: [], callKeys: [] },
    { ingest: ingest(), alreadyCorrected: false, canCorrect: true, allowed: null, ...facts },
  );

test("a customer's call that never connected leaves its line in the thread as it ends, and is told once", () => {
  const p = plan(
    "call_ended",
    call({ call_status: "not_connected", duration_ms: 0, disconnection_reason: "dial_no_answer" }),
  );
  const note = p.steps.find((s) => s.kind === "note");
  assert.ok(note, "a line in the thread");
  assert.equal(note.body, MISSED_CALL_LINE);
  assert.equal(note.externalId, "call:call_plan_1", "keyed on the call, so a replay meets the same row");
  assert.ok(
    p.steps.some((s) => s.kind === "claim_notification"),
    "told once, by the claim",
  );
});

test("the receptionist's own dial nobody answered leaves no missed call in the customer's thread", () => {
  const p = plan(
    "call_ended",
    call({
      direction: "outbound",
      call_status: "not_connected",
      duration_ms: 0,
      disconnection_reason: "dial_no_answer",
    }),
  );
  assert.equal(
    p.steps.some((s) => s.kind === "note"),
    false,
  );
});

test("the sweep's line for a missed call says the same words the webhook's does", () => {
  assert.equal(
    callSummaryLine({
      direction: "inbound",
      status: "not_connected",
      durationMs: null,
      summary: null,
      inVoicemail: null,
      analysis: null,
    }),
    MISSED_CALL_LINE,
  );
  assert.match(
    callSummaryLine({
      direction: "inbound",
      status: "ended",
      durationMs: 120_000,
      summary: "Asked about Saturday.",
      inVoicemail: null,
      analysis: null,
    }),
    /^Inbound call · 2 min — Asked about Saturday\./,
  );
});

test("a call that ended the platform's way pages the platform; an ordinary ending, and a stale delivery, page nobody", () => {
  const credit = plan(
    "call_ended",
    call({ call_status: "ended", disconnection_reason: "credit_exhausted", duration_ms: 2000 }),
  );
  const page = credit.steps.find((s) => s.kind === "page_platform");
  assert.ok(page, "paged");
  assert.equal(page.reason, "credit_exhausted");
  assert.match(page.mend, /credit/);
  const hangup = plan(
    "call_ended",
    call({ call_status: "ended", disconnection_reason: "user_hangup", duration_ms: 60_000 }),
  );
  assert.equal(
    hangup.steps.some((s) => s.kind === "page_platform"),
    false,
  );
  const stale = planCallEvent(
    {
      event: "call_ended",
      call: call({ call_status: "ended", disconnection_reason: "error_retell" }),
      n: normalizeCall(call({ call_status: "ended", disconnection_reason: "error_retell" })),
      bodyKeys: [],
      callKeys: [],
    },
    { ingest: ingest({ skipped: true }), alreadyCorrected: false, canCorrect: true, allowed: null },
  );
  assert.equal(
    stale.steps.some((s) => s.kind === "page_platform"),
    false,
    "an event older than the row says nothing about the call now",
  );
});

test("a price said aloud on a live call is corrected through the call's own row, which the claim holds to once", () => {
  const live = call({
    call_status: "ongoing",
    transcript_object: [
      { role: "user", content: "How much is a haircut?" },
      { role: "agent", content: "A haircut is $45." },
    ],
  });
  const p = plan("transcript_updated", live);
  const correct = p.steps.find((s) => s.kind === "correct_live_call");
  assert.ok(correct, "corrected while the call is live");
  assert.equal(correct.callId, "row-1", "the row whose guard_corrected_at is claimed");
});
