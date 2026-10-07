/**
 * The moments fill (tooling/scripts/ops/person-moments-fill.mjs, 00259): the script's own steps, over a double of the
 * database that answers as PostgREST does. The check and the fill each walk a workspace a batch at a time, the next
 * starting after the last person of the one before, until a batch comes back short; the check keeps only the people
 * who are not whole; the backup is every row of the workspace, a line each, read a thousand at a time; and a failure
 * says which workspace, and after whom.
 * What the functions do on a real database is person-moments.db.test.mjs's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BATCH,
  backupWorkspace,
  checkWorkspace,
  everyRow,
  fillWorkspace,
  tally,
} from "../../../ops/person-moments-fill.mjs";

const W = "00000000-0000-4000-8000-0000000e0a00";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A database of `people` in W, each whole unless `owed` names them; it records every call it answers. */
function world({ people, owed = {}, failAt = null }) {
  const calls = [];
  const ids = Array.from({ length: people }, (_, i) => id(i + 1));
  const next = (after, limit) => ids.filter((x) => after == null || x > after).slice(0, limit);
  const db = {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      if (failAt && name === failAt.name && args.p_after === failAt.after)
        return { data: null, error: { message: "canceling statement due to statement timeout" } };
      if (name === "person_moments_check") {
        return {
          data: next(args.p_after, args.p_limit).map((x) => ({ contact_id: x, what: owed[x] ?? "whole" })),
          error: null,
        };
      }
      if (name === "person_moments_fill") {
        const batch = next(args.p_after, args.p_limit);
        return { data: [{ filled: batch.length, last_contact_id: batch.at(-1) ?? null }], error: null };
      }
      throw new Error(`no such function: ${name}`);
    },
    from(table) {
      const q = { table, filters: [] };
      const b = {
        select: (cols) => ((q.cols = cols), b),
        eq: (col, v) => (q.filters.push([col, v]), b),
        order: (col, o) => ((q.order = [col, o]), b),
        range: async (from, to) => {
          calls.push({ name: `from:${table}`, args: { ...q, from, to } });
          const rows = ids.map((x) => ({ contact_id: x, tenant_id: W, moved_in: false }));
          return { data: rows.slice(from, to + 1), error: null };
        },
      };
      return b;
    },
  };
  return db;
}

test("a check names who has no row and who is not whole, and nobody else", () => {
  assert.deepEqual(tally([{ what: "missing" }, { what: "differs" }, { what: "missing" }, { what: "something new" }]), {
    missing: 2,
    differs: 1,
    other: 1,
  });
  assert.deepEqual(tally([]), { missing: 0, differs: 0, other: 0 });
  assert.deepEqual(tally(null), { missing: 0, differs: 0, other: 0 });
});

test("the check walks a workspace a batch at a time, each after the last person of the one before, and keeps the people not whole", async () => {
  const db = world({ people: 7, owed: { [id(2)]: "missing", [id(6)]: "differs" } });
  const notWhole = await checkWorkspace(db, W, 3);
  assert.deepEqual(notWhole, [
    { contact_id: id(2), what: "missing" },
    { contact_id: id(6), what: "differs" },
  ]);
  assert.deepEqual(
    db.calls.map((c) => [c.args.p_after, c.args.p_limit]),
    [
      [null, 3],
      [id(3), 3],
      [id(6), 3],
    ],
    "three batches: the last one short, so the walk ends",
  );
  // A workspace that is a batch exactly: one more call, which answers nobody.
  const even = world({ people: 6 });
  assert.deepEqual(await checkWorkspace(even, W, 3), []);
  assert.equal(even.calls.length, 3);
});

test("the fill walks a workspace until a batch answers no last person, and says how many", async () => {
  const db = world({ people: 7 });
  assert.deepEqual(await fillWorkspace(db, W, 3), { filled: 7, batches: 4 });
  assert.deepEqual(
    db.calls.map((c) => [c.name, c.args.p_tenant_id, c.args.p_after, c.args.p_limit]),
    [
      ["person_moments_fill", W, null, 3],
      ["person_moments_fill", W, id(3), 3],
      ["person_moments_fill", W, id(6), 3],
      ["person_moments_fill", W, id(7), 3],
    ],
  );
  const empty = world({ people: 0 });
  assert.deepEqual(await fillWorkspace(empty, W, 3), { filled: 0, batches: 1 }, "a workspace with nobody: one call");
  assert.equal(BATCH, 300, "a few hundred people a transaction, as 0021 says");
});

test("a batch that fails stops the walk and says which workspace, and after whom", async () => {
  const db = world({ people: 7, failAt: { name: "person_moments_fill", after: id(3) } });
  await assert.rejects(() => fillWorkspace(db, W, 3), new RegExp(`fill ${W} after ${id(3)}: canceling statement`));
  const first = world({ people: 7, failAt: { name: "person_moments_check", after: null } });
  await assert.rejects(() => checkWorkspace(first, W, 3), new RegExp(`check ${W} after the first person`));
});

test("the backup is every row of the workspace, a line each, read a thousand at a time in the rows' order", async () => {
  const db = world({ people: 2150 });
  const lines = [];
  assert.equal(await backupWorkspace(db, W, (l) => lines.push(l)), 2150);
  assert.equal(lines.length, 2150);
  assert.deepEqual(JSON.parse(lines[0]), { person_moments: { contact_id: id(1), tenant_id: W, moved_in: false } });
  const reads = db.calls.filter((c) => c.name === "from:person_moments");
  assert.deepEqual(
    reads.map((r) => [r.args.from, r.args.to]),
    [
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ],
  );
  assert.deepEqual(reads[0].args.filters, [["tenant_id", W]]);
  assert.deepEqual(reads[0].args.order, ["contact_id", { ascending: true }]);
});

test("a read that fails is said, not taken for an empty page", async () => {
  await assert.rejects(
    () => everyRow(async () => ({ data: null, error: { message: "permission denied for table person_moments" } })),
    /permission denied/,
  );
});
