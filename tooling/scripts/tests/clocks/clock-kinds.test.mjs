/**
 * Time is a row (decision 0031, invariant 6): every registered clock has a kind (clocks/_clocks.mjs), and says why. The
 * clocks that run a timer or a reaction on a schedule, the event-shaped ones, may only fall: their count is one of the
 * code-health measures (_measures.mjs, repo/code-health-ratchets.test.mjs), so a new one is a red build and one moved onto
 * a due row or behind an event is banked. ops/sweep-registry.db.test.mjs holds the register's every row to a kind, on a
 * real database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLOCKS, CLOCK_KINDS } from "./_clocks.mjs";
import { schemaOf } from "../_schema.mjs";

test("every clock is one of the kinds, and says why", () => {
  for (const [name, c] of Object.entries(CLOCKS)) {
    assert.ok(CLOCK_KINDS.includes(c.kind), `${name}: ${c.kind} is not a kind a clock may be`);
    assert.ok(typeof c.why === "string" && c.why.length > 20, `${name}: say why it is ${c.kind}`);
    if (c.kind === "event-shaped")
      assert.match(c.why, /replaces? it/, `${name}: an event-shaped clock says what replaces it`);
  }
});

test("a due clock carries out a time its rows hold: it names the columns, and the schema has each", async () => {
  const schema = await schemaOf();
  const due = Object.entries(CLOCKS).filter(([, c]) => c.kind === "due");
  assert.ok(due.length > 0);
  for (const [name, c] of due) {
    assert.ok(Array.isArray(c.times) && c.times.length > 0, `${name}: a due clock names the columns its time is in`);
    for (const t of c.times) {
      const [table, column] = t.split(".");
      assert.ok(schema.relations[table]?.columns[column], `${name}: ${t} is not a column the schema has`);
    }
  }
  for (const [name, c] of Object.entries(CLOCKS))
    if (c.kind !== "due") assert.equal(c.times, undefined, `${name}: only a due clock names its times`);
});
