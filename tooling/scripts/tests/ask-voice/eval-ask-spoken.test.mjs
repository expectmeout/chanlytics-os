/**
 * The spoken eval's pure parts (tooling/scripts/eval-ask-spoken.mjs): the chat-completions stream read as the vendor
 * reads it, the words as spoken with the labels and the buffer words out, and the judge's spoken rules over a stored
 * turn's Say.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSpoken, speakable, spokenText, spokenFails } from "../../eval-ask-spoken.mjs";

const chunk = (content) =>
  `data: ${JSON.stringify({ id: "chatcmpl-ask", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`;
const STOP = `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`;

test("the stream is read chunk by chunk to [DONE]; a label and the buffer words are not speakable; the words as spoken are the answer's alone", () => {
  const sse =
    chunk("Reading today… ") +
    chunk("... ") +
    chunk("Two people need you,") +
    chunk(" Ana since noon.") +
    STOP +
    "data: [DONE]\n\n" +
    chunk("after the end");
  const contents = readSpoken(sse);
  assert.deepEqual(contents, ["Reading today… ", "... ", "Two people need you,", " Ana since noon."]);
  assert.deepEqual(contents.map(speakable), [false, false, true, true]);
  assert.equal(spokenText(contents), "Two people need you, Ana since noon.");
  assert.deepEqual(readSpoken("data: not json\n\n"), []);
});

test("the spoken rules: an id, a provider's id, a route or a bracketed tag in the Say fails; a long headline without an early comma fails; a short one or one with its comma passes", () => {
  const final = (headline, detail = "") => ({ answer: { say: { headline, detail } } });
  assert.deepEqual(spokenFails(final("Two people need you, Ana since noon and Luis since two.")), []);
  assert.deepEqual(spokenFails(final("Nobody waits.")), []);
  assert.deepEqual(spokenFails(final("Six appointments today and the next one is at half past three")), [
    "SPOKEN: the headline runs 12 words with no comma in its first 8",
  ]);
  assert.deepEqual(spokenFails(final("Ana's thread is 3f1e2d4c-aaaa-4bbb-8ccc-123456789abc.")), [
    "SPOKEN: an id is spoken",
  ]);
  assert.deepEqual(spokenFails(final("The call conv_2201m40t9syq is over.")), ["SPOKEN: a provider's id is spoken"]);
  assert.deepEqual(spokenFails(final("Open inbox/th-12 to reply.")), ["SPOKEN: a route is spoken"]);
  assert.deepEqual(spokenFails(final("Open /reports for the week.")), ["SPOKEN: a route is spoken"]);
  assert.deepEqual(spokenFails(final("Two reports need a look, since noon.")), [], "the plain word is speech");
  assert.deepEqual(spokenFails(final("Ana needs you.", "See [the thread] for more.")), [
    "SPOKEN: a bracketed tag is spoken",
  ]);
  assert.deepEqual(spokenFails({ answer: null }), [], "a turn before the Line has no Say to judge");
  assert.deepEqual(spokenFails(null), []);
});
