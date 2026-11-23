/**
 * A comment's public answer written again as its owner asks ("Tell AI what to change", POST comments/rewrite; the
 * journey canvas's Results board, cell 2), over a fake model: AI is told the post and the comment as the draft was, the
 * answer as it stands and what the owner wants changed, on the comment's own line of the AI ledger; what comes back is
 * words for the box, held to the rule a draft is held to. A price the owner typed is theirs to say; one only the model
 * brought makes no answer, and says why; AI's own "can't" is said with its reason.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { setModelStream } = await import("../../../apps/dashboard/src/server/shared/model-json.ts");
const { rewriteCommentFrom } = await import("../../../apps/dashboard/src/server/content/comment-rewrite-from.ts");

let calls;
/** The model, answering `answer`: one text event and a stop, as the gateway streams them. */
const answerWith = (answer) =>
  setModelStream(async function* (call) {
    calls.push(call);
    yield { type: "text", index: 0, text: JSON.stringify({ answer }) };
    yield { type: "stop", stopReason: "end_turn" };
  });
beforeEach(() => {
  calls = [];
});

const known = {
  facts: {
    name: "Luma Studio",
    tone: "warm",
    languages: ["English"],
    services: ["Balayage"],
    says: ["Blow-dry is $45."],
  },
  comment: {
    words: "how much for balayage?",
    username: "lucia.m",
    postKind: "reel",
    caption: "Warm balayage, start to finish.",
  },
};
const who = { tenantId: "00000000-0000-4000-8000-0000000000b1", userId: "00000000-0000-4000-8000-0000000000a1" };

test("AI is told the post, the comment, the answer as it stands and the change, on the comment's own ledger line", async () => {
  answerWith("Message us and we'll find you a time for balayage.");
  const out = await rewriteCommentFrom(known, { words: "Message us!", change: "mention balayage, keep it short" }, who);
  assert.deepEqual(out, { draft: "Message us and we'll find you a time for balayage.", cannot_why: null });
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.purpose, "comment_rewrite", "what writing it again costs is read apart");
  const asked = call.request.messages[0].content;
  assert.match(asked, /Warm balayage, start to finish\./);
  assert.match(asked, /how much for balayage\?/);
  assert.match(asked, /The answer as it stands:/);
  assert.match(asked, /Message us!/);
  assert.match(asked, /What the owner wants changed: mention balayage, keep it short/);
  assert.match(call.request.system, /Write the answer again as the owner asks/);
});

test("a price the owner typed in their change is theirs; one only the model brought makes no answer", async () => {
  answerWith("Balayage is $120. Message us to book.");
  const theirs = await rewriteCommentFrom(known, { words: "", change: "say balayage is $120" }, who);
  assert.equal(theirs.draft, "Balayage is $120. Message us to book.");
  answerWith("Balayage is $95. Message us to book.");
  const invented = await rewriteCommentFrom(known, { words: "", change: "say how much it is" }, who);
  assert.deepEqual(invented, { draft: null, cannot_why: "It asks about a price you haven't given AI." });
});

test("AI's own can't is said with its reason, and nothing is written into the box", async () => {
  answerWith("CANNOT: it is a complaint");
  const out = await rewriteCommentFrom(known, { words: "Sorry!", change: "apologise" }, who);
  assert.deepEqual(out, { draft: null, cannot_why: "It is a complaint." });
});
