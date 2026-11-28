/**
 * Which of the last release's database suites run against a pull request's new schema
 * (checks/last-release-suites.mjs): the ones that say what its added migrations write, the catalog walkers left to
 * the branch's own copy, and a red argued in the description. The run itself needs a stack, and is the Database
 * workflow's; the choosing is held here, over migrations and suites made up for it and over this checkout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ROOT } from "../../_source.mjs";
import { lastReleaseSuites, reasonIn } from "../../../tooling/scripts/checks/last-release-suites.mjs";

const CLI = path.join(ROOT, "tooling/scripts/checks/last-release-suites.mjs");

const MIGRATION = "supabase/migrations/00900_a_visit_is_kept_whole.sql";
const TEXTS = {
  [MIGRATION]: `-- 00900 · A visit is kept whole.
set local lock_timeout = '3s';
create or replace function public.visit_keep(p_tenant_id uuid, p_visit jsonb default null) returns jsonb
language plpgsql as $$ begin return null; end; $$;
insert into public.job_kinds (kind) values ('visit.kept') on conflict do nothing;
`,
  "tests/visits/keep.db.test.mjs": `const { data } = await db.rpc("visit_keep", { p_tenant_id: tenant });`,
  "tests/jobs/kinds.db.test.mjs": `// every kind the ledger knows\nconst kinds = await db.from("job_kinds").select("kind");`,
  "tests/people/person.db.test.mjs": `const { data } = await db.rpc("person_keep", { p_tenant_id: tenant });`,
  "tests/partners/second-factor-catalog.db.test.mjs":
    "const doors = await sql(`select proname from pg_proc where prosecdef`);",
};
const read = (file) => TEXTS[file];
const SUITES = Object.keys(TEXTS).filter((f) => f.endsWith(".test.mjs"));

test("the last release's suites that say a function the migration writes, or a table it adds rows to, are the ones run", () => {
  const { run, left } = lastReleaseSuites([MIGRATION], SUITES, read);
  assert.deepEqual(run, [
    ["tests/visits/keep.db.test.mjs", "says visit_keep"],
    ["tests/jobs/kinds.db.test.mjs", "says job_kinds"],
  ]);
  // A suite that walks the catalog holds the whole schema to its own tree's list: the base's copy fails a new
  // function by design, so it is left to the branch's copy and said.
  assert.deepEqual(left, ["tests/partners/second-factor-catalog.db.test.mjs"]);
});

test("a change with no migration among its files chooses nothing", () => {
  assert.deepEqual(lastReleaseSuites(["packages/db/src/repositories/visits/keep.ts"], SUITES, read), {
    run: [],
    left: [],
  });
});

test("a red the migration means is argued in the description, in a line of its own", () => {
  assert.equal(
    reasonIn("What changes\n\nLast release: the base pinned visit_keep's body, which 00900 writes again\n"),
    "the base pinned visit_keep's body, which 00900 writes again",
  );
  assert.equal(
    reasonIn("- **Last release:** a rule tightened after #2800 stopped breaking it"),
    "a rule tightened after #2800 stopped breaking it",
  );
  assert.equal(reasonIn("The last release: is mentioned in a sentence, and argues nothing"), null);
  assert.equal(reasonIn("Last release:"), null);
  assert.equal(reasonIn(undefined), null);
});

test("run where no migration is added, the script says so and runs nothing; with no commits it exits 2", () => {
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
  const none = run("--list", "HEAD", "HEAD");
  assert.equal(none.status, 0, none.stderr);
  assert.match(none.stdout, /No migration is added/);
  assert.equal(run().status, 2);
});
