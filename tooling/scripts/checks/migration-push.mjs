#!/usr/bin/env node
/**
 * What `supabase db push --dry-run` would apply, held to what main has that production lacks, before the push is made
 * (.github/workflows/migrate.yml).
 *
 * The CLI applies every local file whose version production's ledger lacks, keyed by the version alone, and nothing
 * in the push can see what that misses. In one week of October 2026 two sessions twice took the same number: one
 * applied its 00346 to production from its branch, and main landed another 00346, which production will now never
 * run, since its version reads as applied. So before the push, production's ledger is read with its names
 * (`select version, name from supabase_migrations.schema_migrations`), and the dry run's list must be exactly main's
 * files production lacks, in version order: no version both hold under different names, none production holds that
 * main does not, none below production's head, and nothing in the list that is not one of those files.
 *
 *   node tooling/scripts/checks/migration-push.mjs --dry-run dry-run.txt --production prod-ledger.json
 *
 * `dry-run.txt` is what the dry run printed (both streams); `prod-ledger.json` is production's ledger in any shape
 * migration-ledger.mjs --compare reads, the rows with their names being the point. Exit 0 when the push would apply
 * exactly those files (each named on stdout, so a job summary can carry them), 1 when it would not (each reason on
 * stderr), 2 when an input could not be read.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compare, parseProductionLedger, readFolder, versionOf } from "./migration-ledger.mjs";

/** The escape character that opens a terminal code, named by its number: a control character has no place in a pattern. */
const ESCAPE = String.fromCharCode(27);

/** A terminal's colour and weight codes, which the CLI writes when it thinks it is talking to a person. */
const ANSI = new RegExp(`${ESCAPE}\\[[0-9;]*m`, "g");

/** A migration file's name at the end of a line, as the dry run lists it, with or without a path before it. */
const LISTED = /((?:[\w./\\-]+[/\\])?\d+_[A-Za-z0-9_-]+\.sql)\s*$/;

/**
 * The files `supabase db push --dry-run` said it would push, in the order it listed them: each line that is a
 * migration file's name alone, after the bullet the CLI draws (` • `) and any path, which are dropped. A sentence that
 * ends in a file's name is not a listing. "Remote database is up to date." lists none.
 */
export function pendingOf(text) {
  const out = [];
  for (const raw of String(text ?? "")
    .replace(ANSI, "")
    .split(/\r?\n/)) {
    const line = raw.trim();
    const m = LISTED.exec(line);
    if (m && /^[•*-]?$/.test(line.slice(0, m.index).trim())) out.push(path.posix.basename(m[1].replace(/\\/g, "/")));
  }
  return out;
}

/**
 * Why the push may not go, each as a sentence; none when `pending` is exactly main's files production lacks, in
 * version order, with no clash and nothing production holds that main does not.
 */
export function pushProblems({ folder, production, pending }) {
  const problems = [];
  const { mainAhead, productionAhead, clashes } = compare(folder, production);
  for (const c of clashes)
    problems.push(
      `${c.version} is applied in production as ${c.production}, and main carries it as ${c.main}: two migrations took one number, and the push would leave main's unapplied for ever. Write main's again at a free number (migration-ledger.mjs --compare says the rest).`,
    );
  for (const v of productionAhead)
    problems.push(
      `production has applied ${v}, which main does not carry: a branch applied it and has not landed, or landed it under another number. Nothing is pushed over it.`,
    );
  const versions = production instanceof Map ? [...production.keys()] : [...production];
  const head = Math.max(0, ...versions.map(Number));
  for (const file of mainAhead)
    if (Number(versionOf(file)) <= head)
      problems.push(
        `${file} is numbered at or below production's head, ${String(head).padStart(5, "0")}: production would apply it after the ones above it, an order no replay runs. Renumber it above the head.`,
      );
  const expected = new Set(mainAhead);
  const listed = new Set(pending);
  for (const file of pending)
    if (!expected.has(file))
      problems.push(
        `the dry run would push ${file}, which ${folder.some((m) => m.file === file) ? "production has already applied" : "main does not carry"}.`,
      );
  for (const file of mainAhead)
    if (!listed.has(file)) problems.push(`the dry run leaves out ${file}, which main carries and production lacks.`);
  if (!problems.length && pending.join("\n") !== mainAhead.join("\n"))
    problems.push(
      `the dry run lists the files in another order than main's: ${pending.join(", ")} against ${mainAhead.join(", ")}.`,
    );
  return problems;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const args = process.argv.slice(2);
  const argAfter = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const dryRunFile = argAfter("--dry-run");
  const productionFile = argAfter("--production");
  if (!dryRunFile || !productionFile) {
    console.error("usage: node tooling/scripts/checks/migration-push.mjs --dry-run <file> --production <file>");
    process.exit(2);
  }
  let production;
  let pending;
  try {
    production = parseProductionLedger(fs.readFileSync(productionFile, "utf8"));
  } catch (e) {
    console.error(`Could not read production's ledger: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  try {
    pending = pendingOf(fs.readFileSync(dryRunFile, "utf8"));
  } catch (e) {
    console.error(`Could not read the dry run: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  const folder = readFolder(root);
  const problems = pushProblems({ folder, production, pending });
  for (const p of problems) console.error(`- ${p}`);
  if (problems.length) {
    console.log(`migration push: ${problems.length} problem(s); nothing is pushed`);
    process.exit(1);
  }
  console.log(
    pending.length
      ? `The push applies ${pending.length} migration${pending.length === 1 ? "" : "s"} main carries and production lacks:`
      : "Production has applied every migration main carries: nothing to push.",
  );
  for (const file of pending) console.log(`- ${file}`);
  process.exit(0);
}

// Run as a script, not when a test imports it.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
