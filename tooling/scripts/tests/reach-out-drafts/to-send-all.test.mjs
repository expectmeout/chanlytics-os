/**
 * The one To send (00428): every email handed to its owner, from each reach-out they send themselves, as one list on Sent
 * (`broadcasts/to-send`), and one row on Today where two or more runs hand emails over. Contracts' rules, run as written:
 * which runs are on it and in what order (toSendAllOf), when Today draws them as one row (toSendRunsOf), where a door to
 * the waiting runs goes (waitingRunsDoor), and that the address stays on Sent (doorOf), never a door to the composer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { toSendAllOf, toSendRunsOf, toSendEveryOf, waitingRunsDoor, doorOf, TO_SEND_ROUTE, TO_SEND_ALL_WORDS } =
  await import("@chanlytics/contracts");

/** A run as Sent's list holds it, as far as the rules read it. */
const run = (id, over = {}) => ({
  id,
  state: "sending",
  scheduled_for: "2026-10-14T09:00:00Z",
  held: 0,
  drafted: 0,
  ...over,
});

test("the list holds the going runs with emails handed over, the oldest first, and counts them all", () => {
  const rows = [
    run("b", { drafted: 3, scheduled_for: "2026-10-13T09:00:00Z" }),
    run("a", { drafted: 2, scheduled_for: "2026-10-12T09:00:00Z" }),
    run("c", { drafted: 0 }),
    run("d", { drafted: 4, state: "finished" }),
    run("e", { drafted: 1, state: "pending_approval" }),
  ];
  const all = toSendAllOf(rows);
  assert.deepEqual(
    all.runs.map((r) => r.id),
    ["a", "b"],
    "a run with none, or not going, is not on it",
  );
  assert.equal(all.count, 5);
  assert.equal(toSendAllOf([run("c")]), null, "nothing handed over: no list");
  assert.equal(toSendAllOf([]), null);
});

test("Today draws two or more as one row; one alone, or one whose check holds emails too, is its run's own row", () => {
  assert.equal(toSendRunsOf([run("a", { drafted: 2 })]), null, "one run opens itself");
  const two = toSendRunsOf([run("a", { drafted: 2 }), run("b", { drafted: 1 })]);
  assert.deepEqual(
    two.runs.map((r) => r.id),
    ["a", "b"],
  );
  assert.equal(two.count, 3);
  assert.equal(two.from, 2);
  assert.equal(
    toSendRunsOf([run("a", { drafted: 2 }), run("b", { drafted: 1, held: 2 })]),
    null,
    "a run holding emails for a say is answered on the run first",
  );
  // The row says the list it opens: a run that holds emails too is on it, though it keeps a row of its own.
  const three = toSendRunsOf([run("a", { drafted: 2 }), run("b", { drafted: 1 }), run("c", { drafted: 3, held: 1 })]);
  assert.deepEqual(
    three.runs.map((r) => r.id),
    ["a", "b"],
  );
  assert.equal(three.count, 6);
  assert.equal(three.from, 3);
  assert.deepEqual(toSendEveryOf([run("a", { drafted: 2 }), run("c", { drafted: 3, held: 1 })]), { count: 5, from: 2 });
  assert.equal(toSendEveryOf([run("a", { drafted: 2 })]), null, "a run alone has no door to all of them");
  assert.equal(
    TO_SEND_ALL_WORDS.sentence(two.count, two.from),
    "3 emails to send from your inbox, from 2 reach-outs, each written and checked.",
  );
  assert.equal(TO_SEND_ALL_WORDS.sub(1, 1), "1 email handed to you");
  assert.equal(TO_SEND_ALL_WORDS.sub(5, 2), "5 emails handed to you, from 2 reach-outs");
});

test("a door to the waiting runs: the run, the one To send, else Sent", () => {
  assert.equal(waitingRunsDoor([run("a", { drafted: 2 })]), "broadcasts/run:a");
  assert.equal(waitingRunsDoor([run("a", { drafted: 2 }), run("b", { drafted: 1 })]), TO_SEND_ROUTE);
  assert.equal(
    waitingRunsDoor([run("a", { drafted: 2 }), run("b", { state: "pending_approval" })]),
    "broadcasts",
    "a run waiting for approval among them: Sent, where both are",
  );
  assert.equal(waitingRunsDoor([run("a", { drafted: 2 }), run("b", { drafted: 1, held: 1 })]), "broadcasts");
});

test("the address is Sent's own, never a door to the composer on an audience called to-send", () => {
  assert.equal(TO_SEND_ROUTE, "broadcasts/to-send");
  assert.equal(doorOf(TO_SEND_ROUTE), null);
  assert.equal(doorOf("broadcasts/to-sendx"), "campaigns/new:to:to-sendx");
});
