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

/**
 * The tables that take a write for every message, call, send or job: an index built the plain way holds those writes
 * for as long as the build takes, and on `messages` that is the receptionist's only memory.
 */
const BUSY_TABLES = ["messages", "events", "calls", "contacts", "broadcast_recipients", "jobs"];
/** The first migration held to it. The ones before were applied while the tables were small, and are history. */
const ONLINE_FROM = 355;

/** A migration's statements, its comments set aside: split at semicolons, which no index statement holds inside it. */
function migrationStatements(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

test("an index on a table that is always being written is built without holding its writes: CONCURRENTLY, and alone in its file", () => {
  // An index made CONCURRENTLY cannot share a transaction, and the migration runner sends a file of several statements
  // as one: so the statement is the whole file (00355 is the first). The 82 files before it that build indexes do not,
  // which the 8 October architecture review found.
  const INDEX =
    /^create\s+(?:unique\s+)?index\s+(concurrently\s+)?(?:if\s+not\s+exists\s+)?\S+\s+on\s+(?:only\s+)?(?:public\.)?"?(\w+)"?/i;
  for (const f of files) {
    if (Number(f.slice(0, 5)) < ONLINE_FROM) continue;
    const statements = migrationStatements(fs.readFileSync(path.join(DIR, f), "utf8"));
    for (const s of statements) {
      const made = INDEX.exec(s);
      if (!made || !BUSY_TABLES.includes(made[2].toLowerCase())) continue;
      assert.ok(made[1], `${f}: an index on ${made[2]} is created CONCURRENTLY, so no write waits on its build`);
      assert.equal(
        statements.length,
        1,
        `${f}: an index made CONCURRENTLY is its file's only statement (no lock_timeout beside it): it cannot share a transaction`,
      );
    }
  }
});

test("the index rule reads a migration as written: comments set aside, a plain build on a busy table named, a quiet table and an earlier file let be", () => {
  const INDEX =
    /^create\s+(?:unique\s+)?index\s+(concurrently\s+)?(?:if\s+not\s+exists\s+)?\S+\s+on\s+(?:only\s+)?(?:public\.)?"?(\w+)"?/i;
  const read = (sql) =>
    migrationStatements(sql)
      .map((s) => INDEX.exec(s))
      .filter(Boolean)
      .map((x) => [x[2], !!x[1]]);
  assert.deepEqual(
    read(
      "-- create index a on public.messages (x);\ncreate index concurrently if not exists b on public.messages (id);",
    ),
    [["messages", true]],
    "a statement in a comment is not one",
  );
  assert.deepEqual(read("set local lock_timeout = '3s';\ncreate unique index c on jobs (dedupe_key);"), [
    ["jobs", false],
  ]);
  assert.deepEqual(
    read("create index d on public.waitlist (email);"),
    [["waitlist", false]],
    "read, and no busy table",
  );
  assert.equal(migrationStatements("/* a; b */ select 1; -- c; d\n select 2;").length, 2);
});
