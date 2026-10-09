/**
 * The migration ledger's rules, planted and caught: checks/migration-ledger.mjs, run.
 *
 * migrations.test.mjs holds the real folder to the real ledger; this holds the rules themselves, over folders made
 * here. Each case is one of the ways production drifted from main (the scorecard's defect 59): an applied file edited,
 * renamed or deleted, a file numbered below the head, a gap nobody explained. main's own test passed all of them. And
 * the comparison with production's ledger, read the ways it arrives (versions alone, or each with its name), run as
 * the release step, the weekly workflow and migrate.yml run it: a version production applied under another name than
 * main's file of it (two sessions took 00346 in one week of October 2026) is a clash the versions alone could not see.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "../../_source.mjs";
import {
  checksum,
  compare,
  compareReport,
  headOf,
  ledgerAgainstBase,
  ledgerProblems,
  nameOf,
  parseProductionLedger,
  readFolder,
  record,
} from "../../../checks/migration-ledger.mjs";

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
  assert.deepEqual(
    [...parseProductionLedger(cli)],
    [
      ["00001", null],
      ["00009", null],
    ],
    "the Remote column, no names",
  );
  assert.deepEqual([...parseProductionLedger("00001\r\n00002\n").keys()], ["00001", "00002"]);
  assert.deepEqual([...parseProductionLedger('["00001","00003"]').keys()], ["00001", "00003"]);
  assert.throws(() => parseProductionLedger("Connecting to remote database...\n"), /no version/);
});

test("production's ledger is read with its names: the rows of `select version, name`, as JSON or as a table", () => {
  // `supabase db query -o json`, and the same rows drawn as the CLI draws a table, with the header naming the columns.
  const rows =
    '[{"version":"00001","name":"a_first"},{"version":"00002","name":""},{"version":"00009","name":"elsewhere"}]';
  assert.deepEqual(
    [...parseProductionLedger(rows)],
    [
      ["00001", "a_first"],
      ["00002", null],
      ["00009", "elsewhere"],
    ],
  );
  const table = [
    "   version | name       ",
    "  ---------|------------",
    "   `00001` | `a_first`  ",
    "   `00002` | ` `        ",
    "   `00009` | `elsewhere`",
  ].join("\n");
  assert.deepEqual(
    [...parseProductionLedger(table)],
    [
      ["00001", "a_first"],
      ["00002", null],
      ["00009", "elsewhere"],
    ],
  );
  assert.equal(nameOf("00125_a_person_may_have_an_email.sql"), "a_person_may_have_an_email", "as the CLI records it");
});

test("a version production applied under another name than main's file of it is a clash, and the report says both", () => {
  // Production ran a branch's 00002; main landed another 00002. Versions alone agree; the names do not.
  const clash = compare(
    base,
    new Map([
      ["00001", "a_first"],
      ["00002", "a_branchs_own"],
      ["00003", null],
    ]),
  );
  assert.deepEqual(clash, {
    mainAhead: [],
    productionAhead: [],
    clashes: [{ version: "00002", main: "00002_a_second.sql", production: "a_branchs_own" }],
  });
  const report = compareReport(clash, () => 0, 24);
  assert.equal(report.alarm, true, "a clash is an alarm whatever its age");
  assert.match(
    report.lines[0],
    /^Production applied 00002 as a_branchs_own, and main carries it as 00002_a_second\.sql/,
  );
  assert.deepEqual(
    compare(
      base,
      new Map([
        ["00001", "a_first"],
        ["00002", "a_second"],
        ["00003", "a_third"],
      ]),
    ).clashes,
    [],
    "the same names are no clash",
  );
});

test("the comparison says what production lacks, how long main has held it, and what production holds that main does not", () => {
  const gap = compare(base, new Set(["00001", "00003", "00009"]));
  assert.deepEqual(gap, { mainAhead: ["00002_a_second.sql"], productionAhead: ["00009"], clashes: [] });
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
  // With the names: the rows of `select version, name`, the last version applied under a branch's own name.
  const folder = readFolder(ROOT);
  const rows = folder.map((m) => ({ version: m.version, name: nameOf(m.file) }));
  const named = runCompare(JSON.stringify(rows));
  assert.equal(named.status, 0, named.stdout + named.stderr);
  rows.at(-1).name = "a_branchs_own";
  const clash = runCompare(JSON.stringify(rows));
  assert.equal(clash.status, 1, clash.stdout + clash.stderr);
  assert.match(
    clash.stdout,
    new RegExp(
      `Production applied ${folder.at(-1).version} as a_branchs_own, and main carries it as ${folder.at(-1).file}`,
    ),
    "both are named",
  );
});

test("a pull request's ledger is held to main's: an entry main recorded edited, re-recorded or dropped is refused", () => {
  // The folder and the ledger are edited together in one pull request, so the test that holds one to the other passes
  // an applied migration that was edited and re-hashed. Only main's copy of the ledger can see it.
  const main = ledgerOf(base);
  assert.deepEqual(ledgerAgainstBase(main, main), []);
  const D = ["00004_a_fourth.sql", "create table d ();\n"];
  assert.deepEqual(ledgerAgainstBase(ledgerOf(folderOf(A, B, C, D)), main), [], "an entry added is the point");
  const rehashed = { ...main, migrations: { ...main.migrations, [B[0]]: checksum("create table b (id int);\n") } };
  const said = ledgerAgainstBase(rehashed, main);
  assert.equal(said.length, 1);
  assert.match(said[0], /^00002_a_second\.sql is recorded on main with another checksum/);
  const { [C[0]]: _dropped, ...rest } = main.migrations;
  assert.match(
    ledgerAgainstBase({ ...main, migrations: rest }, main)[0],
    /^00003_a_third\.sql is in main's ledger and gone/,
  );
});

test("recording says which entries it re-hashed, so an edit is never quiet", () => {
  const edited = folderOf(A, ["00002_a_second.sql", "create table b (id int);\n"], C);
  const out = record(ledgerOf(base), edited);
  assert.deepEqual(out.rehashed, ["00002_a_second.sql"]);
  assert.deepEqual(
    record(ledgerOf(base), edited, new Set([B[0]])).rehashed,
    [],
    "an entry main holds is kept, not re-hashed",
  );
});

test("run against a ref, the script exits 0 when the entries hold, 1 when one changed, 2 when the ref is unknown", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-base-"));
  const git = (...args) =>
    execFileSync("git", ["-c", "user.name=ci", "-c", "user.email=ci@example.com", ...args], {
      cwd: dir,
      encoding: "utf8",
    });
  // The script reads the repository it sits in, so it is copied into the one made here.
  const script = path.join(dir, "tooling/scripts/checks/migration-ledger.mjs");
  const run = (...args) => spawnSync(process.execPath, [script, "--base", ...args], { cwd: dir, encoding: "utf8" });
  try {
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.copyFileSync(path.join(ROOT, "tooling/scripts/checks/migration-ledger.mjs"), script);
    fs.mkdirSync(path.join(dir, "supabase/migrations"), { recursive: true });
    git("init", "-q", "-b", "main");
    fs.writeFileSync(path.join(dir, "README.md"), "no ledger yet\n");
    git("add", "-A");
    git("commit", "-q", "-m", "before the ledger");
    const none = run("HEAD");
    assert.equal(none.status, 0, none.stdout + none.stderr);
    assert.match(none.stdout, /has no ledger yet/);
    const ledger = ledgerOf(base);
    fs.writeFileSync(path.join(dir, "supabase/migrations-ledger.json"), JSON.stringify(ledger));
    git("add", "-A");
    git("commit", "-q", "-m", "the ledger");
    git("branch", "main-ledger");
    const kept = run("main-ledger");
    assert.equal(kept.status, 0, kept.stdout + kept.stderr);
    ledger.migrations[B[0]] = checksum("create table b (id int);\n");
    fs.writeFileSync(path.join(dir, "supabase/migrations-ledger.json"), JSON.stringify(ledger));
    const changed = run("main-ledger");
    assert.equal(changed.status, 1, changed.stdout);
    assert.match(changed.stderr, /00002_a_second\.sql is recorded on main with another checksum/);
    assert.equal(run("no-such-ref").status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("production's ledger as CLI 2.116 prints it: each cell in backticks, and an object under an agent", () => {
  // Copied from `supabase migration list` 2.116.0 against a stack holding a migration the folder lacks (99999) and a
  // file it has not applied (99998): the table as a person sees it, and what it prints when AI_AGENT or CLAUDECODE
  // is set. Both read as exit 2 before (6 October 2026), so the release's compare and the weekly workflow could not run.
  const fixture = (name) => fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/fixtures", name), "utf8");
  const remote = ["00001", "00002", "00003", "00335", "00336", "00337", "99999"];
  const table = fixture("supabase-migration-list-2.116.txt");
  assert.deepEqual(
    [...parseProductionLedger(table).keys()],
    remote,
    "the Remote column, an empty cell's ` ` read as none",
  );
  const agent = fixture("supabase-migration-list-2.116-agent.json");
  assert.deepEqual([...parseProductionLedger(agent).keys()], remote, "each entry's remote, an empty one read as none");
  assert.throws(() => parseProductionLedger('{"message":"Migrations listed"}'), /no migrations list/);

  // And the script reads both whole, over the real folder: production holding exactly what main carries is exit 0.
  const versions = readFolder(ROOT).map((m) => m.version);
  const row = (v) => `   \`${v}\` | \`${v}\` | \`${v}\`    `;
  const drawn = runCompare(
    ["   Local   | Remote  | Time (UTC) ", "  ---------|---------|------------", ...versions.map(row)].join("\n"),
  );
  assert.equal(drawn.status, 0, drawn.stdout + drawn.stderr);
  const listed = runCompare(
    JSON.stringify({
      migrations: versions.map((v) => ({ local: v, remote: v, time: v })),
      message: "Migrations listed",
    }),
  );
  assert.equal(listed.status, 0, listed.stdout + listed.stderr);
});

test("the same table drawn with box characters is read as well as one drawn with pipes", () => {
  const boxed = [
    "   00001 " + String.fromCharCode(0x2502) + " 00001 " + String.fromCharCode(0x2502) + " 00001",
    "   00002 " + String.fromCharCode(0x2502) + "       " + String.fromCharCode(0x2502) + " 00002",
  ].join("\n");
  assert.deepEqual([...parseProductionLedger(boxed).keys()], ["00001"], "the Remote column");
});
