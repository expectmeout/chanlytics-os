/**
 * The band's state machine: a question from the first word to the nod, a quick answer, a failed turn, a transport
 * error, a cut-off, a follow-up on the same thread, a question while busy, a press that ends with no words, and a
 * late event after the page was left.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialTurn, turnReducer as R } from "../../../apps/dashboard/src/legacy-bridge/mascot/turn.ts";

const msg = (over = {}) => ({
  id: "m1",
  role: "assistant",
  text: "Nora has waited longest.",
  failed: false,
  proposals: [],
  followups: [],
  citations: [],
  ...over,
});
const asked = (turn, text) => R(turn, { t: "asked", text, language: "en", seq: turn.seq + 1 });

test("a question, end to end", () => {
  let s = initialTurn();
  s = R(s, { t: "pressed" });
  assert.equal(s.phase, "listening");
  s = R(s, { t: "heard", words: "who's waited" });
  assert.equal(s.heard, "who's waited");
  s = asked(s, "who's waited longest?");
  assert.equal(R(s, { t: "released" }).phase, "reading", "the release that follows the words changes nothing");
  assert.equal(s.phase, "reading");
  assert.equal(s.question, "who's waited longest?");
  assert.equal(s.text, "");
  const seq = s.seq;
  s = R(s, { t: "thread", id: "th1", seq });
  assert.equal(s.threadId, "th1");
  s = R(s, { t: "trace", text: "Reading the inbox…", seq });
  assert.equal(s.trace, "Reading the inbox…");
  s = R(s, { t: "delta", text: "Nora has ", seq });
  assert.equal(s.phase, "answering");
  assert.equal(s.trace, null);
  s = R(s, { t: "delta", text: "waited longest.", seq });
  assert.equal(s.text, "Nora has waited longest.");
  s = R(s, { t: "final", message: msg(), seq });
  assert.equal(s.phase, "settled");
  assert.equal(s.message.id, "m1");
  assert.equal(s.text, "Nora has waited longest.");
});

test("a quick answer settles at once, with no thread", () => {
  let s = asked(initialTurn(), "who needs me?");
  s = R(s, { t: "fast", text: "Two people need you.", links: [{ label: "Open Inbox", to: "inbox" }], seq: s.seq });
  assert.equal(s.phase, "settled");
  assert.equal(s.text, "Two people need you.");
  assert.equal(s.threadId, null);
  assert.deepEqual(s.links, [{ label: "Open Inbox", to: "inbox" }]);
});

test("a failed final, a transport error and a cut-off all fail with their sentence", () => {
  let s = asked(initialTurn(), "x");
  s = R(s, {
    t: "final",
    message: msg({ failed: true, text: "Ask is not connected to a model yet." }),
    seq: s.seq,
  });
  assert.equal(s.phase, "failed");
  assert.equal(s.text, "Ask is not connected to a model yet.");
  s = asked(s, "y");
  s = R(s, { t: "error", text: "Network error — nothing was asked.", seq: s.seq });
  assert.equal(s.phase, "failed");
  assert.equal(s.text, "Network error — nothing was asked.");
  s = asked(s, "z");
  s = R(s, { t: "cut-off", text: "The answer was cut off. Try again.", seq: s.seq });
  assert.equal(s.phase, "failed");
});

test("a follow-up keeps the thread; clearing forgets it", () => {
  let s = asked(initialTurn(), "a");
  s = R(s, { t: "thread", id: "th9", seq: s.seq });
  s = R(s, { t: "final", message: msg(), seq: s.seq });
  s = asked(s, "and then?");
  assert.equal(s.threadId, "th9");
  assert.equal(s.phase, "reading");
  s = R(s, { t: "final", message: msg(), seq: s.seq });
  s = R(s, { t: "cleared" });
  assert.equal(s.phase, "rest");
  assert.equal(s.threadId, null);
  assert.equal(s.question, "");
});

test("one turn at a time: a question while reading or answering is ignored", () => {
  let s = asked(initialTurn(), "first");
  const seq = s.seq;
  const again = asked(s, "second");
  assert.equal(again.question, "first");
  assert.equal(again.seq, seq);
  s = R(s, { t: "delta", text: "…", seq });
  assert.equal(asked(s, "third").question, "first");
});

test("late events are dropped: an older turn's, and anything after the page was left", () => {
  let s = asked(initialTurn(), "a");
  const old = s.seq;
  s = R(s, { t: "final", message: msg(), seq: old });
  s = asked(s, "b");
  s = R(s, { t: "delta", text: "late", seq: old });
  assert.equal(s.text, "");
  s = R(s, { t: "left" });
  assert.equal(s.phase, "rest");
  const after = R(s, { t: "final", message: msg(), seq: s.seq - 1 });
  assert.equal(after.phase, "rest");
});

test("a press that ends with no words goes back to where it was: rest, or the answer it was a follow-up to", () => {
  let s = R(initialTurn(), { t: "pressed" });
  s = R(s, { t: "released" });
  assert.equal(s.phase, "rest");
  s = asked(s, "a");
  s = R(s, { t: "fast", text: "Nobody is waiting.", seq: s.seq });
  s = R(s, { t: "pressed" });
  assert.equal(s.phase, "listening");
  s = R(s, { t: "released" });
  assert.equal(s.phase, "settled");
  assert.equal(s.text, "Nobody is waiting.");
  assert.equal(R(s, { t: "released" }), s, "a release at rest is nothing");
});
