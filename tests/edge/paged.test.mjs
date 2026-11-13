/**
 * Reading a whole answer out of PostgREST, which does not give you one.
 *
 * `api.max_rows` caps every response at 1000 rows and does it silently: no
 * error, no flag, nothing the client library surfaces. A query matching 4000
 * rows answers with 1000 and is indistinguishable from a query matching 1000,
 * and `.limit(2000)` does not raise the cap -- it lowers a lower ceiling.
 *
 * So the reads written as "select everything" were "read the first thousand
 * and believe it", and each went quietly wrong only once a workspace grew
 * past it: a touch history that stopped holding the week's breath, a set of
 * seen reviews that re-announced old reviews as new every hour, a day's token
 * usage that stopped adding up under the cap meant to bound it. Correct on
 * every small workspace, wrong on exactly the large ones.
 *
 * Executed against a fake pager, and the constant checked against the config
 * file that sets it -- a paging size that drifts from `api.max_rows` silently
 * reintroduces the whole class.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { ReadCutShort, readAllRowsByKey } from "@chanlytics/db/shared";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { readAllRows, MAX_ROWS, DEFAULT_ROW_CAP } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/shared/paged.js")).href
);

/** A table of n rows that answers a range the way PostgREST does, capped at `cap`. */
function pager(n, cap = MAX_ROWS) {
  const calls = [];
  const all = Array.from({ length: n }, (_, i) => ({ i }));
  return {
    calls,
    page: async (from, to) => {
      calls.push([from, to]);
      return { data: all.slice(from, Math.min(to + 1, from + cap)), error: null };
    },
  };
}

test("the page size is the one the server actually enforces", () => {
  // `api.max_rows` in supabase/config.toml. A paging size that drifts from it
  // silently reintroduces the whole class: too large and every page is
  // truncated, too small and the loop stops one page in believing it is done.
  assert.equal(MAX_ROWS, 1000);
});

/** What the pager wrote to the console while `run` ran: its capped line goes there under the edge's logger. */
async function logged(run) {
  const said = [];
  const err = console.error;
  console.error = (...a) => said.push(a.join(" "));
  try {
    await run();
  } finally {
    console.error = err;
  }
  return said.filter((l) => l.includes("paged_read_capped"));
}

test("a short answer is the whole answer, in one round trip", async () => {
  const p = pager(12);
  assert.equal((await readAllRows("t", p.page, "whole")).length, 12);
  assert.deepEqual(p.calls, [[0, MAX_ROWS - 1]], "nothing is asked for twice");
});

test("an answer the server truncates is read to the end", async () => {
  const p = pager(2500);
  const rows = await readAllRows("t", p.page, "whole");
  assert.equal(rows.length, 2500, "all of it, not the first thousand");
  assert.deepEqual(rows.map((r) => r.i).slice(0, 3), [0, 1, 2]);
  assert.equal(rows[2499].i, 2499, "and in order, with nothing skipped across the page boundaries");
  assert.deepEqual(p.calls, [
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
});

test("an answer exactly one page long costs one extra round trip and no rows", async () => {
  const p = pager(MAX_ROWS);
  assert.equal((await readAllRows("t", p.page, "whole")).length, MAX_ROWS);
  assert.equal(p.calls.length, 2, "a full page is indistinguishable from a truncated one: it has to ask");
});

test("a read that must be whole refuses at its cap: nothing past it is believed whole", async () => {
  const p = pager(5000);
  let refused = null;
  const lines = await logged(async () => {
    refused = await readAllRows("events", p.page, "whole", 2000).then(
      () => null,
      (e) => e,
    );
  });
  assert.ok(refused instanceof ReadCutShort, "a refusal of its own kind, which a route says in the owner's words");
  assert.equal(refused.what, "events");
  assert.equal(refused.cap, 2000);
  assert.equal(lines.length, 1, "and the platform hears of it once");
  assert.match(lines[0], /"needs":"whole"/);
  assert.ok(DEFAULT_ROW_CAP > MAX_ROWS, "the default bound is more than one page");
});

test("a read a part will do answers what it read, and says it is a part", async () => {
  const p = pager(5000);
  let read = null;
  const lines = await logged(async () => {
    read = await readAllRows("events", p.page, "part", 2000);
  });
  assert.equal(read.rows.length, 2000, "the rows up to its cap");
  assert.deepEqual(read.rows.map((r) => r.i).slice(-2), [1998, 1999]);
  assert.equal(read.capped, true, "marked, so its caller never counts from it");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /"needs":"part"/);
});

test("exactly the cap is a whole answer: one row more is asked for, and none comes", async () => {
  const p = pager(2000);
  const lines = await logged(async () => {
    assert.equal((await readAllRows("events", p.page, "whole", 2000)).length, 2000);
  });
  assert.deepEqual(p.calls.at(-1), [2000, 2000], "the one row that would say there are more");
  assert.equal(lines.length, 0, "nothing was cut, so nothing is said");
  const part = await readAllRows("events", pager(2000).page, "part", 2000);
  assert.equal(part.capped, false);
  assert.equal(part.rows.length, 2000);
});

test("a part below its cap is the whole answer, marked so", async () => {
  const read = await readAllRows("events", pager(12).page, "part");
  assert.deepEqual(read, { rows: Array.from({ length: 12 }, (_, i) => ({ i })), capped: false });
});

test("a caller that does not say what the cap means reads nothing", async () => {
  const p = pager(12);
  await assert.rejects(() => readAllRows("events", p.page), /whole or a part/);
  assert.equal(p.calls.length, 0);
});

test("the keyset reader keeps the same promise at its cap", async () => {
  const all = Array.from({ length: 30 }, (_, i) => ({ id: String(i).padStart(3, "0") }));
  const page = async (after, size) => ({
    data: all.filter((r) => after === null || r.id > after).slice(0, size),
    error: null,
  });
  await assert.rejects(
    () => readAllRowsByKey("jobs", (r) => r.id, page, "whole", 20),
    (e) => e instanceof ReadCutShort && e.what === "jobs" && e.cap === 20,
  );
  const part = await readAllRowsByKey("jobs", (r) => r.id, page, "part", 20);
  assert.equal(part.capped, true);
  assert.deepEqual(part.rows, all.slice(0, 20));
  const whole = await readAllRowsByKey("jobs", (r) => r.id, page, "whole", 30);
  assert.equal(whole.length, 30, "exactly its cap is whole");
});

test("a read error is thrown, named, and never returned as a short answer", async () => {
  await assert.rejects(
    () => readAllRows("broadcasts", async () => ({ data: null, error: { message: "statement timeout" } }), "whole"),
    /broadcasts: statement timeout/,
    "silently returning what arrived before the failure is the bug this exists to stop",
  );
});

test("it pages a real query builder, ordered so nothing repeats or is skipped", async () => {
  const rows = Array.from({ length: 1200 }, (_, i) => ({ id: String(i).padStart(5, "0"), tenant_id: "t1" }));
  const db = fakeDb({ broadcasts: rows });
  const got = await readAllRows(
    "broadcasts",
    (from, to) => db.from("sequence_batches").select("id").eq("tenant_id", "t1").order("id").range(from, to),
    "whole",
  );
  assert.equal(got.length, 1200);
  assert.equal(new Set(got.map((r) => r.id)).size, 1200, "no row twice");
});
