#!/usr/bin/env node
/**
 * The tests of what a change touched. ci.yml runs it on every pull request, database.yml runs its database suites, and
 * `corepack pnpm check:local` runs it against origin/main before it stamps a tree; the whole suite stays on the `suite`
 * label and in the nightly (Ruben, 1 Oct 2026: the suite took 27 minutes of every push). Before this a pull request ran
 * no test at all, and five ratchets went red on main between 29 Sep and 3 Oct with nothing to stop them.
 *
 * What a change runs:
 *   - a changed test file, itself;
 *   - any other changed file, every folder of tests named like one of its path's parts
 *     (packages/core/src/leads/cards.ts runs tests/leads; apps/edge/lib/receptionist/steer.ts runs tests/edge and
 *     tests/receptionist); supabase/ runs tests/database, and docs/ tests/history (the decisions' index);
 *   - every test whose imports reach a changed file, read from the syntax tree (test-reach.mjs: through the packages'
 *     sources, a barrel by the names asked of it, and the paths a test reads by name), nearest first, while the run
 *     stays within BUDGET test files;
 *   - a file in a tree a test reads whole, that test, which no import of it names (READ_BY: the hearing tests, the
 *     browser's entry, the style tests, layout-measure);
 *   - the folders that hold the repository's own rules and ratchets, always (ALWAYS): the five reds were all there;
 *   - under --db, for a migration, the database suites that read what it changes, from its text (migrationReaders): each
 *     suite that walks the catalog, and each that says a function it creates, drops, alters or grants, or a table whose
 *     rows it adds or removes.
 * The migrations' text is the rule of 5 Nov 2026. A migration's path names tests/database alone, and main's push runs
 * every suite, so of main's 60 Database runs from 3 to 5 Nov 38 were red and 33 of those held a suite no pull request had
 * run, each green on its own: reach-out-add pinned a signature 00505 dropped (32 reds in a row hid every other failure),
 * second-factor-catalog read 00533's and 00547's doors, and lead-lists pinned a body 00540 wrote again. Replayed over all
 * 488 migrations with each suite's time from main's own logs, it added 0.16 minutes at the median and 2.37 at most, and
 * 3.80 for the one pull request it could not read (00440's, which then runs them all).
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
import ts from "typescript";
import { functionChangesIn, isWord, qualifiedName, statementsOf } from "../gen/schema-snapshot.mjs";
import { SCOPES as TRACED } from "../trace-routes.mjs";
import { isTest, reachOf } from "./test-reach.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TESTS = "tests";

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
 * Tests that read whole trees, which no import of theirs names, each with what it reads (a tree ends in "/", and one
 * kind of file in it is "<tree>/**.css"): the trees as the file that names them says them, that file, and the test's
 * baselines. The hearing tests follow every route through the tracer's trees (trace-routes.mjs SCOPES, and schema.sql)
 * and run the dashboard's browser code and contracts, and their two hand-kept lists (reads-not-heard.json,
 * on-demand-reads.json) were blind to a change no path of theirs named. The browser's entry is generated from every
 * barrel the generator finds by walking contracts' sources (gen/contracts-browser-entry.mjs): an export added to one
 * changed the entry, and nothing ran its test (the eval-truth pass, 17 Oct 2026). The style tests read every stylesheet
 * of the dashboard's, wherever it sits (has-subjects, touch-hover, page-light/paper-at-the-edges, kit-css, and through
 * the measures style-measures), and only a path with a `styles` folder in it named them: #2018's two rules in
 * today/phone/phone.css broke has-subjects, and the red waited for #2019, which touched styles/ (1 Nov 2026).
 * layout-measure walks that one folder, and no stylesheet's path names tests/shell. The graph sees none of these: a
 * tree walked is read by no name. The appointment words' count, which every tree a reader reads could move (#1574,
 * #1579, #1599 and #1602-#1604 each wrote "visit" in without running it, and main went red, 13-15 Oct 2026), is
 * check:debt's since 28 October 2026, and CI measures it on every pull request; the page tests of one word
 * (journey/one-page-one-word.test.mjs) import the modules they read, and the graph follows them.
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
  [`${TESTS}/styles`]: ["apps/dashboard/**.css"],
  [`${TESTS}/shell/layout-measure.test.mjs`]: ["apps/dashboard/src/styles/"],
};

/** Whether what READ_BY names takes in a file: the file itself, a tree, or one kind of file at any depth of a tree. */
export function holds(read, file) {
  const [start, end = ""] = read.split("**");
  return file.startsWith(start) && file.endsWith(end);
}

/**
 * What to run for a set of changed paths, given the folders of tests that hold tests: the files and
 * folders to hand the runner, ALWAYS first.
 */
export function testTargets(changed, testFolders) {
  const targets = new Set(ALWAYS);
  for (const file of changed) {
    for (const [target, reads] of Object.entries(READ_BY)) if (reads.some((r) => holds(r, file))) targets.add(target);
    if (file.startsWith(`${TESTS}/`)) {
      const folder = file.split("/")[1];
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

/** A statement a `do` block runs as text: one that can do something to a function, never a sentence that says the word. */
const QUOTED_STATEMENT = /^\s*(?:create|drop|alter|grant|revoke|comment)\b/i;
const isFunctionWord = (t) => isWord(t, "function") || isWord(t, "procedure");

/**
 * What a script writes that a suite can say, in the public schema. Every function its statements name: what it creates
 * and drops (functionChangesIn), alters, renames, grants, revokes or comments on, and the function a new trigger runs.
 * And every table it adds rows to or removes rows from, since a suite can hold those rows as a closed list that no
 * function names (ops/sweep-registry holds sweep_status's, and a clock is such a row). An update is left out, since a
 * backfill's would reach every suite that says the table, and so is a table of one word (`events`, `decisions`), which a
 * suite's text cannot tell from the word; a function of one word stays, since too many suites cost one pull request
 * minutes and a pin missed turns main red. What a `do` block does counts, and a function's own body does not, since that
 * runs when it is called. `unread` where a `do` block builds a function's name at run time (00440's
 * `execute format('drop function %s', …)`), which no reading of the file can say.
 */
export const namesWrittenIn = (sql) => namesWrittenAt(sql, false);

/** What namesWrittenIn reads, at the top of a script or (`inBlock`) in a `do` block's body or the text it executes. */
function namesWrittenAt(sql, inBlock) {
  const names = new Set(functionChangesIn(sql).map((c) => c.name));
  let unread = false;
  for (const { tokens } of statementsOf(sql)) {
    const writesABody = isWord(tokens[0], "create") && tokens.some(isFunctionWord);
    tokens.forEach((t, i) => {
      if (isFunctionWord(t)) {
        const { name } = qualifiedName(tokens, isWord(tokens[i + 1], "if") ? i + 3 : i + 1);
        if (name) names.add(name);
        else if (inBlock && QUOTED_STATEMENT.test(sql)) unread = true;
      } else if (
        (isWord(t, "insert") && isWord(tokens[i + 1], "into")) ||
        (isWord(t, "delete") && isWord(tokens[i + 1], "from"))
      ) {
        const { name } = qualifiedName(tokens, i + 2);
        if (name?.includes("_")) names.add(name);
      } else if (t.type === "dollar" || t.type === "string") {
        // At the top a `do` block's body; in one, the text it executes.
        if (!(inBlock ? !writesABody && QUOTED_STATEMENT.test(t.value) : isWord(tokens[0], "do"))) return;
        const inner = namesWrittenAt(t.value, true);
        for (const n of inner.names) names.add(n);
        unread ||= inner.unread;
      }
    });
  }
  return { names, unread };
}

/** A query of what migrations write: functions, policies, views, tables, triggers, keys, indexes, columns and types. */
const READS_THE_CATALOG =
  /\b(?:from|join)\s+(?:pg_(?:proc|policies|policy|views|matviews|tables|class|trigger|constraint|indexes|index|attribute|type|enum)|information_schema\.\w+)\b/i;
/** And one that asks of the objects it names: by name, or by a name cast to the object it is. */
const NAMES_WHAT_IT_ASKS =
  /\b(?:proname|routine_name|tablename|table_name|relname|indexname|viewname|polname|policyname|conname|tgname|column_name|typname)\s*(?:=|in\b)|\b(?:oid|indexrelid|indrelid|polrelid|tgrelid|tgfoid|conrelid|attrelid)\s*(?:=|in\b)\s*\(?\s*(?:'|\$\{|\w+::reg)|'[^']*'::reg(?:procedure|proc|class)\b/i;

/**
 * Whether one of a suite's queries walks the catalog: reads it and names no object it asks of, so any migration can
 * change the answer (partners/second-factor-catalog asks of every definer door). Read from the suite's strings, so a
 * comment or an assertion's words that say pg_proc are not a query, and part by part, since one part of a union can
 * walk whatever another names.
 */
export function walksTheCatalog(text, file) {
  if (!READS_THE_CATALOG.test(text)) return false;
  const queries = [];
  const visit = (node) => {
    if (ts.isStringLiteralLike(node)) queries.push(node.text);
    else if (ts.isTemplateExpression(node))
      queries.push(node.head.text + node.templateSpans.map((s) => `\${}${s.literal.text}`).join(""));
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
  return queries
    .flatMap((q) => q.split(/\bunion\b|;/i))
    .some((part) => READS_THE_CATALOG.test(part) && !NAMES_WHAT_IT_ASKS.test(part));
}

/**
 * The database suites that read what a change's migrations change, each with why: every suite that walks the catalog,
 * for any migration, and every suite that says, as a word, a name a migration writes (namesWrittenIn). Saying is the
 * whole test: a body pinned (`liveBody("X")`), a signature held ("X(integer, uuid)"), a call (`rpc("X")`) and a closed
 * list over a table's rows each break when X does, and on 3 Nov 2026 two of them were calls. A suite's whole text counts,
 * comments too: the broadcast's walk runs claim_due_jobs through the jobs package and says so in a comment alone, and
 * 00526 turned it red. A function's name built at run time cannot be read, so such a migration runs them all.
 */
export function migrationReaders(changed, suites, read) {
  const migrations = changed.filter((f) => /^supabase\/migrations\/[^/]+\.sql$/.test(f)).map(read);
  if (!migrations.length) return new Map();
  const reads = migrations.map((sql) => namesWrittenIn(sql));
  if (reads.some((r) => r.unread))
    return new Map(suites.map((s) => [s, "a migration names a function only at run time"]));
  const names = reads.flatMap((r) => [...r.names]);
  const readers = new Map();
  for (const suite of suites) {
    const text = read(suite);
    const words = new Set(text.match(/\w+/g));
    const says = [...new Set(names.filter((n) => words.has(n)))];
    if (walksTheCatalog(text, suite)) readers.set(suite, "walks the catalog");
    else if (says.length) readers.set(suite, `says ${says.join(", ")}`);
  }
  return readers;
}

/**
 * What `--db` runs: the suites where the change names or its imports reach, and `readers`, those only its migrations'
 * text reaches, each with why.
 */
export function databaseRunOf(changed, targets, suites, read) {
  const named = databaseSuitesOf(targets, suites);
  const readers = new Map([...migrationReaders(changed, suites, read)].filter(([s]) => !named.includes(s)));
  return { targets: [...named, ...readers.keys()], readers };
}

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
const lines = (text) => text.split("\n").filter(Boolean);

/** The folders under tests that hold at least one test, by name. */
const foldersWithTests = (files) =>
  new Set(files.filter((f) => /^tests\/[^/]+\/.+\.test\.mjs$/.test(f)).map((f) => f.split("/")[1]));

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

/**
 * What a change runs: the targets its paths name and the tests its imports reach, as they stand in the checkout.
 * Building the graph takes seconds, so a caller that holds one hands it in.
 */
export function changeTargets(changed, files, reach = reachOf({ files, read: readTracked })) {
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
  let readers = new Map();
  if (db) {
    const suites = files.filter((f) => isTest(f) && isDatabaseSuite(f));
    ({ targets, readers } = databaseRunOf(changed, targets, suites, readTracked));
    if (!targets.length) {
      console.log(`${changed.length} files changed; no database suite lies where they name or their imports reach`);
      return;
    }
  }
  const added = new Set(picked.added);
  const named = targets.filter((t) => !added.has(t) && !readers.has(t));
  const reached = targets.filter((t) => added.has(t));
  console.log(`${changed.length} files changed; running ${named.join(" ")}`);
  if (reached.length) console.log(`and the ${reached.length} tests whose imports reach them: ${reached.join(" ")}`);
  if (readers.size)
    console.log(
      `and the ${readers.size} database suites that read what its migrations change: ` +
        [...readers].map(([suite, why]) => `${suite} (${why})`).join(" "),
    );
  if (picked.left.count)
    console.log(
      `${picked.left.count} more reach them, ${picked.left.from} imports away and further: past ${BUDGET} test files,` +
        " so the nightly runs them (or the `suite` label)",
    );
  if (list) return;
  runParts(partsOf(targets), [...(db ? ["--db"] : []), ...runner]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
