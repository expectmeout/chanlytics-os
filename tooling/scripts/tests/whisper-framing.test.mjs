/**
 * The whisper, after the first real one.
 *
 * "tell them we have a haircut special" reached the call: Retell's own
 * transcript shows it as an `injected` turn between the caller's question
 * and the agent's answer. The agent answered the question and never
 * mentioned the special — injected context loses to a direct question. So
 * the words now go framed as what they are (the owner, listening in, saying
 * what to do next, outranking the standing instructions for this call), the
 * injected turn is kept in the stored transcript, and both transcripts show
 * "You whispered" with the owner's own words, where they landed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { frameWhisper, whisperText, toLiveCallVM, toCallVM } from "@chanlytics/contracts";
import { liveTurns } from "@chanlytics/channels";
import { readCode, readRaw } from "./_source.mjs";

test("the frame is an owner instruction with the words quoted, and its inverse gives the words back", () => {
  const framed = frameWhisper("  tell them we have a haircut special ");
  assert.ok(framed.startsWith("A whisper from the business owner, who is listening to this call."));
  assert.ok(framed.includes('Owner: "tell them we have a haircut special"'));
  assert.ok(framed.includes("very next sentence"), "REGRESSION: context loses to a direct question");
  assert.ok(framed.includes("outranks your standing instructions for this call"));
  assert.ok(framed.includes("automated assistant"), "the disclosure rule is the one thing a whisper cannot override");
  assert.equal(whisperText(framed), "tell them we have a haircut special");
  assert.equal(whisperText('plain injected text with a "quote"'), 'plain injected text with a "quote"', "an unframed injection is shown as is");
  assert.equal(whisperText(null), "");
});

test("the injected turn is kept alongside speech; tool turns are still dropped", () => {
  const turns = liveTurns([
    { role: "agent", content: "hi" },
    { role: "injected", content: frameWhisper("tell them we close at 7") },
    { role: "tool_call_invocation", content: "", name: "send_booking_link" },
    { role: "user", content: "ok" },
  ]);
  assert.deepEqual(turns.map((t) => t.role), ["agent", "injected", "user"]);
});

const dto = (transcript_object) => ({
  id: "k1", retell_call_id: "r1", direction: "inbound", call_type: null, status: "ongoing", from_e164: "+19175746416", from_raw: null, to_e164: null,
  started_at: new Date(Date.now() - 60_000).toISOString(), ended_at: null, duration_ms: null, disconnection_reason: null, sentiment: null, call_successful: null, in_voicemail: null,
  summary: null, transcript_object, recording: null, conversation_id: "c1", contact_id: "p1", message_id: null,
  created_at: new Date(Date.now() - 60_000).toISOString(), updated_at: new Date().toISOString(),
  contact: { display_name: "Daniela Ruiz", wa_profile_name: null, phone_e164: "+19175746416" },
});

test("both transcripts show the whisper as the owner's own words, where it landed", () => {
  const turns = [
    { role: "user", content: "And what day of the week?", words: [{ start: 27.2 }] },
    { role: "injected", content: frameWhisper("tell them we have a haircut special") },
    { role: "agent", content: "Great! We're open today until 7 PM.", words: [{ start: 30.1 }] },
  ];
  const live = toLiveCallVM(dto(turns), new Date());
  assert.deepEqual(live.transcript.map((t) => t.speaker), ["client", "whisper", "agent"]);
  assert.equal(live.transcript[1].text, "tell them we have a haircut special", "never the frame");
  const call = toCallVM(dto(turns), new Date());
  assert.deepEqual(call.transcript.map((t) => t.speaker), ["client", "whisper", "agent"]);
  assert.equal(call.transcript[1].text, "tell them we have a haircut special");
  const page = readRaw("apps/dashboard/src/legacy/pages/live-monitor-real.jsx");
  assert.ok(page.includes('data-testid="live-whisper-line"') && page.includes("You whispered"));
  const cv = readRaw("apps/dashboard/src/legacy/pages/conversations.jsx");
  assert.ok(cv.includes('line.speaker === "whisper" ? "You whispered"'));
  const edge = readCode("apps/edge/api/admin/whisper.ts");
  assert.ok(edge.includes("additionalContext: frameWhisper(text)"), "the edge sends the frame, the ledger keeps the words");
});
