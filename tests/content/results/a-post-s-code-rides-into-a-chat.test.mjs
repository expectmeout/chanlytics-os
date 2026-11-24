/**
 * "Message us" with the post's code (the content loop PRD's 9.2, call 23; Appendix A.4; the sitting's 6.2 and 7.4): a
 * post's link opens a chat with the code already in the message, in square brackets so a word that happens to look like
 * a code is never one, and apart from a form request's code, which rides in round brackets. On Instagram the code rides
 * as the ig.me link's ref. A person who deletes the words is simply someone who wrote.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { postChatLinkOf, postCodeIn, requestCodeOf } from "@chanlytics/contracts";

test("a post's code is read only in its square brackets, wherever it stands, and in lower case", () => {
  assert.equal(postCodeIn("Hi! I saw your post. [k7m2qp]"), "k7m2qp");
  assert.equal(postCodeIn("hello [K7M2QP] is Saturday free?"), "k7m2qp");
  assert.equal(postCodeIn("thanks for the reply"), null, "a six-letter word is not a code");
  assert.equal(postCodeIn("Deleted the prewritten Message"), null);
  assert.equal(postCodeIn("[k7m2q0]"), null, "a character a code never holds");
});

test("a post's code and a form request's code never read as each other", () => {
  assert.equal(postCodeIn("Hi, about my request (ABC234)"), null);
  assert.equal(requestCodeOf("Hi! I saw your post. [k7m2qp]"), null);
});

test("WhatsApp's link carries the code in the words; Instagram's carries it as the ref", () => {
  const wa = new URL(postChatLinkOf({ code: "k7m2qp", whatsapp: "+15550100123", instagram: null }));
  assert.equal(wa.host, "wa.me");
  assert.equal(wa.pathname, "/15550100123");
  assert.equal(postCodeIn(wa.searchParams.get("text") ?? ""), "k7m2qp");
  const ig = new URL(postChatLinkOf({ code: "k7m2qp", whatsapp: null, instagram: "lumastudio" }));
  assert.equal(ig.host, "ig.me");
  assert.equal(ig.pathname, "/lumastudio", "the form the sitting proved: ig.me/<username>?ref=");
  assert.equal(ig.searchParams.get("ref"), "k7m2qp");
});

test("a business with neither chat has no link to a chat", () => {
  assert.equal(postChatLinkOf({ code: "k7m2qp", whatsapp: null, instagram: null }), null);
});
