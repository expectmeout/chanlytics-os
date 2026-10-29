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
 *   - every test whose imports reach a changed file, read from the syntax tree (test-reach.mjs: through the packages'
 *     sources, a barrel by the names asked of it, and the paths a test reads by name), nearest first, while the run
 *     stays within BUDGET test files;
 *   - a file in a tree a test reads whole, that test, which no import of it names (READ_BY: the hearing tests, the
 *     browser's entry);
 *   - the folders that hold the repository's own rules and ratchets, always (ALWAYS): the five reds were all there.
 * The imports are the rule of 29 Oct 2026: on 28 Oct five tests went red on main, each importing what a pull request
 * changed (#1882's Campaigns reader, #1895's notification kinds, #1890's surface registry twice, #1900's routes), and
 * none in a folder its paths named. They replaced TESTED_IN, the hand-kept list of paths whose tests lived in folders
 * their names did not say (the composer, the answer verb, the campaign runner, a list rule's fields, Ask's effort, the
 * model gateway, People's table): the graph reaches each of those tests.
 *
 * A helper every test loads (the runner, a root helper, a stand-in) used to run the whole suite, which took 21 to 40
 * minutes on 6-9 Oct 2026 and ran #1535's and #1539's CI past its cap. Ruben, 10 Oct 2026: a push is through CI in
 * under ten minutes. So the folders a change names always run, and the tests its imports reach join them a distance at
 * a time, those importing a changed module first, until the next distance would take the run past BUDGET; the rest are
 * said, and the nightly runs them, as it runs everything (a pull request that wants them asks with the label).
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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCOPES as TRACED } from "../trace-routes.mjs";
import { isTest, reachOf } from "./test-reach.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TESTS = "tooling/scripts/tests";

/** Run on every change: the repository's rules, the ratchets and the docs' truth, where the five reds of 3 Oct were. */
export const ALWAYS = [`${TESTS}/repo`, `${TESTS}/types`, `${TESTS}/docs`, `${TESTS}/routes/wire-casing.test.mjs`];

/**
 * At most this many test files a pull request runs, the folders it names and the tests its imports reach: about two
 * seconds a file on the slowest of CI's four parts (#1915's 453 took 3:45 there, 29 Oct 2026), so under seven minutes
 * of tests, and the job's setup, inside Ruben's ten. Replayed over the 544 merges of 29 Sep to 29 Oct 2026, the median
 * pull request ran 161 test files and runs 310 (the tenth from the top, 419 and 678), and one in twelve reaches further
 * than this; where even the tests importing a changed module would pass it, the folders run alone, as before.
 */
export const BUDGET = 800;

/**
 * Tests that read whole trees, which no import of theirs names, each with what it reads (a tree ends in "/"): the trees
 * as the file that names them says them, that file, and the test's baselines. The hearing tests follow every route
 * through the tracer's trees (trace-routes.mjs SCOPES, and schema.sql) and run the dashboard's browser code and
 * contracts, and their two hand-kept lists (reads-not-heard.json, on-demand-reads.json) were blind to a change no path of
 * theirs named. The browser's entry is generated from every barrel the generator finds by walking contracts' sources
 * (gen/contracts-browser-entry.mjs): an export added to one changed the entry, and nothing ran its test (the eval-truth
 * pass, 17 Oct 2026). The graph sees neither: a tree walked is read by no name. The appointment words' count, which
 * every tree a reader reads could move (#1574, #1579, #1599 and #1602-#1604 each wrote "visit" in without running it,
 * and main went red, 13-15 Oct 2026), is check:debt's since 28 October 2026, and CI measures it on every pull request;
 * the page tests of one word (journey/one-page-one-word.test.mjs) import the modules they read, and the graph follows
 * them.
 */
export const READ_BY = {
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

/**
 * The targets, and the tests the imports reach that no target covers (`reached`, each with its distance from what
 * changed): a distance at a time, nearest first, while the run stays within `budget` of the suite's `tests`. The rest is
 * `left`: how many, and from which distance.
 */
export function withReached(targets, reached, tests, budget = BUDGET) {
  const covered = (t) => targets.some((x) => t === x || t.startsWith(`${x}/`));
  let total = tests.filter(covered).length;
  const byDistance = new Map();
  for (const [test, distance] of reached) {
    if (covered(test)) continue;
    if (!byDistance.has(distance)) byDistance.set(distance, []);
    byDistance.get(distance).push(test);
  }
  const added = [];
  const left = { count: 0, from: null };
  for (const distance of [...byDistance.keys()].sort((a, b) => a - b)) {
    const tier = byDistance.get(distance).sort();
    if (left.count || total + tier.length > budget) {
      left.count += tier.length;
      left.from ??= distance;
      continue;
    }
    added.push(...tier);
    total += tier.length;
  }
  return { targets: [...targets, ...added], added, left };
}

/**
 * The runner's arguments in parts a command line holds on every platform (Windows takes 32,767 characters), each part
 * run in turn: 800 test files are some 50,000.
 */
export function partsOf(targets, limit = 24_000) {
  const parts = [];
  let part = [];
  let length = 0;
  for (const t of targets) {
    if (part.length && length + t.length + 1 > limit) {
      parts.push(part);
      part = [];
      length = 0;
    }
    part.push(t);
    length += t.length + 1;
  }
  if (part.length) parts.push(part);
  return parts;
}

/** A suite that needs the stack: `pnpm test:db`'s own two globs (tooling/scripts/checks/test.mjs SUITES.db). */
export const isDatabaseSuite = (file) => /\.(db|integration)\.test\.mjs$/.test(file);

/** Of the targets, the database suites: a folder's that lie in it, and a file that is one. */
export function databaseSuitesOf(targets, suites) {
  return suites.filter((f) => targets.some((t) => f === t || f.startsWith(`${t}/`)));
}

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
const lines = (text) => text.split("\n").filter(Boolean);

/** The folders under tooling/scripts/tests that hold at least one test, by name. */
const foldersWithTests = (files) =>
  new Set(files.filter((f) => /^tooling\/scripts\/tests\/[^/]+\/.+\.test\.mjs$/.test(f)).map((f) => f.split("/")[3]));

/** A tracked file's text as the checkout has it; a file the checkout lacks reads as nothing. */
function readTracked(file) {
  try {
    return fs.readFileSync(path.join(ROOT, file), "utf8");
  } catch {
    return "";
  }
}

/** One part of the run after another, every part run; the status is the first that failed. */
function runParts(parts, flags, failed = 0) {
  const [first, ...rest] = parts;
  if (!first) return process.exit(failed);
  const child = spawn(process.execPath, [path.join(ROOT, "tooling/scripts/checks/test.mjs"), ...flags, ...first], {
    cwd: ROOT,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => runParts(rest, flags, failed || (signal ? 1 : (code ?? 1))));
}

/** What a change runs: the targets its paths name and the tests its imports reach, as they stand in the checkout. */
export function changeTargets(changed, files) {
  const reach = reachOf({ files, read: readTracked });
  const picked = withReached(testTargets(changed, foldersWithTests(files)), reach.testsReaching(changed), reach.tests);
  // A test the change deleted (or renamed away from) is no file to run.
  return { ...picked, targets: picked.targets.filter((t) => fs.existsSync(path.join(ROOT, t))) };
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
  // Both sides of a rename: a test that still imports the old path breaks.
  const changed = lines(git("diff", "--name-only", "--no-renames", base, head));
  const files = lines(git("ls-files"));
  const picked = changeTargets(changed, files);
  let targets = picked.targets;
  if (db) {
    targets = databaseSuitesOf(
      targets,
      files.filter((f) => isTest(f) && isDatabaseSuite(f)),
    );
    if (!targets.length) {
      console.log(`${changed.length} files changed; no database suite lies where they name or their imports reach`);
      return;
    }
  }
  const added = new Set(picked.added);
  const named = targets.filter((t) => !added.has(t));
  const reached = targets.filter((t) => added.has(t));
  console.log(`${changed.length} files changed; running ${named.join(" ")}`);
  if (reached.length) console.log(`and the ${reached.length} tests whose imports reach them: ${reached.join(" ")}`);
  if (picked.left.count)
    console.log(
      `${picked.left.count} more reach them, ${picked.left.from} imports away and further: past ${BUDGET} test files,` +
        " so the nightly runs them (or the `suite` label)",
    );
  if (list) return;
  runParts(partsOf(targets), [...(db ? ["--db"] : []), ...runner]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
