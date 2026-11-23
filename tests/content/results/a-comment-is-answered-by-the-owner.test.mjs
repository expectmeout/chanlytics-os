/**
 * A public answer to a comment (the content loop PRD's 12.4, call 27): AI drafts it knowing the post the person
 * commented on, with the comment fenced as a stranger's words; a draft that names a price or offers money the owner has
 * not given is no draft, said as a comment AI can't answer safely; AI's own "can't" is kept with its reason; the owner
 * sends. Nothing here is sent: the words and the rule only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { commentAnswerPrompt, commentDraftOf, COMMENT_DRAFT_CANNOT } from "@chanlytics/contracts";

const facts = {
  name: "Luma Studio",
  tone: "warm, short",
  languages: ["English", "Spanish"],
  services: ["Blow-dry", "Balayage"],
  says: ["Blow-dry is $45."],
};
const comment = {
  words: "how much for the blow-dry?",
  username: "lucia.m",
  postKind: "reel",
  caption: "Forty-five minutes, one round brush, zero frizz.",
};

test("AI is told the post the person commented on, and the comment is fenced as someone else's words", () => {
  const prompt = commentAnswerPrompt(facts, comment);
  assert.match(prompt.system, /public answer/i);
  assert.match(prompt.system, /Luma Studio/);
  assert.match(prompt.user, /reel/);
  assert.match(prompt.user, /Forty-five minutes, one round brush/);
  assert.match(prompt.user, /how much for the blow-dry\?/);
  assert.match(prompt.system, new RegExp(COMMENT_DRAFT_CANNOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(prompt.user.includes("<"), true, "the comment rides inside a fence");
});

test("a draft that quotes the owner's own price is a draft", () => {
  assert.deepEqual(commentDraftOf("It's $45, message us and we'll find you a time.", facts.says), {
    words: "It's $45, message us and we'll find you a time.",
  });
});

test("a draft with a price the owner never gave is no draft: AI can't answer it safely", () => {
  const out = commentDraftOf("It's $60, message us to book.", facts.says);
  assert.equal("cannotWhy" in out, true);
  assert.match(out.cannotWhy, /price/i);
});

test("a draft that offers money the owner never offered is no draft", () => {
  const out = commentDraftOf("Message us for a 20% discount!", []);
  assert.equal("cannotWhy" in out, true);
});

test("AI's own can't is kept with its reason, in a sentence the owner reads", () => {
  const out = commentDraftOf(`${COMMENT_DRAFT_CANNOT} it's a complaint about a visit`, facts.says);
  assert.deepEqual(out, { cannotWhy: "It's a complaint about a visit." });
  assert.deepEqual(commentDraftOf(COMMENT_DRAFT_CANNOT, facts.says), {
    cannotWhy: "AI can't answer this one safely.",
  });
});

test("an empty answer is no draft", () => {
  assert.equal("cannotWhy" in commentDraftOf("   ", facts.says), true);
});
