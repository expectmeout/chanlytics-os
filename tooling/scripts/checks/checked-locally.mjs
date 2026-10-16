#!/usr/bin/env node
/**
 * A tree checked on a laptop is not checked again by CI.
 *
 * Ruben, 10 Oct 2026: a push should be through CI in under ten minutes, and a change already green locally should skip
 * CI's own run of the same checks. So `corepack pnpm check:local` runs, on the committed tree, what ci.yml's lint,
 * hygiene and tests jobs and the build job's typecheck run: the packages' build and dist against it, typecheck, lint,
 * dead exports, the formatting of what it changes, the production audit and licences, and the tests of what it changes against
 * origin/main. When every one passes it commits nothing but a line naming the tree: an empty commit whose message
 * carries `Checked-locally: <tree>`. Pushed, ci.yml's scope job finds the line on the pull request's head and those
 * jobs are skipped. The build and the bundle still run (what a workspace loads is compared with main's own build, which
 * only CI holds), and so do the secret scan, the replay and the phone app's check.
 *
 * The line vouches for one tree. CI skips only where the head's tree is the one named AND GitHub's merge of the head
 * into main is that same tree, which a branch holding every commit of main merges to. When main moves past it, the
 * merge is a tree nobody checked, and CI runs everything as it would without the line; a commit after the stamp has
 * another tree, so the line no longer matches either. Nothing is rewritten: the stamp is a commit of its own, never an
 * amend, so a branch already pushed needs no force.
 *
 *   corepack pnpm check:local                                  check the committed tree, then stamp it
 *   node tooling/scripts/checks/checked-locally.mjs --ci       ci.yml: checked=true|false on stdout, the reason on stderr
 *
 * In --ci the answer is never an exit code: a git that fails is a crash, and the run goes red rather than skip.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The trailer the stamp writes and CI reads. */
export const TRAILER = "Checked-locally";

/** The tree a commit message vouches for, or null. */
export function stampedTree(message) {
  const m = new RegExp(`^${TRAILER}: ([0-9a-f]{40})\\s*$`, "m").exec(message ?? "");
  return m ? m[1] : null;
}

/**
 * Whether CI may skip what the laptop ran: a pull request whose head names its own tree in the stamp's line, and whose
 * merge into main (the commit GitHub tests) is that same tree. Every other event is checked in full.
 */
export function decide({ event, headMessage = "", headTree = "", mergeTree = "" }) {
  if (event !== "pull_request") return { checked: false, why: `a ${event || "nameless"} event is checked in full` };
  const stamped = stampedTree(headMessage);
  if (!stamped) return { checked: false, why: `the pull request's head carries no ${TRAILER} line` };
  if (stamped !== headTree)
    return {
      checked: false,
      why: `the line names the tree ${stamped.slice(0, 9)} and the head is ${headTree.slice(0, 9)}: something changed after the check`,
    };
  if (mergeTree !== headTree)
    return { checked: false, why: "main has moved past the branch, so its merge is a tree nobody checked" };
  return {
    checked: true,
    why: `the tree ${headTree.slice(0, 9)} was checked locally and main has not moved past it: lint, hygiene and tests are skipped`,
  };
}

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

/** What --ci reads of the merge commit GitHub tests (fetch-depth 2), whose second parent is the pull request's head. */
export function readMerge(cwd = ROOT) {
  const at = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" });
  return {
    headMessage: at("log", "-1", "--format=%B", "HEAD^2"),
    headTree: at("rev-parse", "HEAD^2^{tree}").trim(),
    mergeTree: at("rev-parse", "HEAD^{tree}").trim(),
  };
}

/** ci.yml's scope job. */
function ci() {
  const event = process.env.EVENT ?? "";
  const answer = event === "pull_request" ? decide({ event, ...readMerge() }) : decide({ event });
  console.error(answer.why);
  console.log(`checked=${answer.checked}`);
}

/**
 * The formatting of what the branch changes. CI's check reads the whole tree of a fresh checkout, which main keeps
 * clean; a laptop's tree also holds files no checkout has (what git's own exclude list hides is not hidden from
 * Prettier), so here it reads the files the branch changes from origin/main, a few dozen to a command. Prettier's
 * own ignore file still holds; a file it has no parser for is skipped.
 */
export function formatOfChanged() {
  const prettier = path.join(
    path.dirname(createRequire(import.meta.url).resolve("prettier/package.json")),
    "bin/prettier.cjs",
  );
  const files = git("diff", "--name-only", "--diff-filter=d", "origin/main", "HEAD").split("\n").filter(Boolean);
  for (let i = 0; i < files.length; i += 40) {
    const run = spawnSync(process.execPath, [prettier, "--check", "--ignore-unknown", ...files.slice(i, i + 40)], {
      cwd: ROOT,
      stdio: "inherit",
    });
    if (run.status !== 0) return run.status ?? 1;
  }
  return 0;
}

/**
 * What the laptop runs: each a name, and a command for the shell or a function that answers an exit status. The first
 * `FIRST` run one after the other (the build, and the dist it wrote against the sources); everything after them reads
 * only what they wrote, so it runs side by side (runTogether). In a row they took fourteen minutes on 16 Oct 2026, of
 * which the tests were six and the lint four.
 */
export const LOCAL_CHECKS = [
  ["the packages' build", 'corepack pnpm --filter "./packages/*" build'],
  ["dist matches the sources", "git diff --exit-code --stat -- packages/*/dist"],
  ["typecheck", "corepack pnpm -r typecheck"],
  ["lint", "corepack pnpm lint"],
  ["dead exports", "corepack pnpm check:dead-exports"],
  ["the formatting of what the branch changes", formatOfChanged],
  ["no production dependency with a high or critical advisory", "corepack pnpm audit --prod --audit-level high"],
  ["production licences", "corepack pnpm licenses list --prod --json | node tooling/scripts/checks/licences.mjs"],
  ["the tests of what the branch changes", "node tooling/scripts/checks/changed-tests.mjs origin/main HEAD"],
];
export const FIRST = 2;

/**
 * Checks side by side. A function check runs first, in this process (the formatting of a few dozen files); each
 * command's output is held and said when it ends, with how long it took, so two never interleave: the last lines of
 * one that passed, all of one that failed. Answers the names of the checks that failed.
 */
export async function runTogether(checks, cwd = ROOT, say = (text) => process.stderr.write(text)) {
  const failed = [];
  for (const [name, check] of checks.filter(([, c]) => typeof c === "function")) {
    say(`\ncheck:local: ${name}\n`);
    if (check() !== 0) failed.push(name);
  }
  const one = ([name, command]) =>
    new Promise((resolve) => {
      const started = Date.now();
      const child = spawn(command, { cwd, shell: true });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      child.on("close", (code) => {
        const secs = Math.round((Date.now() - started) / 1000);
        const shown = code === 0 ? out.trimEnd().split("\n").slice(-3).join("\n") : out;
        say(`\ncheck:local: ${name} (${secs}s${code === 0 ? "" : ", failed"})\n${shown}\n`);
        if (code !== 0) failed.push(name);
        resolve();
      });
    });
  await Promise.all(checks.filter(([, c]) => typeof c !== "function").map(one));
  return failed;
}

function refuse(why) {
  console.error(`check:local: ${why}`);
  process.exit(1);
}

const uncommitted = () => git("status", "--porcelain", "--untracked-files=no").trim();

async function stamp() {
  if (uncommitted()) refuse("commit first: the line vouches for the committed tree, and this one has changes");
  git("fetch", "--quiet", "origin", "main");
  try {
    git("merge-base", "--is-ancestor", "origin/main", "HEAD");
  } catch {
    refuse(
      "merge origin/main first: CI tests the branch merged into main, and only a branch holding all of main merges to its own tree",
    );
  }
  const tree = git("rev-parse", "HEAD^{tree}").trim();
  for (const [name, check] of LOCAL_CHECKS.slice(0, FIRST)) {
    console.error(`\ncheck:local: ${name}`);
    const status =
      typeof check === "function" ? check() : spawnSync(check, { cwd: ROOT, shell: true, stdio: "inherit" }).status;
    if (status !== 0) refuse(`${name} failed, so nothing is stamped`);
  }
  const failed = await runTogether(LOCAL_CHECKS.slice(FIRST));
  if (failed.length) refuse(`${failed.join(", ")} failed, so nothing is stamped`);
  if (uncommitted() || git("rev-parse", "HEAD^{tree}").trim() !== tree)
    refuse("a check changed the tree it checked: commit what it wrote and run again");
  git("commit", "--allow-empty", "--quiet", "-m", "Checked locally", "-m", `${TRAILER}: ${tree}`);
  console.error(
    `\ncheck:local: every check passed; stamped ${tree.slice(0, 9)}. Push it: while main has not moved past the branch, CI runs the build and bundle and skips the rest.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--ci")) ci();
  else await stamp();
}
