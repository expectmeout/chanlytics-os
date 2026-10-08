/**
 * What the queue holds besides the people who asked for a person, said once (contracts today-bands.ts
 * todayAlsoWaiting), and the head's last rung over it (todayHeadline).
 *
 * The head said "Nothing needs you" above a queue that said "1 Need you": a search waiting on an answer is in the
 * queue and was not in the head's count (Ruben, 7 Oct 2026). "Nothing needs you" is said only over a queue with
 * nothing in it; what still waits is said first, in the queue's own sentences.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { todayAlsoWaiting, todayHeadline } = await importSrc("packages/contracts/src/today/today-bands.ts");

/** A day nobody asked for a person on: three messages from two people and a call, all answered by the receptionist. */
const calm = (period = {}) => ({
  needsYouCount: 0,
  oldest: null,
  speed: null,
  period: {
    messages_in: 3,
    conversations_active: 2,
    calls: 1,
    unanswered_in_window: 0,
    messages_out_you: 0,
    answered_by_ai: 3,
    ...period,
  },
});

test("what else waits is said in the queue's own sentences, one or many, and nothing for none", () => {
  assert.deepEqual(todayAlsoWaiting({ calls: 0, searches: 0 }), []);
  assert.deepEqual(todayAlsoWaiting({ windows: 1, calls: 1, searches: 1 }), [
    "One reply window is closing.",
    "One call is worth a listen.",
    "A search is waiting on your answer.",
  ]);
  assert.deepEqual(todayAlsoWaiting({ windows: 2, calls: 3, searches: 2 }), [
    "2 reply windows are closing.",
    "3 calls are worth a listen.",
    "2 searches are waiting on your answer.",
  ]);
  // The brief names a closing window's person itself, so it passes no windows.
  assert.deepEqual(todayAlsoWaiting({ calls: 0, searches: 1 }), ["A search is waiting on your answer."]);
});

test("REGRESSION: the head says Nothing needs you only over a queue with nothing in it", () => {
  const empty = todayHeadline(calm(), null, [], []);
  assert.equal(
    empty.headline,
    "The receptionist handled everything — 3 messages from 2 people and 1 call today. Nothing needs you.",
  );
  assert.equal(empty.tone, "calm");
  // A search waits on an answer: the head said "Nothing needs you" above a queue that said "1 Need you".
  const waiting = todayHeadline(calm(), null, [], todayAlsoWaiting({ calls: 0, searches: 1 }));
  assert.equal(waiting.headline, "A search is waiting on your answer. 3 messages from 2 people and 1 call today.");
  assert.doesNotMatch(waiting.headline, /Nothing needs you/);
  // With no traffic at all, what waits is the whole of it.
  const still = todayHeadline(
    calm({ messages_in: 0, conversations_active: 0, calls: 0 }),
    null,
    [],
    ["One call is worth a listen."],
  );
  assert.equal(still.headline, "One call is worth a listen.");
  assert.equal(
    todayHeadline(calm({ messages_in: 0, conversations_active: 0, calls: 0 }), null, [], []).headline,
    "Nothing needs you.",
  );
  // People who asked for a person still come first: what else waits is the last rung's alone.
  assert.equal(
    todayHeadline({ ...calm(), needsYouCount: 2, oldest: "2:20 PM" }, null, [], ["A search is waiting on your answer."])
      .headline,
    "2 conversations need you.",
  );
});
