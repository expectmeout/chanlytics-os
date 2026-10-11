/**
 * The operator's reading of a kept turn (tooling/scripts/ops/turn-read.mjs; decision 0039): what the receptionist was
 * told, block by block as the model was sent it, and what it answered, in the three ways a turn ends: a record, words
 * no record could be read from, and no answer at all. The script's reads of the two tables were run against a real
 * Postgres when it was written; here its words are held.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { settingsLine, turnLine, turnText } from "../../ops/turn-read.mjs";

const turn = (over = {}) => ({
  id: "6f157e30-2250-4116-91b4-6ffc943e9e57",
  conversation_id: "541e073a-e3ec-4a14-9eea-74b331115a75",
  prompt_hash: "0123456789abcdef",
  model: "claude-opus-5",
  latency_ms: 2140,
  created_at: "2026-10-12T14:02:00+00:00",
  request: {
    now: "It is Monday, 10:02.",
    who: "Name on record: Ana.",
    steer: null,
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "Hi Ana, how can I help?" },
      { role: "user", content: "when do you open on Saturday?" },
    ],
    photo: null,
  },
  response: {
    stop_reason: "end_turn",
    record: {
      reply: "We are closed on Saturdays.",
      intent: "hours",
      escalate: false,
      reason: "The hours list Monday to Friday only.",
      confidence: 0.94,
      facts_used: ["hours"],
      language: "en",
    },
    text: '{"reply":"We are closed on Saturdays.","intent":"hours","escalate":false,"reason":"The hours list Monday to Friday only.","confidence":0.94,"facts_used":["hours"],"language":"en"}',
  },
  ...over,
});
const PROMPT = {
  text: "You are the receptionist for Example Studio.",
  first_seen_at: "2026-10-01T09:00:00+00:00",
  last_seen_at: "2026-10-12T14:02:00+00:00",
};

test("a turn reads top to bottom as the model was sent it, then what it answered and why", () => {
  const text = turnText(turn(), PROMPT);
  const order = [
    "Turn 6f157e30-2250-4116-91b4-6ffc943e9e57",
    "at 2026-10-12T14:02:00+00:00, claude-opus-5, 2140 ms",
    "prompt 0123456789abcdef, first given 2026-10-01T09:00:00+00:00, last read 2026-10-12T14:02:00+00:00",
    "--- The prompt\nYou are the receptionist for Example Studio.",
    "--- The clock, and what was open\nIt is Monday, 10:02.",
    "--- Who it was speaking with\nName on record: Ana.",
    "[customer] hello\n[receptionist] Hi Ana, how can I help?\n[customer] when do you open on Saturday?",
    "--- What it answered\nWe are closed on Saturdays.",
    "intent hours, 94% sure, in en",
    "why: The hours list Monday to Friday only.",
    "facts it leaned on: hours",
  ].map((part) => text.indexOf(part));
  assert.ok(!order.includes(-1), `each part is said (${order.join(", ")})`);
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
    "in the order the model read them",
  );
  assert.ok(!text.includes("The owner's steer"), "a turn with no steer says nothing of one");
  assert.ok(!text.includes("said more than the record kept"), "the record is all the model wrote");
  // The model wrote an intent the platform does not know and seven facts: the record reads "other" and five, and the
  // reader says its words held more.
  const more = turn();
  more.response.text = JSON.stringify({ ...more.response.record, intent: "refund_request" });
  assert.match(
    turnText(more, PROMPT),
    /\(the model's own words said more than the record kept: read them with --json\)/,
  );
});

test("a steer, a photo, a handoff and a prompt left out are each said, and a prompt past its keep is said to be gone", () => {
  const steered = turn({
    request: { ...turn().request, steer: "Shorter, and offer Tuesday.", photo: "image/jpeg" },
    response: { ...turn().response, record: { ...turn().response.record, escalate: true, reason: "", facts_used: [] } },
  });
  const text = turnText(steered, null, { withPrompt: false });
  assert.match(text, /--- The owner's steer\nShorter, and offer Tuesday\./);
  assert.match(text, /\(a photo went before the last message's words: image\/jpeg, not kept\)/);
  assert.match(text, /94% sure, in en, handed to a person/);
  assert.match(text, /why: \(it gave none\)/);
  assert.match(text, /facts it leaned on: \(none named\)/);
  assert.match(text, /prompt 0123456789abcdef: its text is no longer kept/);
  assert.ok(!text.includes("--- The prompt"));
});

test("an answer with no record is shown as it came, and a turn with no answer says where to read why", () => {
  const unread = turnText(
    turn({ response: { stop_reason: "max_tokens", record: null, text: '{"reply":"We are clo' } }),
    PROMPT,
  );
  assert.match(unread, /No record could be read \(max_tokens\)\. Its words:\n\{"reply":"We are clo/);
  const none = turnText(turn({ response: null, model: null, latency_ms: null }), PROMPT);
  assert.match(none, /at 2026-10-12T14:02:00\+00:00, no model answered\n/);
  assert.match(none, /No answer came: the model could not be reached or refused the request \(ai_usage says which\)\./);
});

test("a conversation's list says each turn in a line: when, which, the model, and what it made of the message", () => {
  assert.equal(
    turnLine(turn()),
    "2026-10-12T14:02:00+00:00  6f157e30-2250-4116-91b4-6ffc943e9e57  claude-opus-5  hours, 94% sure",
  );
  assert.match(
    turnLine(turn({ response: { stop_reason: "refusal", record: null, text: "" } })),
    /no record \(refusal\)$/,
  );
  assert.match(turnLine(turn({ response: null, model: null })), /no model {2}no answer came$/);
});

test("a reply's settings are said in a line: their version, when they came into force, and whether they still are", () => {
  assert.equal(
    settingsLine(7, { changed_at: "2026-10-01T09:00:00+00:00", replaced_at: null }),
    "Settings: version 7, in force from 2026-10-01T09:00:00+00:00, still in force; --json has them whole.",
  );
  assert.match(
    settingsLine(6, { changed_at: "2026-09-01T09:00:00+00:00", replaced_at: "2026-10-01T09:00:00+00:00" }),
    /^Settings: version 6, in force from 2026-09-01T09:00:00\+00:00, replaced 2026-10-01T09:00:00\+00:00;/,
  );
  assert.match(settingsLine(2, null), /^Settings: version 2, no longer kept /);
});
