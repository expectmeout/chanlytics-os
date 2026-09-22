/**
 * The put-backs a list's rows() keeps (business-tab-gestures.jsx BtPutBacks), as the pure helper they are: every row
 * taken out of a list that an Undo may still put back, each with its place among the list's rows. No page is drawn:
 * every claim here is what the helper answers for a sequence of removals and restores.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { W } from "./_business-tab-harness.mjs";

const P = W.BtPutBacks;
/** A list of ten rows as the helper sees it, with the put-backs `backs` placed back into it where each would go. */
const TEN = Array.from({ length: 10 }, (_, i) => `Service ${i + 1}`);
/** Take out the row named `name` from `rows`, as rows() does: the list without it, and the put-backs with it. */
const takeOut = ({ rows, backs, seq }, list, name) => {
  const i = rows.indexOf(name);
  return { rows: rows.filter((_, j) => j !== i), backs: P.taken(backs, list, i, { id: seq + 1, row: name }), seq: seq + 1 };
};
/** Put back the row named `name`, where the helper says it goes. */
const putBack = ({ rows, backs, seq }, name) => {
  const b = backs.find((x) => x.row === name);
  return { rows: [...rows.slice(0, b.at), name, ...rows.slice(b.at)], backs: P.restored(backs, b.id), seq };
};
const start = () => ({ rows: TEN.slice(), backs: P.none, seq: 0 });

test("a row taken out goes back between the same two rows, whatever was taken out or put back since", () => {
  // The spec review's repro: Service 6 out, then Service 3, then Service 6 back.
  let s = takeOut(takeOut(start(), "services", "Service 6"), "services", "Service 3");
  assert.deepEqual(P.of(s.backs, "services").map((b) => [b.row, b.at]), [["Service 3", 2], ["Service 6", 4]], "in the list's order, each where it would go");
  s = putBack(s, "Service 6");
  assert.deepEqual(s.rows, ["Service 1", "Service 2", "Service 4", "Service 5", "Service 6", "Service 7", "Service 8", "Service 9", "Service 10"]);
  s = putBack(s, "Service 3");
  assert.deepEqual(s.rows, TEN);
  assert.deepEqual(s.backs, []);
  // The other order.
  s = putBack(takeOut(takeOut(start(), "services", "Service 6"), "services", "Service 3"), "Service 3");
  assert.deepEqual(putBack(s, "Service 6").rows, TEN);
});

test("two rows taken out of one gap go back in their order, whichever goes first", () => {
  for (const first of ["Service 3", "Service 4"]) {
    let s = takeOut(takeOut(start(), "services", "Service 3"), "services", "Service 4");
    assert.deepEqual(P.of(s.backs, "services").map((b) => [b.row, b.at]), [["Service 3", 2], ["Service 4", 2]]);
    s = putBack(s, first);
    s = putBack(s, first === "Service 3" ? "Service 4" : "Service 3");
    assert.deepEqual(s.rows, TEN, first);
  }
  // A long mixed walk: out and back in any order lands every row where it was.
  let s = start();
  for (const name of ["Service 2", "Service 9", "Service 5", "Service 1", "Service 10"]) s = takeOut(s, "services", name);
  for (const name of ["Service 5", "Service 10", "Service 1", "Service 9", "Service 2"]) s = putBack(s, name);
  assert.deepEqual(s.rows, TEN);
});

test("each list's put-backs are its own: a row taken out of one list never moves another's", () => {
  // The quality review's P1, on the helper: Monday's and Tuesday's shifts are two lists.
  let backs = P.taken(P.none, "hours-tue", 2, { id: 1, row: "Tue 14:00" });
  backs = P.taken(backs, "hours-mon", 1, { id: 2, row: "Mon 11:00" });
  assert.deepEqual(P.of(backs, "hours-tue").map((b) => b.at), [2], "REGRESSION: a removal on Monday moved Tuesday's put-back");
  backs = P.restored(backs, 2);
  assert.deepEqual(P.of(backs, "hours-tue").map((b) => b.at), [2], "and a restore on Monday leaves it too");
  assert.deepEqual(P.of(backs, "hours-mon"), []);
  // A list replaced whole from outside its rows() loses its put-backs, and no other list does.
  backs = P.taken(backs, "hours-mon", 0, { id: 3, row: "Mon 08:00" });
  const dropped = P.dropped(backs, "hours-tue");
  assert.deepEqual([P.of(dropped, "hours-tue"), P.of(dropped, "hours-mon").map((b) => b.id)], [[], [3]]);
  assert.equal(P.find(dropped, 1), null);
  assert.equal(P.find(dropped, 3).at, 0);
});

test("the helper changes nothing it is handed, and a list with no name is refused, loudly", () => {
  const backs = P.taken(P.none, "closures", 0, { id: 1, row: "Dec 24" });
  const frozen = JSON.stringify(backs);
  P.taken(backs, "closures", 0, { id: 2, row: "Dec 31" });
  P.restored(backs, 1);
  P.dropped(backs, "closures");
  assert.equal(JSON.stringify(backs), frozen);
  assert.equal(P.restored(backs, 99), backs, "an id it does not hold changes nothing");
  // No "" fallback: a list rows() could not tell apart from another would share its put-backs with it.
  for (const bad of [undefined, null, "", 3]) {
    assert.throws(() => P.taken(P.none, bad, 0, { id: 1, row: "x" }), { name: "TypeError", message: /name/ }, String(bad));
    assert.throws(() => P.of(P.none, bad), TypeError);
    assert.throws(() => P.dropped(P.none, bad), TypeError);
  }
});
