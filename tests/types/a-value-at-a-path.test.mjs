/**
 * What a value holds at a path (contracts unknown.ts, valueAt): a provider's answer read key by key and index by index,
 * so a step that finds no record or no list answers undefined instead of throwing, and nothing on the way down is told a
 * shape (decision 0112).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { valueAt } from "@chanlytics/contracts";

const answer = { messages: [{ id: "m1", threadId: "t1" }], error: { message: "quota" }, list: null };

test("a path through records and lists reads the leaf it names", () => {
  assert.equal(valueAt(answer, "messages", 0, "id"), "m1");
  assert.equal(valueAt(answer, "error", "message"), "quota");
  assert.deepEqual(valueAt(answer, "messages", 0), { id: "m1", threadId: "t1" });
  assert.equal(valueAt(answer), answer);
});

test("a step that finds no record or no list answers undefined, never throws", () => {
  assert.equal(valueAt(answer, "messages", 1, "id"), undefined);
  assert.equal(valueAt(answer, "list", 0), undefined);
  assert.equal(valueAt(answer, "error", 0), undefined);
  assert.equal(valueAt(answer, "messages", "id"), undefined);
  assert.equal(valueAt(null, "a"), undefined);
  assert.equal(valueAt("text", "length"), undefined);
  assert.equal(valueAt([["deep"]], 0, 0), "deep");
});
