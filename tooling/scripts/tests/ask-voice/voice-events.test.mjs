/**
 * What the agent's events mean to the Line (apps/dashboard/src/legacy-bridge/ask/voice-events.ts), over the events the
 * spike recorded (docs/superpowers/specs/2026-10-03-ask-spoken-spike.md, runs A, B5 and B8): the person's words become
 * the question, a read's label a trace, the parts one growing Say with the first sentence as its headline, the buffer
 * words nothing, a cut a cut, the complete event the landing, the whole response its spoken text with the labels and
 * the buffer words out.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { reduceVoiceEvent, VOICE_TURN_START, cleanSpoken, sayOf } = await import(
  at("apps/dashboard/src/legacy-bridge/ask/voice-events.ts")
);

/** The events in order, as the client's callbacks fire them; what came out, and the state left. */
function run(events, state = VOICE_TURN_START) {
  const actions = [];
  for (const ev of events) {
    const r = reduceVoiceEvent(state, ev);
    state = r.state;
    actions.push(...r.actions);
  }
  return { actions, state };
}
const part = (text, type = "delta") => ({ kind: "part", payload: { text, type } });

test("the person's words are the question and begin a turn; the agent's whole response is its spoken text, labels and buffer words out", () => {
  const { actions, state } = run([
    { kind: "message", payload: { source: "user", role: "user", message: "Who needs me right now?" } },
    {
      kind: "message",
      payload: {
        source: "ai",
        role: "agent",
        message:
          "Reading today… ..................Two people need you, Ana since noon and Luis since two. Six appointments today.",
      },
    },
    { kind: "message", payload: { source: "ai", message: "   " } },
  ]);
  assert.deepEqual(actions, [
    { t: "question", text: "Who needs me right now?" },
    { t: "spoken", text: "Two people need you, Ana since noon and Luis since two. Six appointments today." },
  ]);
  assert.deepEqual(state, { said: "" });
});

test("the parts accumulate into one Say: a read's label at the head is a trace, the buffer words are nothing, the first sentence is the headline and the rest the detail; stop adds nothing and the complete event lands the turn", () => {
  const { actions, state } = run([
    part("", "start"),
    part("Reading today… "),
    part("..."),
    part("..."),
    part("Two people nee"),
    part("d you, Ana sin"),
    part("ce noon and Luis since two."),
    part(" Six appointments today, the next at 3:30 PM."),
    part("", "stop"),
    { kind: "event", payload: { type: "ping" } },
    { kind: "event", payload: { type: "agent_response_complete" } },
  ]);
  assert.deepEqual(actions, [
    { t: "trace", text: "Reading today" },
    { t: "say", headline: "Two people nee", detail: "" },
    { t: "say", headline: "Two people need you, Ana sin", detail: "" },
    { t: "say", headline: "Two people need you, Ana since noon and Luis since two.", detail: "" },
    {
      t: "say",
      headline: "Two people need you, Ana since noon and Luis since two.",
      detail: "Six appointments today, the next at 3:30 PM.",
    },
    { t: "landed" },
  ]);
  assert.deepEqual(state, { said: "" }, "landed: the next response starts clean");
});

test("a second label is a trace too; an ellipsis once the answer has begun is words (an answer may end a clause with one); a start clears a response left half-said", () => {
  const { actions } = run([
    part("Reading today… "),
    part("Checking the calendar… "),
    part("Ana needs you"),
    part("… "),
    part("since noon. "),
    part("", "start"),
    part("Nobody waits."),
  ]);
  assert.deepEqual(actions, [
    { t: "trace", text: "Reading today" },
    { t: "trace", text: "Checking the calendar" },
    { t: "say", headline: "Ana needs you", detail: "" },
    { t: "say", headline: "Ana needs you…", detail: "" },
    { t: "say", headline: "Ana needs you… since noon.", detail: "" },
    { t: "say", headline: "Nobody waits.", detail: "" },
  ]);
});

test("a cut is a cut and the correction is what was spoken; the mode and how loud the person is pass through; a disconnect says the conversation is gone", () => {
  const { actions } = run([
    { kind: "mode", payload: { mode: "speaking" } },
    { kind: "interruption", payload: { event_id: 3 } },
    {
      kind: "correction",
      payload: {
        corrected_response: "Two people need you, Ana since",
        original_response: "Two people need you, Ana since noon and Luis since two.",
      },
    },
    {
      kind: "correction",
      payload: {
        type: "agent_response_correction",
        agent_response_correction_event: { corrected_response: "Reading today… Ana since", original_response: "x" },
      },
    },
    { kind: "correction", payload: null },
    { kind: "mode", payload: { mode: "listening" } },
    { kind: "vad", payload: { vadScore: 0.42 } },
    { kind: "vad", payload: { vad_score: 7 } },
    { kind: "vad", payload: {} },
    { kind: "disconnect", payload: { reason: "error", message: "custom_llm_error: LLM Cascade Error: TimeoutError" } },
    { kind: "disconnect", payload: {} },
  ]);
  assert.deepEqual(actions, [
    { t: "mode", mode: "speaking" },
    { t: "cut" },
    { t: "spoken", text: "Two people need you, Ana since" },
    { t: "spoken", text: "Ana since" },
    { t: "mode", mode: "listening" },
    { t: "vad", score: 0.42 },
    { t: "vad", score: 1 },
    { t: "gone", reason: "error" },
    { t: "gone", reason: "disconnect" },
  ]);
});

test("the helpers: the Say's split at the first sentence, and a response cleaned of its labels and buffer words", () => {
  assert.deepEqual(sayOf("Two people need you."), { headline: "Two people need you.", detail: "" });
  assert.deepEqual(sayOf("Is it 3.30 or 3:30? Ask Ana."), { headline: "Is it 3.30 or 3:30?", detail: "Ask Ana." });
  assert.deepEqual(sayOf("Still writing the first sent"), { headline: "Still writing the first sent", detail: "" });
  assert.equal(cleanSpoken("Reading today… Checking the calendar… ... ... Nobody waits. ..."), "Nobody waits.");
  assert.equal(
    cleanSpoken("One moment. Reading today… Ana needs you."),
    "One moment. Reading today… Ana needs you.",
    "a label after words is words",
  );
});
