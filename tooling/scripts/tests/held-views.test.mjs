/**
 * Views a surface has read, held so the way back paints at once (the loading standard's piece B).
 *
 * Leads held its last eight views in a Map of its own and kept a counter so a slow answer for a view already left
 * never landed on the new one; Calendar kept one 63-day window and read it again each way (390-500ms, measured on
 * the salon's workspace, 22 Sep), and Reports one period. One helper now: the last N views by key, the newest kept,
 * each workspace's apart, and a way to ask whether a read is still the newest when it lands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = { location: { pathname: "/w/salon" } };
const { heldViews } = await import("../../../apps/dashboard/src/legacy-bridge/held-views.ts");
const at = (path) => {
  globalThis.window.location.pathname = path;
};

test("the last N views are held, the newest kept: holding one again makes it the newest", () => {
  const v = heldViews(3);
  v.hold("a", 1);
  v.hold("b", 2);
  v.hold("c", 3);
  v.hold("a", 10);
  v.hold("d", 4);
  assert.equal(v.get("b"), undefined, "the oldest went");
  assert.deepEqual([v.get("a"), v.get("c"), v.get("d")], [10, 3, 4]);
  assert.equal(v.has("a"), true);
  v.forget();
  assert.equal(v.has("a"), false);
});

test("each workspace's views are its own: the same view of another workspace is never painted", () => {
  const v = heldViews(8);
  v.hold("clients/leads", "salon's rows");
  at("/w/other");
  assert.equal(v.get("clients/leads"), undefined);
  v.hold("clients/leads", "other's rows");
  at("/w/salon");
  assert.equal(v.get("clients/leads"), "salon's rows");
});

test("a read asks whether it is still the newest when it lands: a slow answer for a view already left is dropped", () => {
  const v = heldViews(8);
  const first = v.ask();
  const second = v.ask();
  assert.equal(first.still(), false, "a newer view was asked for");
  assert.equal(second.still(), true);
});
