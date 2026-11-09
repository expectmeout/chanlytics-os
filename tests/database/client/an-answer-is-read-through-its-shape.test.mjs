/**
 * A JSON value the database answers is read through the shape the code expects of it (decision 0112, packages/db
 * shared/read-json.ts): a SQL function's answer (`readAnswer`) or a JSON column (`readColumn`). Report-only for now, as
 * layer 6's doors began: a value its schema does not hold is said, by function or column and by field, never by value,
 * and read as it came, so nothing a caller gets changes until production has said nothing for a week.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { observeDb, readAnswer, readColumn } from "@chanlytics/db/shared";

const lines = [];
observeDb({
  log: { info: () => {}, warn: (event, fields) => lines.push({ event, ...fields }), error: () => {} },
  requestId: () => "req-1",
});

const Outcome = z.object({ made: z.number(), state: z.enum(["kept", "held"]) });

test("an answer its shape holds is read as it came, and nothing is said", () => {
  lines.length = 0;
  const answer = { made: 2, state: "kept", extra: "the function's own" };
  assert.equal(readAnswer("thing_make", Outcome, answer), answer);
  assert.deepEqual(lines, []);
});

test("an answer its shape does not hold is said by function and field, never by value, and still read as it came", () => {
  lines.length = 0;
  const answer = { made: "two", state: "gone", secret: "a person's words" };
  assert.equal(readAnswer("thing_make", Outcome, answer), answer);
  assert.deepEqual(lines, [
    { event: "rpc_answer_unexpected", fn: "thing_make", fields: ["made", "state"], request_id: "req-1" },
  ]);
  assert.ok(!JSON.stringify(lines).includes("a person's words") && !JSON.stringify(lines).includes("two"));
});

test("a JSON column is read the same way, named by its table and column; a value that is no object is said whole", () => {
  lines.length = 0;
  assert.equal(readColumn("calls.recording", Outcome, null), null);
  assert.deepEqual(lines, [
    { event: "json_column_unexpected", column: "calls.recording", fields: ["(value)"], request_id: "req-1" },
  ]);
});
