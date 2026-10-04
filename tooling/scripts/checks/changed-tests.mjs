#!/usr/bin/env node
/**
 * The tests of what a change touched. ci.yml runs it on every pull request; the whole suite stays on the `suite` label
 * and in the nightly (Ruben, 1 Oct 2026: the suite took 27 minutes of every push), so before this a pull request ran no
 * test at all, and five ratchets went red on main between 29 Sep and 3 Oct with nothing to stop them.
 *
 * What a change runs:
 *   - a changed test file, itself;
 *   - any other changed file, every folder of tooling/scripts/tests named like one of its path's parts
 *     (packages/core/src/leads/cards.ts runs tests/leads; apps/edge/lib/receptionist/steer.ts runs tests/edge and
 *     tests/receptionist); supabase/ runs tests/database, and docs/ tests/history (the decisions' index);
 *   - the folders that hold the repository's own rules and ratchets, always (ALWAYS): the five reds were all there;
 *   - the whole suite, when the runner or something every test loads changed (WHOLE): a root helper, a stand-in.
 * A dependency bump touches no folder of its own, so it runs ALWAYS on top of the job's build, typecheck and lint;
 * the nightly runs the whole suite, and a risky bump asks for it with the label.
 *
 *   node tooling/scripts/checks/changed-tests.mjs <base> <head>          run them (ci.yml: HEAD^1 HEAD, the merge commit)
 *   node tooling/scripts/checks/changed-tests.mjs --list <base> <head>   say what would run
 */
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TESTS = "tooling/scripts/tests";

/** Run on every change: the repository's rules, the ratchets and the docs' truth, where the five reds of 3 Oct were. */
export const ALWAYS = [`${TESTS}/repo`, `${TESTS}/types`, `${TESTS}/docs`, `${TESTS}/routes/wire-casing.test.mjs`];

/** A change to one of these can break any test, so it runs the whole suite. */
const WHOLE = [
  /^tooling\/scripts\/checks\/(test|coverage)\.mjs$/,
  new RegExp(`^${TESTS}/_[^/]+\\.mjs$`),
  new RegExp(`^${TESTS}/[^/]+/_stand-in-[^/]+\\.mjs$`),
];

/**
 * What to run for a set of changed paths, given the folders of tooling/scripts/tests that hold tests. `whole` means the
 * suite; otherwise `targets` are the files and folders to hand the runner, ALWAYS first.
 */
export function testTargets(changed, testFolders) {
  if (changed.some((f) => WHOLE.some((re) => re.test(f)))) return { whole: true, targets: [] };
  const targets = new Set(ALWAYS);
  for (const file of changed) {
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
  // A folder already asked for covers a file inside it.
  const folders = [...targets].filter((t) => !t.endsWith(".mjs"));
  return {
    whole: false,
    targets: [...targets].filter((t) => !t.endsWith(".mjs") || !folders.some((d) => t.startsWith(`${d}/`))),
  };
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
  const list = args[0] === "--list";
  const [base, head] = list ? args.slice(1) : args;
  if (!base || !head) {
    console.error("usage: node tooling/scripts/checks/changed-tests.mjs [--list] <base> <head>");
    process.exit(2);
  }
  const changed = git("diff", "--name-only", base, head).split("\n").filter(Boolean);
  const { whole, targets } = testTargets(changed, foldersWithTests());
  console.log(
    `${changed.length} files changed; ${whole ? "the whole suite (the runner or a shared helper changed)" : `running ${targets.join(" ")}`}`,
  );
  if (list) return;
  const child = spawn(
    process.execPath,
    [path.join(ROOT, "tooling/scripts/checks/test.mjs"), ...(whole ? [] : targets)],
    {
      cwd: ROOT,
      stdio: "inherit",
    },
  );
  child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
