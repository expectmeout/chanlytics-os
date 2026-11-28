/**
 * Either deploy order, held for a function a migration writes again (checks/old-callers.mjs), each break planted and
 * caught: a migration is applied before its merge, so the code main runs meets it first, and a function re-made with
 * an argument renamed, retyped, taken away or added with no default refuses that code's call. The snapshots here are
 * written the way supabase/schema.sql writes a function; the real one is read too, whole, and the script is run
 * against this checkout's own base.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../_source.mjs";
import {
  AFTER_THE_DEPLOYS,
  arguedAfterTheDeploys,
  functionsIn,
  judgeRefused,
  refusedCalls,
  signatureOf,
  whyRefused,
} from "../../../tooling/scripts/checks/old-callers.mjs";

const CLI = path.join(ROOT, "tooling/scripts/checks/old-callers.mjs");

/** A function as the snapshot writes it. */
const fn = (head, answers = "jsonb") => `
--
-- Name: made_up; Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.${head} RETURNS ${answers}
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- a body that says create function public.not_a_function(x integer) returns void; and is no statement
  return null;
end;
$$;
`;
const KEEP = fn(
  "visit_keep(p_tenant_id uuid, p_person_id uuid, p_at timestamp with time zone, p_note text DEFAULT NULL::text)",
);
/** What a call written for `before` meets in `after`: the refusals, as sentences. */
const refusedBy = (before, after) => refusedCalls(functionsIn(before), functionsIn(after));
const why = (before, after) => refusedBy(before, after).map((r) => r.why);

test("a function is read as the snapshot writes it: its arguments in order, their defaults, and what it answers", () => {
  const [keep] = functionsIn(KEEP);
  assert.equal(
    signatureOf(keep),
    "visit_keep(p_tenant_id uuid, p_person_id uuid, p_at timestamp with time zone, p_note text)",
  );
  assert.deepEqual(
    keep.takes.map((a) => a.hasDefault),
    [false, false, false, true],
  );
  assert.deepEqual(keep.answers, { text: "jsonb", table: null });
  const [table] = functionsIn(
    fn(
      "slots_open(p_tenant_id uuid, p_days integer DEFAULT 7, OUT ignored text)",
      "TABLE(day date, taken integer, room numeric(10,2))",
    ),
  );
  assert.deepEqual(
    table.takes.map((a) => a.name),
    ["p_tenant_id", "p_days"],
    "what it takes in: an OUT argument is part of its answer",
  );
  assert.deepEqual(table.answers.table, [
    { name: "day", type: "date" },
    { name: "taken", type: "integer" },
    { name: "room", type: "numeric(10,2)" },
  ]);
  // A body that says "create function" is a string, never a second function.
  assert.equal(functionsIn(KEEP).length, 1);
});

test("a function written again as it was, or with a new argument that has a default, still takes every old call", () => {
  assert.deepEqual(refusedBy(KEEP, KEEP), []);
  const wider = fn(
    "visit_keep(p_tenant_id uuid, p_person_id uuid, p_at timestamp with time zone, p_note text DEFAULT NULL::text, p_source text DEFAULT 'page'::text)",
  );
  assert.deepEqual(refusedBy(KEEP, wider), []);
  // A function that answered nothing may answer anything: no caller read what was not there.
  assert.deepEqual(refusedBy(fn("tidy(p_tenant_id uuid)", "void"), fn("tidy(p_tenant_id uuid)", "integer")), []);
});

test("each way a re-made function refuses the call the last release makes is caught, and said", () => {
  const head = (args) => fn(`visit_keep(${args})`);
  assert.deepEqual(
    why(
      KEEP,
      head(
        "p_tenant_id uuid, p_person_id uuid, p_at timestamp with time zone, p_note text DEFAULT NULL::text, p_by uuid",
      ),
    ),
    ["it asks for p_by, which no old call gives"],
  );
  assert.deepEqual(
    why(
      KEEP,
      head("p_tenant_id uuid, p_contact_id uuid, p_at timestamp with time zone, p_note text DEFAULT NULL::text"),
    ),
    ["its second argument is p_contact_id where it was p_person_id"],
  );
  assert.deepEqual(why(KEEP, head("p_tenant_id uuid, p_person_id uuid, p_at date, p_note text DEFAULT NULL::text")), [
    "p_at is date where it was timestamp with time zone",
  ]);
  assert.deepEqual(why(KEEP, head("p_tenant_id uuid, p_person_id uuid, p_at timestamp with time zone")), [
    "it no longer takes p_note",
  ]);
  assert.deepEqual(why(KEEP, head("p_tenant_id uuid, p_person_id uuid, p_at timestamp with time zone, p_note text")), [
    "p_note must be given now, where it had a default",
  ]);
  assert.deepEqual(
    why(
      KEEP,
      fn(
        "visit_keep(p_tenant_id uuid, p_person_id uuid, p_at timestamp with time zone, p_note text DEFAULT NULL::text)",
        "uuid",
      ),
    ),
    ["it answers uuid where it answered jsonb"],
  );
  assert.deepEqual(why(KEEP, fn("another(p_tenant_id uuid)")), ["it is gone"]);
});

test("a table's answer keeps every column it had; a new column beside them breaks no reader", () => {
  const was = fn("slots_open(p_tenant_id uuid)", "TABLE(day date, taken integer)");
  assert.deepEqual(
    refusedBy(was, fn("slots_open(p_tenant_id uuid)", "TABLE(day date, taken integer, room integer)")),
    [],
  );
  assert.deepEqual(why(was, fn("slots_open(p_tenant_id uuid)", "TABLE(day date)")), [
    "its answer lost the column taken",
  ]);
  assert.deepEqual(why(was, fn("slots_open(p_tenant_id uuid)", "TABLE(day date, taken bigint)")), [
    "its answer's taken is bigint where it was integer",
  ]);
  assert.deepEqual(why(was, fn("slots_open(p_tenant_id uuid)", "jsonb")), [
    "it answers jsonb where it answered a table",
  ]);
});

test("the old function kept beside the new one answers for it: that is how a door changes its arguments", () => {
  const both = KEEP + fn("visit_keep(p_tenant_id uuid, p_visit jsonb)");
  assert.deepEqual(refusedBy(KEEP, both), []);
  // And the new one alone refuses the old call, said by the function of its name.
  assert.equal(
    whyRefused(functionsIn(KEEP)[0], functionsIn(both)[1]),
    "its second argument is p_visit where it was p_person_id",
  );
  assert.equal(refusedBy(KEEP, fn("visit_keep(p_tenant_id uuid, p_visit jsonb)")).length, 1);
});

test("a break fails only where the last release's code still calls it, and a change that follows the code is argued in its migration", () => {
  const refused = refusedBy(KEEP + fn("old_door(p_id uuid)"), fn("visit_keep(p_tenant_id uuid, p_visit jsonb)"));
  assert.deepEqual(
    refused.map((r) => r.name),
    ["visit_keep", "old_door"],
  );
  const callersOf = (name) =>
    name === "visit_keep" ? ["packages/db/src/repositories/visits/keep.ts", "apps/edge/lib/visits/keep.ts"] : [];
  const judged = judgeRefused(refused, callersOf);
  assert.equal(judged.problems.length, 1);
  assert.match(
    judged.problems[0],
    /^visit_keep\(p_tenant_id uuid, p_person_id uuid, .*: its second argument is p_visit/,
  );
  assert.match(
    judged.problems[0],
    /the code main runs today still calls it \(packages\/db\/src\/repositories\/visits\/keep\.ts and 1 more\)/,
  );
  assert.match(judged.problems[0], /Deploy order: after the deploys/);
  assert.match(judged.problems[0], /Apply a migration, step 5/);
  assert.equal(judged.notes.length, 1);
  assert.match(judged.notes[0], /^old_door\(p_id uuid\): it is gone, and no code on the base names it/);

  // The migration that makes the change says it is applied after both apps deploy: said, and not a failure.
  const migration = `-- 00900 · A visit is kept whole.\n--\n-- Deploy order: after the deploys. The page stopped calling the four-argument door in #2800.\nset local lock_timeout = '3s';\ndrop function public.visit_keep(uuid, uuid, timestamptz, text);\n`;
  assert.match(migration, AFTER_THE_DEPLOYS);
  const argued = judgeRefused(refused, callersOf, arguedAfterTheDeploys([migration]));
  assert.deepEqual(argued.problems, []);
  assert.match(argued.notes[0], /applied after the deploys/);
  // A migration that says the usual order argues nothing, whatever it names.
  const first = migration.replace("after the deploys", "this migration first");
  assert.equal(judgeRefused(refused, callersOf, arguedAfterTheDeploys([first])).problems.length, 1);
});

test("the real snapshot is read whole: every function it creates, and each takes its own call", () => {
  const sql = fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8");
  const functions = functionsIn(sql);
  const written = sql.match(/^CREATE FUNCTION public\./gm).length;
  assert.ok(written > 500, "the snapshot holds the schema's functions");
  assert.equal(functions.length, written, "a function the reader skipped would never be held");
  assert.deepEqual(refusedCalls(functions, functions), []);
  const head = functions.find((f) => f.name === "migration_head");
  assert.deepEqual(head.answers.table, [
    { name: "head", type: "text" },
    { name: "applied", type: "integer" },
  ]);
});

test("run against a ref, the script exits 0 where every call lands and 2 where the ref is unknown", () => {
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
  const held = run("--base", "HEAD");
  assert.equal(held.status, 0, held.stderr);
  assert.match(held.stdout, /old callers against HEAD: /);
  assert.equal(run("--base", "no-such-ref").status, 2);
  assert.equal(run().status, 2);
});
