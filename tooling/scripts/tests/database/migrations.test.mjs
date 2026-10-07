/**
 * One version per migration, and a name that says what it does.
 *
 * The CLI keys applied migrations by the VERSION -- the digits before the first
 * underscore -- not by the filename. So two files sharing a version is not a
 * tidiness problem: a replay from zero runs the first and **skips the second in
 * silence**, and the build stays green while the statements in it never ran.
 *
 * That happened twice in one hour. Two sessions each wrote 00130; the replay
 * ran one of them, and the columns the other adds simply were not there, with
 * nothing anywhere saying so. Both sessions then noticed and both moved their
 * file to 00131, which collided again -- because a free number is only free
 * until somebody else takes it, and nothing was checking.
 *
 * This is the check. It is a source scan rather than a database test on purpose:
 * it must fail before the migration runs anywhere, in the cheapest suite there
 * is, on every branch that adds one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ledgerProblems, readFolder, readLedger } from "../../checks/migration-ledger.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIR = path.join(ROOT, "supabase", "migrations");
const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

test("every migration has a version of its own", () => {
  const byVersion = new Map();
  for (const f of files) {
    const version = f.split("_")[0];
    byVersion.set(version, [...(byVersion.get(version) ?? []), f]);
  }
  const shared = [...byVersion.entries()].filter(([, names]) => names.length > 1);
  assert.deepEqual(
    shared,
    [],
    shared.length
      ? `two migrations on one version: ${shared.map(([v, names]) => `${v} -> ${names.join(" and ")}`).join("; ")}.\n` +
          "The CLI applies by version, so one of them would be skipped in silence on the next replay. " +
          "Move the newer file to the next free number -- and take the number that is free NOW, not the one that was free when you started."
      : "",
  );
});

test("a migration is numbered and named the way the folder reads", () => {
  for (const f of files) {
    assert.match(f, /^\d{5}_[a-z0-9_]+\.sql$/, `${f}: five digits, an underscore, then lower-case words`);
    const version = f.split("_")[0];
    assert.equal(version.length, 5, `${f}: the version is the five digits before the first underscore`);
    assert.ok(f.length - version.length > 5, `${f}: the name after the number should say what the migration does`);
  }
});

test("every migration is in the ledger with the text it was recorded with, in the order production applies it", () => {
  // The ledger (supabase/migrations-ledger.json) is what production applies, in order, with each file's checksum. The
  // test this replaces compared the folder's sorted names with themselves sorted, so it could not fail: a file below
  // the head, a rename and an edit all passed it (the scorecard's defect 59). ledgerProblems names each of those; the
  // cases that plant them are in migration-ledger.test.mjs.
  const problems = ledgerProblems(readLedger(ROOT), readFolder(ROOT));
  assert.deepEqual(problems, [], problems.join(" | "));
});
