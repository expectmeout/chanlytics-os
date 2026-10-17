#!/usr/bin/env node
/**
 * The tests of what a change touched. ci.yml runs it on every pull request, database.yml runs its database suites, and
 * `corepack pnpm check:local` runs it against origin/main before it stamps a tree; the whole suite stays on the `suite`
 * label and in the nightly (Ruben, 1 Oct 2026: the suite took 27 minutes of every push). Before this a pull request ran
 * no test at all, and five ratchets went red on main between 29 Sep and 3 Oct with nothing to stop them.
 *
 * What a change runs:
 *   - a changed test file, itself;
 *   - any other changed file, every folder of tooling/scripts/tests named like one of its path's parts
 *     (packages/core/src/leads/cards.ts runs tests/leads; apps/edge/lib/receptionist/steer.ts runs tests/edge and
 *     tests/receptionist); supabase/ runs tests/database, and docs/ tests/history (the decisions' index);
 *   - a path whose tests live in folders it does not name, those folders too (TESTED_IN: the composer, the answer verb,
 *     the campaign runner);
 *   - a file in a tree a test reads whole, that test, which no such path names (READ_BY: the appointment words'
 *     ratchet, the hearing tests);
 *   - the folders that hold the repository's own rules and ratchets, always (ALWAYS): the five reds were all there.
 * A helper every test loads (the runner, a root helper, a stand-in) used to run the whole suite, which took 21 to 40
 * minutes on 6-9 Oct 2026 and ran #1535's and #1539's CI past its cap. Ruben, 10 Oct 2026: a push is through CI in
 * under ten minutes, so it runs ALWAYS and what else the change names; the nightly runs everything, and a pull request
 * that wants the whole suite asks for it with the label.
 *
 *   node tooling/scripts/checks/changed-tests.mjs <base> <head>          run them (ci.yml: HEAD^1 HEAD, the merge commit)
 *   node tooling/scripts/checks/changed-tests.mjs --list <base> <head>   say what would run
 *   node tooling/scripts/checks/changed-tests.mjs --db <base> <head>     their database suites, against the stack
 *                                                                        (database.yml, on a pull request)
 *   node tooling/scripts/checks/changed-tests.mjs <base> <head> --test-shard=2/4
 *                                                                        one part of them: a flag of Node's runner
 *                                                                        (--test-*) goes through as it is, so ci.yml
 *                                                                        runs the four parts on four runners at once
 */
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { READER_SCOPE } from "../tests/_source.mjs";
import { SCOPES as TRACED } from "../trace-routes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TESTS = "tooling/scripts/tests";

/** Run on every change: the repository's rules, the ratchets and the docs' truth, where the five reds of 3 Oct were. */
export const ALWAYS = [`${TESTS}/repo`, `${TESTS}/types`, `${TESTS}/docs`, `${TESTS}/routes/wire-casing.test.mjs`];

/**
 * Paths whose tests live in folders their names do not say, each with those folders: the prompt's composer is proved
 * where each channel reads what it composes, the answer verb through the doors that call it, and the campaign runner
 * where playbooks and broadcasts run, and a list rule's fields where Ask's list tool hands them to the model (its bytes
 * frozen per role in fixtures/ask-tools-4-7.json). Until 11 Oct 2026 each selected no test, so a change to what the
 * receptionist reads on every message ran only the rules on its pull request; #1612 reworded a list field's line and
 * nothing ran the freeze (16 Oct 2026).
 */
export const TESTED_IN = {
  "packages/contracts/src/config/workspace-config/": ["receptionist", "whatsapp", "voice", "calendar", "sms"],
  "packages/core/src/inbound/": ["whatsapp", "sms", "email", "intake", "receptionist", "conversations"],
  "packages/core/src/campaigns/": ["playbooks", "broadcasts"],
  "packages/contracts/src/people/lists/": ["ask"],
  // The effort a turn is asked at is the model layer's (contracts ai/effort.ts): its test is tests/ai/ask-effort.
  "apps/dashboard/src/server/ask/effort.ts": ["ai"],
};

/**
 * Tests that read whole trees whose paths never name them, each with what it reads (a tree ends in "/"): the trees as
 * the file that names them says them, that file, and the test's baselines. The appointment words' ratchet counts
 * "visit" written into every tree a reader reads (READER_SCOPE): #1574, #1579, #1599 and #1602-#1604 each wrote new
 * ones in without running it, and main went red (13-15 Oct 2026). The hearing tests follow every route through the
 * tracer's trees (trace-routes.mjs SCOPES, and schema.sql) and run the dashboard's browser code and contracts, and
 * their two ratchets (reads-not-heard.json, on-demand-reads.json) were as blind.
 */
export const READ_BY = {
  [`${TESTS}/journey/journey.test.mjs`]: [
    ...READER_SCOPE.map((tree) => `${tree}/`),
    `${TESTS}/_source.mjs`,
    `${TESTS}/baselines/appointment-words.json`,
  ],
  // One page, one word: each page's words for an appointment, run from the modules that make them (16 Oct 2026).
  [`${TESTS}/journey/one-page-one-word.test.mjs`]: [
    "packages/contracts/src/reports/",
    "packages/contracts/src/calendar/",
    "packages/contracts/src/setup/",
    "packages/contracts/src/people/",
    "packages/contracts/src/config/",
    "packages/contracts/src/ask/",
    "packages/contracts/src/workspace/",
    "packages/contracts/src/broadcasts/",
  ],
  // The browser's entry into contracts is written from every barrel (gen/contracts-browser-entry.mjs): an export added to
  // one changed the entry, and nothing ran its test (the eval-truth pass, 17 Oct 2026).
  [`${TESTS}/shipping/browser-entry.test.mjs`]: ["packages/contracts/src/"],
  [`${TESTS}/shell/hearing`]: [
    ...[...TRACED, "apps/dashboard/src", "packages/contracts/src"].map((tree) => `${tree}/`),
    "supabase/schema.sql",
    "tooling/scripts/trace-routes.mjs",
    `${TESTS}/baselines/reads-not-heard.json`,
    `${TESTS}/baselines/on-demand-reads.json`,
    `${TESTS}/baselines/hearing/`,
    `${TESTS}/baselines/writes/`,
  ],
};

/**
 * What to run for a set of changed paths, given the folders of tooling/scripts/tests that hold tests: the files and
 * folders to hand the runner, ALWAYS first.
 */
export function testTargets(changed, testFolders) {
  const targets = new Set(ALWAYS);
  for (const file of changed) {
    for (const [target, reads] of Object.entries(READ_BY))
      if (reads.some((r) => file.startsWith(r))) targets.add(target);
    if (file.startsWith(`${TESTS}/`)) {
      const folder = file.split("/")[3];
      if (/\.test\.mjs$/.test(file)) targets.add(file);
      else if (testFolders.has(folder)) targets.add(`${TESTS}/${folder}`);
      continue;
    }
    for (const [prefix, folders] of Object.entries(TESTED_IN)) {
      if (!file.startsWith(prefix)) continue;
      for (const folder of folders) if (testFolders.has(folder)) targets.add(`${TESTS}/${folder}`);
    }
    if (file.startsWith("supabase/")) targets.add(`${TESTS}/database`);
    if (file.startsWith("docs/")) targets.add(`${TESTS}/history`);
    if (file.startsWith("apps/mobile/")) targets.add("apps/mobile/test");
    for (const part of file.split("/")) {
      const name = part.replace(/\..*$/, "");
      if (testFolders.has(name)) targets.add(`${TESTS}/${name}`);
    }
  }
  // A folder already asked for covers a file or a folder inside it.
  const folders = [...targets].filter((t) => !t.endsWith(".mjs"));
  return [...targets].filter((t) => !folders.some((d) => t.startsWith(`${d}/`)));
}

/** A suite that needs the stack: `pnpm test:db`'s own two globs (tooling/scripts/checks/test.mjs SUITES.db). */
export const isDatabaseSuite = (file) => /\.(db|integration)\.test\.mjs$/.test(file);

/** Of the targets, the database suites: a folder's that lie in it, and a file that is one. */
export function databaseSuitesOf(targets, suites) {
  return suites.filter((f) => targets.some((t) => f === t || f.startsWith(`${t}/`)));
}

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

/** The folders under tooling/scripts/tests that hold at least one test, by name. */
function foldersWithTests() {
  return new Set(
    git("ls-files", `${TESTS}/*/**.test.mjs`)
      .split("\n")
      .filter(Boolean)
      .map((f) => f.split("/")[3]),
  );
}

function main() {
  const args = process.argv.slice(2);
  const list = args.includes("--list");
  const db = args.includes("--db");
  const [base, head] = args.filter((a) => !a.startsWith("--"));
  // Node's own flags for the run, such as the shard a runner takes (ci.yml's tests job).
  const runner = args.filter((a) => a.startsWith("--test-"));
  if (!base || !head) {
    console.error("usage: node tooling/scripts/checks/changed-tests.mjs [--list | --db] <base> <head>");
    process.exit(2);
  }
  const changed = git("diff", "--name-only", base, head).split("\n").filter(Boolean);
  let targets = testTargets(changed, foldersWithTests());
  if (db) {
    targets = databaseSuitesOf(targets, git("ls-files", `${TESTS}/**.test.mjs`).split("\n").filter(isDatabaseSuite));
    if (!targets.length) {
      console.log(`${changed.length} files changed; no database suite lies where they name`);
      return;
    }
  }
  console.log(`${changed.length} files changed; running ${targets.join(" ")}`);
  if (list) return;
  const child = spawn(
    process.execPath,
    [path.join(ROOT, "tooling/scripts/checks/test.mjs"), ...(db ? ["--db"] : []), ...runner, ...targets],
    { cwd: ROOT, stdio: "inherit" },
  );
  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
