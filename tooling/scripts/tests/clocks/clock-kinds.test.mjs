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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { schemaOf } from "../_schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

test("every clock is one of the kinds, and says why", () => {
  for (const [name, c] of Object.entries(CLOCKS)) {
    assert.ok(CLOCK_KINDS.includes(c.kind), `${name}: ${c.kind} is not a kind a clock may be`);
    assert.ok(typeof c.why === "string" && c.why.length > 20, `${name}: say why it is ${c.kind}`);
    if (c.kind === "event-shaped")
      assert.match(c.why, /replaces? it/, `${name}: an event-shaped clock says what replaces it`);
  }
});

test("a due clock carries out a time its rows hold: it names the columns and the function that reads them, and the schema has each", async () => {
  const schema = await schemaOf();
  const sql = fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8");
  const due = Object.entries(CLOCKS).filter(([, c]) => c.kind === "due");
  assert.ok(due.length > 0);
  for (const [name, c] of due) {
    assert.ok(Array.isArray(c.times) && c.times.length > 0, `${name}: a due clock names the columns its time is in`);
    // The function that carries it out, as the replayed schema holds it, reads each of those columns.
    const at = sql.indexOf(`CREATE FUNCTION public.${c.fn}(`);
    assert.ok(at >= 0, `${name}: ${c.fn} is not a function the schema has`);
    const body = sql.slice(at, sql.indexOf("$$;", at));
    for (const t of c.times) {
      const [table, column] = t.split(".");
      assert.ok(schema.relations[table]?.columns[column], `${name}: ${t} is not a column the schema has`);
      assert.match(body, new RegExp(`\\b${column}\\b`), `${name}: ${c.fn} does not read ${t}`);
    }
  }
  for (const [name, c] of Object.entries(CLOCKS))
    if (c.kind !== "due")
      assert.ok(c.times === undefined && c.fn === undefined, `${name}: only a due clock names its times`);
});
