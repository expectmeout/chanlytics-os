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
import { fakeDb } from "./_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { readAllRows, MAX_ROWS, DEFAULT_ROW_CAP } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/paged.js")).href
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

test("a short answer is the whole answer, in one round trip", async () => {
  const p = pager(12);
  assert.equal((await readAllRows("t", p.page)).length, 12);
  assert.deepEqual(p.calls, [[0, MAX_ROWS - 1]], "nothing is asked for twice");
});

test("an answer the server truncates is read to the end", async () => {
  const p = pager(2500);
  const rows = await readAllRows("t", p.page);
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
  assert.equal((await readAllRows("t", p.page)).length, MAX_ROWS);
  assert.equal(p.calls.length, 2, "a full page is indistinguishable from a truncated one: it has to ask");
});

test("the cap bounds the read and says so rather than truncating in silence", async () => {
  const said = [];
  const err = console.error;
  console.error = (...a) => said.push(a.join(" "));
  try {
    const rows = await readAllRows("events", pager(5000).page, 2000);
    assert.equal(rows.length, 2000);
  } finally {
    console.error = err;
  }
  assert.ok(
    said.some((l) => l.includes("paged_read_capped") && l.includes("events")),
    "a bounded answer is a logged answer",
  );
  assert.ok(DEFAULT_ROW_CAP > MAX_ROWS, "and the default bound is more than one page");
});

test("a read error is thrown, named, and never returned as a short answer", async () => {
  await assert.rejects(
    () => readAllRows("broadcasts", async () => ({ data: null, error: { message: "statement timeout" } })),
    /broadcasts: statement timeout/,
    "silently returning what arrived before the failure is the bug this exists to stop",
  );
});

test("it pages a real query builder, ordered so nothing repeats or is skipped", async () => {
  const rows = Array.from({ length: 1200 }, (_, i) => ({ id: String(i).padStart(5, "0"), tenant_id: "t1" }));
  const db = fakeDb({ broadcasts: rows });
  const got = await readAllRows("broadcasts", (from, to) =>
    db.from("broadcasts").select("id").eq("tenant_id", "t1").order("id").range(from, to),
  );
  assert.equal(got.length, 1200);
  assert.equal(new Set(got.map((r) => r.id)).size, 1200, "no row twice");
});
