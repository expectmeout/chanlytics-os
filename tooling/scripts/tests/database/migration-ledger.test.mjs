/**
 * The migration ledger's rules, planted and caught: checks/migration-ledger.mjs, run.
 *
 * migrations.test.mjs holds the real folder to the real ledger; this holds the rules themselves, over folders made
 * here. Each case is one of the ways production drifted from main (the scorecard's defect 59): an applied file edited,
 * renamed or deleted, a file numbered below the head, a gap nobody explained. main's own test passed all of them. And
 * the comparison with production's ledger, read the three ways it arrives, run as the release step and the weekly
 * workflow run it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import {
  checksum,
  compare,
  compareReport,
  headOf,
  ledgerProblems,
  parseProductionLedger,
  readFolder,
  record,
} from "../../checks/migration-ledger.mjs";

/** A folder as readFolder returns it, from [file, text] pairs. */
const folderOf = (...files) =>
  files.map(([file, text]) => ({ file, version: file.split("_")[0], sha256: checksum(text) }));
/** A ledger that recorded these files, in this order, with these gaps argued. */
const ledgerOf = (folder, gaps = {}) => ({
  gaps,
  migrations: Object.fromEntries(folder.map((m) => [m.file, m.sha256])),
});

const A = ["00001_a_first.sql", "create table a ();\n"];
const B = ["00002_a_second.sql", "create table b ();\n"];
const C = ["00003_a_third.sql", "create table c ();\n"];
const base = folderOf(A, B, C);
const said = (problems, words) => problems.some((p) => p.includes(words));

test("a folder that is what the ledger recorded holds", () => {
  assert.deepEqual(ledgerProblems(ledgerOf(base), base), []);
});

test("a line ending is not an edit: a Windows checkout hashes as CI does", () => {
  assert.equal(checksum("create table a ();\r\n"), checksum("create table a ();\n"));
  assert.notEqual(checksum("create table a ( );\n"), checksum("create table a ();\n"));
});

test("an applied file edited after it was recorded is refused", () => {
  const edited = folderOf(A, ["00002_a_second.sql", "create table b (id int);\n"], C);
  const problems = ledgerProblems(ledgerOf(base), edited);
  assert.ok(said(problems, "00002_a_second.sql changed after it was recorded"), problems.join(" | "));
});

test("an applied file renamed is refused, and named with its new name", () => {
  const renamed = folderOf(A, ["00002_a_second_renamed.sql", B[1]], C);
  const problems = ledgerProblems(ledgerOf(base), renamed);
  assert.ok(said(problems, "00002_a_second.sql was renamed to 00002_a_second_renamed.sql"), problems.join(" | "));
});

test("an applied file deleted is refused", () => {
  const problems = ledgerProblems(ledgerOf(base), folderOf(A, C));
  assert.ok(said(problems, "00002_a_second.sql is recorded and gone"), problems.join(" | "));
});

test("a new file numbered at or below the head is refused, and told the head to go above", () => {
  // 00241 and 00242 merged below main's head and went to production with --include-all (#1325, #1329).
  const ledger = ledgerOf(folderOf(A, C), { "00002": "a number another branch took" });
  const problems = ledgerProblems(ledger, folderOf(A, B, C));
  assert.ok(
    said(problems, "00002_a_second.sql is numbered at or below the ledger's head, 00003"),
    problems.join(" | "),
  );
});

test("a new file above the head is asked to be recorded, and recording it holds", () => {
  const D = ["00004_a_fourth.sql", "create table d ();\n"];
  const folder = folderOf(A, B, C, D);
  assert.ok(said(ledgerProblems(ledgerOf(base), folder), "00004_a_fourth.sql is not in the ledger: run"));
  const { ledger, recorded, refused } = record(ledgerOf(base), folder);
  assert.deepEqual([recorded, refused], [["00004_a_fourth.sql"], []]);
  assert.deepEqual(ledgerProblems(ledger, folder), []);
  assert.deepEqual(
    Object.keys(ledger.migrations).at(-1),
    "00004_a_fourth.sql",
    "appended: the ledger is the apply order",
  );
});

test("recording refuses a file below the head, and never rewrites an entry main holds", () => {
  const ledger = ledgerOf(folderOf(A, C), { "00002": "a number another branch took" });
  const landed = new Set(["00001_a_first.sql", "00003_a_third.sql"]);
  const edited = folderOf(["00001_a_first.sql", "changed\n"], B, C);
  const out = record(ledger, edited, landed);
  assert.deepEqual(out.recorded, []);
  assert.match(out.refused[0], /^00002_a_second\.sql: at or below the head, 00003/);
  assert.equal(
    out.ledger.migrations["00001_a_first.sql"],
    checksum(A[1]),
    "main's entry kept, so the edit still fails",
  );
  assert.ok(said(ledgerProblems(out.ledger, edited), "00001_a_first.sql changed after it was recorded"));
});

test("recording takes back a file this branch added and renumbered before it landed", () => {
  // The controller renumbers a lane's migration at landing: the branch's own entry is not applied anywhere yet.
  const own = ["00009_mine.sql", "create table m ();\n"];
  const ledger = ledgerOf(folderOf(A, B, C, own), { ...gapsBetween(4, 8) });
  const moved = folderOf(A, B, C, ["00004_mine.sql", own[1]]);
  const out = record(ledger, moved, new Set([A[0], B[0], C[0]]));
  assert.deepEqual(out.recorded, ["00004_mine.sql"]);
  assert.equal("00009_mine.sql" in out.ledger.migrations, false, "the old number is gone from the ledger");
  assert.deepEqual(out.droppedGaps, ["00004", "00005", "00006", "00007", "00008"], "the reserved numbers are let go");
  assert.deepEqual(out.ledger.gaps, {});
  assert.deepEqual(ledgerProblems(out.ledger, moved), [], "and nothing is left to argue: recording is enough");
});

test("recording keeps a gap that is still below the head and still empty", () => {
  const ledger = ledgerOf(folderOf(A, C), { "00002": "a number another branch took" });
  const D = ["00005_a_fifth.sql", "create table e ();\n"];
  const out = record(ledger, folderOf(A, C, D));
  assert.deepEqual(out.recorded, ["00005_a_fifth.sql"]);
  assert.deepEqual(out.droppedGaps, []);
  assert.deepEqual(Object.keys(out.ledger.gaps), ["00002"]);
});

/** Gaps argued for every version from `from` to `to`. */
function gapsBetween(from, to) {
  const gaps = {};
  for (let v = from; v <= to; v++) gaps[String(v).padStart(5, "0")] = "planted";
  return gaps;
}

test("the recorded order is the apply order: a version recorded after a higher one is refused", () => {
  const ledger = { gaps: {}, migrations: { [A[0]]: checksum(A[1]), [C[0]]: checksum(C[1]), [B[0]]: checksum(B[1]) } };
  const problems = ledgerProblems(ledger, base);
  assert.ok(said(problems, "00002_a_second.sql is recorded after 00003"), problems.join(" | "));
});

test("a gap below the head needs its reason, and a reason for a gap that is gone is stale", () => {
  const folder = folderOf(A, C);
  assert.ok(said(ledgerProblems(ledgerOf(folder), folder), "00002 is a gap below the head with no reason"));
  assert.deepEqual(ledgerProblems(ledgerOf(folder, { "00002": "renumbered" }), folder), []);
  assert.ok(
    said(
      ledgerProblems(ledgerOf(base, { "00002": "renumbered" }), base),
      "00002 is argued as a gap and has a migration",
    ),
  );
  assert.ok(
    said(
      ledgerProblems(ledgerOf(base, { "00007": "reserved" }), base),
      "00007 is argued as a gap and is not below the head",
    ),
  );
  assert.equal(headOf(ledgerOf(base)), 3);
});

test("production's ledger is read as the CLI prints it, one version a line, or a JSON array", () => {
  const cli = [
    "",
    "   Local          | Remote         | Time (UTC)          ",
    "  ----------------|----------------|---------------------",
    "   00001          | 00001          | 00001               ",
    "   00002          |                | 00002               ",
    "                  | 00009          | 00009               ",
    "",
  ].join("\n");
  assert.deepEqual([...parseProductionLedger(cli)], ["00001", "00009"], "the Remote column");
  assert.deepEqual([...parseProductionLedger("00001\r\n00002\n")], ["00001", "00002"]);
  assert.deepEqual([...parseProductionLedger('["00001","00003"]')], ["00001", "00003"]);
  assert.throws(() => parseProductionLedger("Connecting to remote database...\n"), /no version/);
});

test("the comparison says what production lacks, how long main has held it, and what production holds that main does not", () => {
  const gap = compare(base, new Set(["00001", "00003", "00009"]));
  assert.deepEqual(gap, { mainAhead: ["00002_a_second.sql"], productionAhead: ["00009"] });
  const young = compareReport({ mainAhead: ["00002_a_second.sql"], productionAhead: [] }, () => 3, 24);
  assert.equal(young.alarm, false, "a merge applied within the day is not an alarm");
  assert.match(young.lines.join("\n"), /00002_a_second\.sql: on main for 3 h, under 24 h/);
  assert.equal(compareReport({ mainAhead: ["00002_a_second.sql"], productionAhead: [] }, () => 30, 24).alarm, true);
  assert.equal(compareReport({ mainAhead: ["00002_a_second.sql"], productionAhead: [] }, () => null, 24).alarm, true);
  assert.equal(compareReport({ mainAhead: [], productionAhead: ["00009"] }, () => 0, 24).alarm, true);
  assert.deepEqual(
    compareReport({ mainAhead: [], productionAhead: [] }, () => 0, 24),
    {
      lines: ["Production has applied every migration main carries, and nothing main does not."],
      alarm: false,
    },
  );
});

/** The script as the release step and the workflow run it, with production's ledger in a file. */
function runCompare(text, ...args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-"));
  const file = path.join(dir, "prod.txt");
  fs.writeFileSync(file, text);
  const r = spawnSync(process.execPath, ["tooling/scripts/checks/migration-ledger.mjs", "--compare", file, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

test("the script exits 0 when production has main's migrations, 1 when it lacks one or holds another, 2 when it cannot read", () => {
  const versions = readFolder(ROOT).map((m) => m.version);
  const all = runCompare(versions.join("\n"));
  assert.equal(all.status, 0, all.stdout + all.stderr);
  assert.match(all.stdout, /Production has applied every migration main carries/);
  const lacking = runCompare(versions.slice(0, -1).join("\n"), "--hours", "0");
  assert.equal(lacking.status, 1, lacking.stdout + lacking.stderr);
  assert.match(lacking.stdout, new RegExp(`Production lacks 1 migration main carries:\\n- ${versions.at(-1)}_`));
  const extra = runCompare([...versions, "99999"].join("\n"));
  assert.equal(extra.status, 1);
  assert.match(extra.stdout, /Production has applied 1 version main does not carry: 99999/);
  const unreadable = runCompare("Cannot connect to the database\n");
  assert.equal(unreadable.status, 2);
  assert.match(unreadable.stderr, /Could not read production's ledger/);
});
