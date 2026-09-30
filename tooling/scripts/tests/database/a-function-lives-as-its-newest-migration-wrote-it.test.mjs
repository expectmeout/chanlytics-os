/**
 * A function defined in more than one migration lives as the newest one wrote it, and supabase/schema.sql says so.
 *
 * `create or replace function` in a later migration is the only way SQL changes a rule, so a function's live body is
 * whichever file came last, and `people_list` alone has been rewritten many times over. The snapshot is the replay's own word on
 * what is live. This reads the migrations in the order the CLI applies them (number order, statement by statement),
 * keeps each function's newest definition and forgets what a later `drop function` drops, and holds the snapshot to
 * the result: a redefined function's body there is its newest migration's, and one its newest migration dropped is not
 * there at all. Either failing means the dump and the migrations disagree: a snapshot taken from a stack that ran
 * something the migrations do not say (a branch's migration applied by hand), or a stale one.
 *
 * A function is told apart as Postgres tells it apart, by its name and the types it takes in, so an overload is its
 * own function. Bodies are compared with their blanks folded, since the tag around a body (`$$`, `$_$`) is not part
 * of it. Data files only: the migrations and the snapshot, read and parsed; nothing here reads code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OUT, functionChangesIn } from "../../gen/schema-snapshot.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIR = path.join(ROOT, "supabase", "migrations");
const read = (file) => fs.readFileSync(file, "utf8").split("\r\n").join("\n");
const folded = (body) => (body ?? "").replace(/\s+/g, " ").trim();

/**
 * The migrations replayed on paper: each function identity that stands at the end with its newest definition and
 * the file that wrote it, and every name with the migrations that define it.
 */
function replayed() {
  const live = new Map();
  const definedIn = new Map();
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    for (const change of functionChangesIn(read(path.join(DIR, file)))) {
      if (change.kind === "create") {
        live.set(change.identity, { ...change, file });
        definedIn.set(change.name, new Set([...(definedIn.get(change.name) ?? []), file]));
      } else if (change.identity.endsWith("(*)")) {
        for (const identity of [...live.keys()]) if (identity.startsWith(`${change.name}(`)) live.delete(identity);
      } else {
        live.delete(change.identity);
      }
    }
  }
  return { live, definedIn };
}

const { live, definedIn } = replayed();
const redefined = new Set([...definedIn].filter(([, files]) => files.size > 1).map(([name]) => name));
const snapshot = new Map(
  functionChangesIn(read(path.join(ROOT, OUT)))
    .filter((c) => c.kind === "create")
    .map((c) => [c.identity, c]),
);

test("the migrations and the snapshot both read as functions", () => {
  // A parser that finds nothing would pass every assertion below.
  assert.ok(definedIn.size > 200, `only ${definedIn.size} functions found across the migrations`);
  assert.ok(redefined.size > 50, `only ${redefined.size} functions defined in more than one migration`);
  assert.ok(snapshot.size > 200, `only ${snapshot.size} functions found in ${OUT}`);
});

test("a function more than one migration defines is in the snapshot with its newest migration's body", () => {
  const wrong = [];
  for (const [identity, newest] of live) {
    if (!redefined.has(newest.name)) continue;
    const dumped = snapshot.get(identity);
    if (!dumped) wrong.push(`${identity}: ${newest.file} defines it last, and ${OUT} has no such function`);
    else if (folded(dumped.body) !== folded(newest.body)) {
      wrong.push(`${identity}: ${OUT} holds a body that is not ${newest.file}'s`);
    }
  }
  assert.deepEqual(wrong, [], `regenerate the snapshot from a stack replayed from these migrations alone`);
});

test("the snapshot holds no function the migrations drop or never define", () => {
  const standing = [...snapshot.keys()].filter((identity) => !live.has(identity));
  assert.deepEqual(
    standing,
    [],
    "the snapshot holds functions no migration leaves standing: a stack that ran SQL the migrations do not, or a stale file",
  );
});
