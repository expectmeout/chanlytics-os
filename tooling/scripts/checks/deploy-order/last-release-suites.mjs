#!/usr/bin/env node
/**
 * Either deploy order, proven for a migration: the last release's own database suites, run against the new schema.
 *
 * A migration is applied before its merge, so for as long as the two deploys take, and for good after a roll back,
 * the code that runs against the new schema is the release before it. Every migration says that order works; the
 * Database workflow proved only the other one, the branch's code on the branch's schema. old-callers.mjs holds a
 * re-made function to its old arguments by reading; this runs the old code. With the stack replayed to the branch's
 * head, the base commit is checked out beside the branch, and its suites that say a function the new migrations
 * write, or a table they add rows to or remove rows from, run there against that stack: the base's repositories and
 * the base's expectations, on the new schema.
 *
 * Which suites: changed-tests.mjs' own reading of a migration (migrationReaders), asked of the base's suites. The
 * suites that walk the catalog are left out, and said: each holds the whole schema to a list its own tree carries, so
 * the base's copy fails a new function by design, and the branch's copy runs on the branch.
 *
 * A red suite is the base's code or the base's expectation refused by the new schema. Where the migration means it (a
 * body the base pinned, a rule it tightens on purpose after the code stopped breaking it), the pull request's
 * description says so in a line `Last release: <why>`, as `Debt:` and `Bundle:` argue theirs, and the step passes
 * with the reason in its log.
 *
 *   node tooling/scripts/checks/deploy-order/last-release-suites.mjs <base> <head>          run them (database.yml: HEAD^1 HEAD)
 *   node tooling/scripts/checks/deploy-order/last-release-suites.mjs --list <base> <head>   say which would run
 *
 * It needs the stack the workflow started (SUPABASE_URL and its keys in the environment) and the store the branch's
 * install filled. Exit 0 when the branch adds no migration, when no suite of the base reads what it writes, when
 * they pass, or when a red is argued; 1 when one failed unargued; 2 when the command was wrong.
 * tests/database/ledger/last-release-suites.test.mjs holds the choosing.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDatabaseSuite, migrationReaders } from "../changed-tests.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATION = /^supabase\/migrations\/[^/]+\.sql$/;
/** Why changed-tests leaves a catalog walker in: here it is why one is left out. */
const WALKS = "walks the catalog";

/**
 * Of the base's database suites, the ones the added migrations reach, and the catalog walkers left to the branch:
 * `{ run: [[suite, why]], left: [suite] }`. `read(file)` answers a migration's text as the branch has it and a
 * suite's as the base has it.
 */
export function lastReleaseSuites(added, baseSuites, read) {
  const readers = migrationReaders(added, baseSuites, read);
  const run = [];
  const left = [];
  for (const [suite, why] of readers) (why === WALKS ? left : run).push(why === WALKS ? suite : [suite, why]);
  return { run, left };
}

/** The reason a pull request gives for a red here, in a line `Last release: <why>` of its description; null with none. */
export function reasonIn(body) {
  const m = /^[ \t>*-]*\**Last release:\**[ \t]*(.+?)[ \t]*$/im.exec(String(body ?? ""));
  return m ? m[1] : null;
}

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
const lines = (text) => text.split("\n").filter(Boolean);

/**
 * The base, checked out beside the branch and installed from the store the branch's install filled, and its suites
 * run there against the stack the environment names: the run's exit code, or null where it could not start. The
 * checkout is taken away again whatever happened.
 */
function runAtBase(base, suites) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "last-release-"));
  try {
    execFileSync("git", ["worktree", "add", "--detach", dir, base], { cwd: ROOT, stdio: "inherit" });
    const install = spawnSync("pnpm install --frozen-lockfile --prefer-offline", {
      cwd: dir,
      stdio: "inherit",
      shell: true,
    });
    if (install.status !== 0) return null;
    const ran = spawnSync(process.execPath, ["tooling/scripts/checks/test.mjs", "--db", ...suites], {
      cwd: dir,
      stdio: "inherit",
    });
    return ran.status ?? 1;
  } catch {
    return null;
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: ROOT, stdio: "ignore" });
  }
}

function main() {
  const args = process.argv.slice(2);
  const list = args.includes("--list");
  const [base, head] = args.filter((a) => !a.startsWith("--"));
  if (!base || !head) {
    console.error("usage: node tooling/scripts/checks/deploy-order/last-release-suites.mjs [--list] <base> <head>");
    process.exit(2);
  }
  const added = lines(git("diff", "--name-only", "--no-renames", "--diff-filter=A", base, head)).filter((f) =>
    MIGRATION.test(f),
  );
  if (!added.length) {
    console.log("No migration is added, so the last release meets the schema it was written for: nothing to run.");
    return;
  }
  const baseSuites = lines(git("ls-tree", "-r", "--name-only", base, "--", "tests")).filter(isDatabaseSuite);
  const read = (file) => (MIGRATION.test(file) ? git("show", `${head}:${file}`) : git("show", `${base}:${file}`));
  const { run, left } = lastReleaseSuites(added, baseSuites, read);
  console.log(`${added.length} migration(s) added: ${added.map((f) => path.basename(f)).join(", ")}`);
  if (left.length)
    console.log(`${left.length} of the last release's suites walk the catalog and are left to the branch's own copy.`);
  if (!run.length) {
    console.log("None of the last release's database suites says a function or a table these migrations write.");
    return;
  }
  console.log(
    `The last release's ${run.length} database suite(s) that read what they write: ` +
      run.map(([suite, why]) => `${suite} (${why})`).join(" "),
  );
  if (list) return;

  const at = git("rev-parse", "--short", base).trim();
  const code = runAtBase(
    base,
    run.map(([suite]) => suite),
  );
  if (code === null) {
    // Not a red of the schema's, so no line in the description argues it.
    console.error(`The last release (${at}) could not be checked out and installed, so its suites did not run.`);
    process.exit(1);
  }
  if (code === 0) {
    console.log(`The last release (${at}) passes its database suites against this schema: either deploy order holds.`);
    return;
  }
  const reason = reasonIn(process.env.PR_BODY);
  if (reason) {
    console.log(`The last release (${at}) fails a suite against this schema, and the description says why: ${reason}`);
    return;
  }
  console.error(
    `The last release (${at}) fails a database suite against this schema (above). A migration is applied before its ` +
      "merge, so that code runs against it until both apps deploy, and again after a roll back. Keep what the old code " +
      "calls and reads working; or, where the migration means the change (a body the last release pinned, a rule " +
      "tightened once the code stopped breaking it), say so in the description: `Last release: <why>`.",
  );
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
