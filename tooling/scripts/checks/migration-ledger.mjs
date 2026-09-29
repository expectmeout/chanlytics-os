#!/usr/bin/env node
/**
 * The migration ledger: every migration main carries, in the order production applies it, with a checksum of its
 * text, and what production has applied compared with it.
 *
 * The CLI keys an applied migration by its version and never reads an applied file again, so an applied file that is
 * edited or renamed replays differently on the next fresh database than it ran in production, and a file numbered
 * below production's head applies after the ones above it, an order no replay runs. All three happened (the
 * scorecard's defect 59: 00215 and 00216 skipped in production for a day, 00241 and 00242 pushed with
 * `--include-all`), and the test that was meant to catch the third sorted the folder before comparing it with itself
 * sorted, so it could not fail.
 *
 * `supabase/migrations-ledger.json` is the record. database/migrations.test.mjs holds it to the folder with
 * `ledgerProblems`: a recorded file edited, renamed or deleted fails; a file not in the ledger fails with the command
 * that records it, or with the head it must be numbered above; the recorded order ascends; and a gap below the head is
 * one the ledger argues. A migration's pull request records its own file:
 *
 *   node tooling/scripts/checks/migration-ledger.mjs --record     # append the new files above the head
 *   node tooling/scripts/checks/migration-ledger.mjs --check      # what migrations.test.mjs says, alone
 *
 * `--record` also re-records an entry this branch added and main's ledger does not hold yet (a file renumbered before
 * it lands); an entry main holds is never rewritten.
 *
 * And whether production has what main has: production's ledger in, as `supabase migration list` prints it (with
 * `--linked`, or `--db-url` for the database SUPABASE_PROD_READ_URL names), as one version a line, or as a JSON array:
 *
 *   supabase migration list --linked | node tooling/scripts/checks/migration-ledger.mjs --compare -
 *   node tooling/scripts/checks/migration-ledger.mjs --compare prod-ledger.txt --hours 24
 *
 * It exits 0 when production holds every migration main has and nothing main lacks, 1 when main has held one
 * production lacks for `--hours` or longer (24 by default) or production holds one main does not, and 2 when the
 * input could not be read. The release steps in docs/runbook.md run it; so does the weekly workflow
 * (.github/workflows/migration-ledger.yml), once SUPABASE_PROD_READ_URL is set.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LEDGER = "supabase/migrations-ledger.json";
export const MIGRATIONS = "supabase/migrations";

const NOTE =
  "Every migration main carries, in the order production applies it, with the sha256 of its text (line endings as LF). " +
  "Written by tooling/scripts/checks/migration-ledger.mjs --record, held by database/migrations.test.mjs: an applied " +
  "migration is never edited, renamed or deleted, and a new one is numbered above the head. `gaps` argues each version " +
  "below the head that has no file.";

/** A migration file's version: the digits before the first underscore, as the CLI keys it. */
export const versionOf = (file) => file.split("_")[0];

/** The sha256 of a migration's text, its line endings read as LF, so a Windows checkout hashes as CI does. */
export const checksum = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");

/** The folder as it stands: each `.sql` file, its version and its checksum, in name order. */
export function readFolder(root) {
  const dir = path.join(root, MIGRATIONS);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({
      file,
      version: versionOf(file),
      sha256: checksum(fs.readFileSync(path.join(dir, file), "utf8")),
    }));
}

/** The ledger as written, or an empty one when there is none yet. */
export function readLedger(root) {
  const file = path.join(root, LEDGER);
  if (!fs.existsSync(file)) return { note: NOTE, gaps: {}, migrations: {} };
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** The ledger's text, as `--record` writes it: one migration a line, in the order recorded. */
export function ledgerText(ledger) {
  return `${JSON.stringify({ note: NOTE, gaps: ledger.gaps ?? {}, migrations: ledger.migrations ?? {} }, null, 2)}\n`;
}

/** The highest version the ledger records, as a number; 0 for an empty ledger. */
export function headOf(ledger) {
  return Math.max(0, ...Object.keys(ledger.migrations ?? {}).map((f) => Number(versionOf(f))));
}

const pad = (n) => String(n).padStart(5, "0");

/**
 * What breaks the ledger's rules, each as a sentence; none when the folder is what the ledger recorded, and every
 * gap below the head is argued.
 */
export function ledgerProblems(ledger, folder) {
  const problems = [];
  const recorded = Object.entries(ledger.migrations ?? {});
  const byFile = new Map(folder.map((m) => [m.file, m]));
  const recordedFiles = new Set(recorded.map(([file]) => file));

  for (const [file, sha] of recorded) {
    const now = byFile.get(file);
    if (now) {
      if (now.sha256 !== sha)
        problems.push(
          `${file} changed after it was recorded: an applied migration is never edited. Write a new migration that makes the change.`,
        );
      continue;
    }
    const moved = folder.find((m) => m.sha256 === sha && !recordedFiles.has(m.file));
    problems.push(
      moved
        ? `${file} was renamed to ${moved.file}: the CLI keys an applied migration by its version, so a renamed one runs twice or never. Put the name back.`
        : `${file} is recorded and gone: an applied migration is never deleted. Undo it with a new migration.`,
    );
  }

  let previous = 0;
  for (const [file] of recorded) {
    const v = Number(versionOf(file));
    if (v <= previous)
      problems.push(
        `${file} is recorded after ${pad(previous)}: the ledger is the apply order, and a version below the head applies after the ones above it in production and before them in every replay.`,
      );
    previous = Math.max(previous, v);
  }

  const head = headOf(ledger);
  for (const m of folder) {
    if (recordedFiles.has(m.file)) continue;
    if (Number(m.version) <= head)
      problems.push(
        `${m.file} is numbered at or below the ledger's head, ${pad(head)}: production would apply it after ${pad(head)}, an order no replay runs. Move it above ${pad(head)}, to the number that is free when it lands.`,
      );
    else problems.push(`${m.file} is not in the ledger: run node tooling/scripts/checks/migration-ledger.mjs --record`);
  }

  const versions = new Set(recorded.map(([file]) => Number(versionOf(file))));
  const argued = ledger.gaps ?? {};
  for (let v = 1; v < head; v++) {
    if (!versions.has(v) && !(pad(v) in argued))
      problems.push(
        `${pad(v)} is a gap below the head with no reason: say in the ledger's gaps why it is empty (a renumbered file, a number another branch took), or number the migration that left it.`,
      );
  }
  for (const v of Object.keys(argued)) {
    if (versions.has(Number(v)))
      problems.push(`${v} is argued as a gap and has a migration: take it out of the ledger's gaps.`);
    else if (Number(v) >= head)
      problems.push(
        `${v} is argued as a gap and is not below the head (${pad(head)}): take it out of the ledger's gaps.`,
      );
  }
  return problems;
}

/**
 * The ledger with the folder's new files recorded, and what was refused. A file above the head is appended in version
 * order; one at or below it is refused. An entry that `landed` (main's ledger holds it) is never rewritten; one this
 * branch added is dropped when its file is gone and re-hashed when its text changed, so a file renumbered before it
 * lands is recorded again. A gap argued for a version that now has a file, or that the head no longer lies above (a
 * lane's reserved numbers, once the file is numbered below them), is taken out: it is untrue, and `ledgerProblems`
 * would fail it.
 */
export function record(ledger, folder, landed = new Set()) {
  const byFile = new Map(folder.map((m) => [m.file, m]));
  const migrations = {};
  const refused = [];
  for (const [file, sha] of Object.entries(ledger.migrations ?? {})) {
    if (landed.has(file)) {
      migrations[file] = sha;
      continue;
    }
    const now = byFile.get(file);
    if (now) migrations[file] = now.sha256;
  }
  let head = headOf({ migrations });
  const fresh = folder.filter((m) => !(m.file in migrations)).sort((a, b) => Number(a.version) - Number(b.version));
  const recorded = [];
  for (const m of fresh) {
    if (Number(m.version) <= head) {
      refused.push(`${m.file}: at or below the head, ${pad(head)}; move it above, then record it`);
      continue;
    }
    migrations[m.file] = m.sha256;
    recorded.push(m.file);
    head = Number(m.version);
  }
  const numbered = new Set(Object.keys(migrations).map((file) => Number(versionOf(file))));
  const gaps = {};
  const droppedGaps = [];
  for (const [v, why] of Object.entries(ledger.gaps ?? {})) {
    if (numbered.has(Number(v)) || Number(v) >= head) droppedGaps.push(v);
    else gaps[v] = why;
  }
  return { ledger: { ...ledger, gaps, migrations }, recorded, refused, droppedGaps };
}

/**
 * The versions production has applied, from what `supabase migration list` prints (its Remote column), one version a
 * line, or a JSON array. Throws when nothing in the text is a version.
 */
export function parseProductionLedger(text) {
  const trimmed = String(text ?? "").trim();
  let versions;
  if (trimmed.startsWith("[")) versions = JSON.parse(trimmed).map(String);
  else
    versions = trimmed
      .split(/\r?\n/)
      .map((line) => (line.includes("|") ? (line.split("|")[1] ?? "") : line).trim())
      .filter((v) => /^\d+$/.test(v));
  if (!versions.length) throw new Error("no version in production's ledger: nothing to compare");
  return new Set(versions);
}

/** Main's migrations production lacks, and production's that main does not carry. */
export function compare(folder, production) {
  const main = new Set(folder.map((m) => m.version));
  return {
    mainAhead: folder.filter((m) => !production.has(m.version)).map((m) => m.file),
    productionAhead: [...production].filter((v) => !main.has(v)).sort(),
  };
}

/** When a migration file first landed on this branch's history (a merge to main, on main), or null. */
function landedAt(root, file) {
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--format=%cI", "-1", "--", `${MIGRATIONS}/${file}`], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    return out ? Date.parse(out) : null;
  } catch {
    return null;
  }
}

/** The entries main's ledger holds, read from origin/main; none when it has no ledger or cannot be read. */
function landedEntries(root) {
  try {
    const text = execFileSync("git", ["show", `origin/main:${LEDGER}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return new Set(Object.keys(JSON.parse(text).migrations ?? {}));
  } catch {
    return new Set();
  }
}

/** The comparison as sentences, and whether it is an alarm: main ahead for `hours` or longer, or production ahead. */
export function compareReport({ mainAhead, productionAhead }, ageHours, hours) {
  const lines = [];
  let alarm = false;
  if (!mainAhead.length && !productionAhead.length)
    lines.push("Production has applied every migration main carries, and nothing main does not.");
  if (mainAhead.length) {
    lines.push(`Production lacks ${mainAhead.length} migration${mainAhead.length === 1 ? "" : "s"} main carries:`);
    for (const file of mainAhead) {
      const age = ageHours(file);
      const over = age === null || age >= hours;
      alarm ||= over;
      lines.push(
        `- ${file}: on main ${age === null ? "for an unknown time" : `for ${Math.floor(age)} h`}${over ? "" : `, under ${hours} h`}`,
      );
    }
  }
  if (productionAhead.length) {
    alarm = true;
    lines.push(
      `Production has applied ${productionAhead.length} version${productionAhead.length === 1 ? "" : "s"} main does not carry: ${productionAhead.join(", ")}. A branch applied it and has not landed, or landed it under another number.`,
    );
  }
  return { lines, alarm };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const args = process.argv.slice(2);
  const folder = readFolder(root);
  const ledger = readLedger(root);

  if (args.includes("--record")) {
    const { ledger: next, recorded, refused, droppedGaps } = record(ledger, folder, landedEntries(root));
    fs.writeFileSync(path.join(root, LEDGER), ledgerText(next));
    for (const f of recorded) console.log(`recorded ${f}`);
    for (const v of droppedGaps) console.log(`dropped the gap ${v}: it has a file now, or lies above the head`);
    for (const r of refused) console.error(`refused ${r}`);
    const left = ledgerProblems(next, folder);
    for (const p of left) console.error(`- ${p}`);
    process.exit(refused.length || left.length ? 1 : 0);
  }

  if (args.includes("--compare")) {
    const from = args[args.indexOf("--compare") + 1];
    const hoursAt = args.indexOf("--hours");
    const hours = hoursAt >= 0 ? Number(args[hoursAt + 1]) : 24;
    let production;
    try {
      const text = !from || from === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(from, "utf8");
      production = parseProductionLedger(text);
    } catch (e) {
      console.error(`Could not read production's ledger: ${e instanceof Error ? e.message : e}`);
      process.exit(2);
    }
    const now = Date.now();
    const { lines, alarm } = compareReport(
      compare(folder, production),
      (file) => {
        const at = landedAt(root, file);
        return at === null ? null : (now - at) / 3_600_000;
      },
      hours,
    );
    for (const line of lines) console.log(line);
    process.exit(alarm ? 1 : 0);
  }

  const problems = ledgerProblems(ledger, folder);
  for (const p of problems) console.error(`- ${p}`);
  console.log(problems.length ? `migration ledger: ${problems.length} problem(s)` : "migration ledger: holds");
  process.exit(problems.length ? 1 : 0);
}

// Run as a script, not when a test imports it.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
