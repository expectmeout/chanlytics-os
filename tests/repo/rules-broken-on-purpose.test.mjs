/**
 * The rules broken on purpose (tooling/scripts/checks/break-rules.mjs), held to the tree with nothing broken.
 *
 * The script takes one line out of the code or the database, runs the tests named beside it and expects red. It runs
 * weekly and on a label, never on a push, so between two runs a refactor could move a rule's line and the script would
 * break nothing and prove nothing. This runs on every pull request and breaks nothing: each rule's line stands exactly
 * once where the list says it is, each test it names is there, and the rules the plan began with are all on it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BREAKS, functionAgain, listProblems } from "../../tooling/scripts/checks/break-rules.mjs";

test("every rule's line stands once where the list says, and every test it names is there", () => {
  assert.deepEqual(
    listProblems(),
    [],
    "a rule's line moved or its test was renamed: say in BREAKS (tooling/scripts/checks/break-rules.mjs) where the line is now, " +
      "then run `node tooling/scripts/checks/break-rules.mjs --run <name>` to see its tests still go red without it",
  );
});

test("the rules the plan began with are on the list, and one more for each area that sends or deletes", () => {
  const names = BREAKS.map((b) => b.name);
  for (const name of [
    "a-door-asks-about-its-workspace",
    "an-event-is-relayed-once",
    "the-shelf-is-asked-before-a-copy-goes",
    "a-post-goes-only-as-approved",
    "stop-everything-at-the-send-door",
  ])
    assert.ok(names.includes(name), `${name} is one of the five the plan named`);
  assert.ok(names.length >= 10, `and the areas' own (${names.length} rules)`);
  assert.equal(new Set(names).size, names.length, "each named once");
});

test("the list refuses a line that is gone, a line that stands twice, and a test that is not there", () => {
  const [first] = BREAKS;
  const said = (b) => listProblems([b]).join("\n");
  assert.match(said({ ...first, find: "a line nobody wrote" }), /stands 0 times/);
  assert.match(said({ ...first, find: "\n" }), /stands \d+ times/);
  assert.match(said({ ...first, tests: ["tests/no/such.test.mjs"] }), /is gone/);
  assert.match(said({ ...first, put: first.find }), /are the same/);
});

test("a database rule's function is made again from the snapshot as it stands, whole", () => {
  const snapshot = [
    "CREATE FUNCTION public.one(p_a uuid) RETURNS boolean",
    "    LANGUAGE plpgsql SECURITY DEFINER",
    "    SET search_path TO 'public'",
    "    AS $$",
    "begin",
    "  return true;",
    "end $$;",
    "",
    "CREATE FUNCTION public.two() RETURNS integer",
    "    LANGUAGE sql",
    "    AS $_$ select 2 $_$;",
    "",
  ].join("\n");
  const one = functionAgain(snapshot, "one");
  assert.match(one, /^CREATE OR REPLACE FUNCTION public\.one\(p_a uuid\) RETURNS boolean\n/);
  assert.ok(one.trimEnd().endsWith("end $$;"), "to its own closing quote, and no further");
  assert.ok(!one.includes("public.two"), "never into the next function");
  assert.match(functionAgain(snapshot, "two"), /select 2 \$_\$;\n$/);
  assert.equal(functionAgain(snapshot, "three"), null, "one that is not there is none");
});
