/**
 * The push held to the ledger: checks/migration-push.mjs, run.
 *
 * migrate.yml reads production's ledger with its names, asks the CLI what a push would apply, and hands both to this
 * script before the push is made. Each case is a way the push went wrong by hand in October 2026, or could: a number
 * two migrations took, a version production applied from a branch that never landed, a file numbered below
 * production's head, a dry run that lists more or less than main's files production lacks. And the script whole, over
 * the real folder, as the workflow runs it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "../../_source.mjs";
import { checksum, parseProductionLedger, readFolder } from "../../../checks/migration-ledger.mjs";
import { pendingOf, pushProblems } from "../../../checks/migration-push.mjs";

/** A folder as readFolder returns it, from file names (the text is not the point here). */
const folderOf = (...files) => files.map((file) => ({ file, version: file.split("_")[0], sha256: checksum(file) }));
/** Production's ledger as parseProductionLedger returns it, from [version, name] pairs. */
const productionOf = (...rows) => new Map(rows.map(([version, name = null]) => [version, name]));

const folder = folderOf("00001_a_first.sql", "00002_a_second.sql", "00003_a_third.sql");
const said = (problems, words) => problems.some((p) => p.includes(words));

test("the dry run's list is read as the CLI prints it: a bullet and a name a line, with or without a path or a terminal's codes", () => {
  const printed = [
    "DRY RUN: migrations will *not* be pushed to the database.",
    "Connecting to remote database...",
    "Would push these migrations:",
    " • 00002_a_second.sql",
    " • \u001b[1m00003_a_third.sql\u001b[0m",
    "",
  ].join("\n");
  assert.deepEqual(pendingOf(printed), ["00002_a_second.sql", "00003_a_third.sql"]);
  assert.deepEqual(pendingOf("supabase/migrations/00004_a_fourth.sql\r\n- 00005_a_fifth.sql\n"), [
    "00004_a_fourth.sql",
    "00005_a_fifth.sql",
  ]);
  assert.deepEqual(pendingOf("Remote database is up to date.\n"), [], "nothing to push lists nothing");
  assert.deepEqual(pendingOf("Skipping 00002_a_second.sql"), [], "a sentence that ends in a name is not a listing");
  assert.deepEqual(pendingOf(""), []);
});

test("a push that would apply exactly main's files production lacks, in order, has no problem; and none to push is no problem", () => {
  const production = productionOf(["00001", "a_first"]);
  assert.deepEqual(pushProblems({ folder, production, pending: ["00002_a_second.sql", "00003_a_third.sql"] }), []);
  assert.deepEqual(
    pushProblems({ folder, production: productionOf(["00001"], ["00002"], ["00003"]), pending: [] }),
    [],
    "versions alone, nothing lacking",
  );
});

test("a version production applied under another name than main's file is a clash, and nothing is pushed over it", () => {
  // Two sessions took 00002: production ran one branch's, main landed the other's.
  const production = productionOf(["00001", "a_first"], ["00002", "a_branchs_own"]);
  const problems = pushProblems({ folder, production, pending: ["00003_a_third.sql"] });
  assert.ok(
    said(problems, "00002 is applied in production as a_branchs_own, and main carries it as 00002_a_second.sql"),
    problems.join(" | "),
  );
});

test("a version production holds that main does not carry, and a file below production's head, each stop the push", () => {
  const ahead = pushProblems({
    folder,
    production: productionOf(["00001"], ["00002"], ["00003"], ["00009", "a_branchs_own"]),
    pending: [],
  });
  assert.ok(said(ahead, "production has applied 00009, which main does not carry"), ahead.join(" | "));
  const below = pushProblems({
    folder,
    production: productionOf(["00001"], ["00003"]),
    pending: ["00002_a_second.sql"],
  });
  assert.ok(said(below, "00002_a_second.sql is numbered at or below production's head, 00003"), below.join(" | "));
});

test("a dry run that lists a file production has, one main lacks, or leaves out one production lacks, is refused", () => {
  const production = productionOf(["00001"], ["00002"]);
  const extra = pushProblems({ folder, production, pending: ["00002_a_second.sql", "00003_a_third.sql"] });
  assert.ok(
    said(extra, "the dry run would push 00002_a_second.sql, which production has already applied"),
    extra.join(" | "),
  );
  const strange = pushProblems({ folder, production, pending: ["00003_a_third.sql", "00007_elsewhere.sql"] });
  assert.ok(
    said(strange, "the dry run would push 00007_elsewhere.sql, which main does not carry"),
    strange.join(" | "),
  );
  const missing = pushProblems({ folder, production, pending: [] });
  assert.ok(
    said(missing, "the dry run leaves out 00003_a_third.sql, which main carries and production lacks"),
    missing.join(" | "),
  );
  const disorder = pushProblems({
    folder,
    production: productionOf(["00001"]),
    pending: ["00003_a_third.sql", "00002_a_second.sql"],
  });
  assert.ok(said(disorder, "the dry run lists the files in another order than main's"), disorder.join(" | "));
});

/** The script as the workflow runs it: the dry run's text and production's ledger in files. */
function runPush(dryRun, production) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "push-"));
  const dryRunFile = path.join(dir, "dry-run.txt");
  const productionFile = path.join(dir, "prod-ledger.json");
  fs.writeFileSync(dryRunFile, dryRun);
  fs.writeFileSync(productionFile, production);
  const r = spawnSync(
    process.execPath,
    ["tooling/scripts/checks/migration-push.mjs", "--dry-run", dryRunFile, "--production", productionFile],
    { cwd: ROOT, encoding: "utf8" },
  );
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

test("the script exits 0 and names the files when the dry run is exactly what production lacks, 1 when it is not, 2 when an input cannot be read", () => {
  // Production's ledger as `supabase db query -o json` answers `select version, name …`: every file but the last.
  const real = readFolder(ROOT);
  const rows = (ms) => JSON.stringify(ms.map((m) => ({ version: m.version, name: m.file.slice(6, -4) })));
  const last = real.at(-1).file;
  const lacking = rows(real.slice(0, -1));
  const ok = runPush(`Would push these migrations:\n • ${last}\n`, lacking);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, new RegExp(`The push applies 1 migration main carries and production lacks:\\n- ${last}`));
  assert.deepEqual([...parseProductionLedger(lacking).values()].slice(0, 1), [real[0].file.slice(6, -4)]);
  const none = runPush("Remote database is up to date.\n", rows(real));
  assert.equal(none.status, 0, none.stdout + none.stderr);
  assert.match(none.stdout, /nothing to push/);
  const short = runPush("Remote database is up to date.\n", lacking);
  assert.equal(short.status, 1, short.stdout + short.stderr);
  assert.match(short.stderr, new RegExp(`the dry run leaves out ${last}`));
  assert.match(short.stdout, /nothing is pushed/);
  const clash = runPush(
    `Would push these migrations:\n • ${last}\n`,
    JSON.stringify([
      ...real.slice(0, -2).map((m) => ({ version: m.version, name: m.file.slice(6, -4) })),
      { version: real.at(-2).version, name: "a_branchs_own" },
    ]),
  );
  assert.equal(clash.status, 1, clash.stdout + clash.stderr);
  assert.match(clash.stderr, new RegExp(`${real.at(-2).version} is applied in production as a_branchs_own`));
  const unreadable = runPush("Would push these migrations:\n", "Cannot connect to the database\n");
  assert.equal(unreadable.status, 2);
  assert.match(unreadable.stderr, /Could not read production's ledger/);
});
