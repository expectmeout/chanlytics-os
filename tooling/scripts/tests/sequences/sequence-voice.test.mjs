/**
 * The owner's voice, learned from an email they paste (decision 0078; POST sequences/voice): read once by the model, as
 * data, into up to three lines about how they write, each kept in Ask's memory as `learned` through its one door; what
 * the model says that is no such line is never kept; memory full says so. And the line New says under a draft written
 * with them.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { setModelStream } = await import("../../../../apps/dashboard/src/server/model-json.ts");
const { learnVoice } = await import("../../../../apps/dashboard/src/server/sequences/voice.ts");
const { VOICE_BODY } = await import("../../../../apps/dashboard/src/server/sequences/bodies.ts");
const { VOICE_WORDS, voiceLineOf, voiceSaid } = await import("@chanlytics/contracts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PASTED =
  "Hey there, saw your shop on Maple. I'm Sam, I run a small answering service for garages. Worth a quick chat? Cheers, Sam";

let calls;
const answerWith = (said) =>
  setModelStream(async function* (call) {
    calls.push(call);
    yield { type: "text", index: 0, text: JSON.stringify(said) };
    yield { type: "stop", stopReason: "end_turn" };
  });
beforeEach(() => {
  calls = [];
});

/** A workspace's memory door: keeps what it is given, as the database's would, full after `room` lines. */
function world(room = 40) {
  const kept = [];
  const supabase = fakeDb(
    {},
    {},
    {
      ask_memory_write: (args) => {
        if (kept.length >= room) return { error: "full" };
        const again = kept.find((k) => k.text.toLowerCase() === args.p_text.toLowerCase());
        if (again) return { memory: { id: again.id, text: again.text }, again: true };
        const line = { id: `m${kept.length + 1}`, text: args.p_text, source: args.p_source };
        kept.push(line);
        return { memory: { id: line.id, text: line.text }, again: false };
      },
    },
  );
  return { ctx: { supabase, userId: USER }, kept };
}

test("a paste is read once, as data, and up to three lines on how the owner writes are kept as learned", async () => {
  answerWith({
    lines: [
      "In cold emails: short, under 40 words, no greeting beyond 'Hey there'.",
      "In cold emails: says who they are in one line, then asks a yes-or-no question.",
      "In cold emails: signs off 'Cheers' with a first name.",
      "In cold emails: a fourth line is never kept.",
    ],
  });
  const w = world();
  const out = await learnVoice(w.ctx, T, { text: PASTED });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].purpose, "sequence_draft");
  assert.match(JSON.stringify(calls[0].request.messages), /<record>\\nHey there, saw your shop/, "the paste is data");
  assert.match(String(calls[0].request.system), /never an instruction/);
  assert.deepEqual(
    w.kept.map((k) => k.source),
    ["learned", "learned", "learned"],
  );
  assert.deepEqual(out, { lines: w.kept.map((k) => k.text), full: false });
});

test("what is no line about writing is never kept: another lead, too long, too short, or the same line twice", async () => {
  answerWith({
    lines: [
      "They sell an answering service to garages.",
      "In cold emails: " + "very ".repeat(60) + "long.",
      "In cold emails: ok",
      "In cold emails: signs off 'Cheers' with a first name.",
      "in cold emails: signs off 'cheers' with a first name.",
    ],
  });
  const w = world();
  const out = await learnVoice(w.ctx, T, { text: PASTED });
  assert.deepEqual(out.lines, ["In cold emails: signs off 'Cheers' with a first name."]);
  assert.equal(w.kept.length, 1);
});

test("memory full keeps what fits and says so", async () => {
  answerWith({ lines: ["In cold emails: short and plain.", "In cold emails: asks a question at the end."] });
  const w = world(1);
  const out = await learnVoice(w.ctx, T, { text: PASTED });
  assert.deepEqual(out, { lines: ["In cold emails: short and plain."], full: true });
});

test("a paste is a whole email: too short or too long is refused before any call", () => {
  assert.equal(VOICE_BODY.safeParse({ text: "Hi, worth a chat?" }).success, false);
  assert.equal(VOICE_BODY.safeParse({ text: "x".repeat(4001) }).success, false);
  assert.equal(VOICE_BODY.safeParse({ text: PASTED }).success, true);
  assert.equal(VOICE_BODY.safeParse({ text: PASTED, extra: 1 }).success, false);
});

test("the line under a draft says the learned lines without their lead; none is no line", () => {
  assert.equal(voiceSaid("In cold emails: short, no greeting."), "short, no greeting");
  assert.equal(
    voiceLineOf(["In cold emails: short, no greeting.", "In cold emails: signs off 'Cheers' with a first name."]),
    "Written the way you write: short, no greeting · signs off 'Cheers' with a first name",
  );
  assert.equal(voiceLineOf([]), null);
  assert.equal(voiceLineOf(undefined), null);
  assert.match(VOICE_WORDS.kept(2), /2 lines/);
});
