#!/usr/bin/env node
/**
 * Land a branch: hold all of main, push, and have the pull request merge itself the moment CI is green.
 *
 * Several sessions push to main at once (16 Oct 2026: #1639 merged main in four times in one afternoon, and three of the
 * four conflicts were only in the committed dist). So this does by rule what was done by hand each time:
 *
 *   1. Nothing uncommitted: what lands is what was committed.
 *   2. Main merged in, when the branch does not hold it. A conflict in a file a command writes (the packages' dist, a
 *      `*.generated.*` file, the API reference, the data model) takes main's side and is written again below; a
 *      conflict in anything else stops here, the merge left open, with the files to resolve by hand (then run this
 *      again). supabase/schema.sql is not written here, as it needs a database: resolve it from a replay.
 *   3. What the commands write, written again from the merged sources: the browser entry, the typed client and route
 *      keys, the API reference, the packages' dist. Then the typecheck, the one check that is quick and sure to catch a
 *      merge that no longer fits together; CI runs the rest.
 *   4. Pushed, and the pull request (opened with --title and --body-file when there is none) set to squash-merge itself
 *      once every required check passes, pinned to the commit pushed (`--match-head-commit`), so nothing pushed after
 *      it lands unchecked. Where the repository does not allow auto-merge, it says to merge once green.
 *
 *   node tooling/scripts/ship/land.mjs                                    merge main, write, push, auto-merge
 *   node tooling/scripts/ship/land.mjs --title "<title>" --body-file <f>  the same, opening the pull request first
 *   node tooling/scripts/ship/land.mjs --no-auto                          everything but the auto-merge
 */
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** A file a command writes: main's side is taken in a conflict, and the command writes it again (WRITERS). */
export function isWritten(file) {
  return (
    /^packages\/[^/]+\/dist\//.test(file) ||
    /\.generated\.(ts|json)$/.test(file) ||
    file === "docs/api.md" ||
    file === "docs/data-model.md" ||
    file === "tooling/scripts/tests/_unique-keys.generated.json"
  );
}

/** What writes them, in order: the packages' dist last, from the sources the others read. */
export const WRITERS = [
  ["the browser entry", "node tooling/scripts/gen/contracts-browser-entry.mjs"],
  ["the typed client and route keys", "node tooling/scripts/gen/route-types.mjs"],
  ["the API reference", "corepack pnpm gen:api-reference"],
  ["the data model", "corepack pnpm gen:data-model"],
  ["the packages' dist", 'corepack pnpm --filter "./packages/*" build'],
];

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const tryGit = (...args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
const run = (command) => spawnSync(command, { cwd: ROOT, shell: true, stdio: "inherit" }).status;
const say = (line) => console.error(`land: ${line}`);
function stop(why) {
  say(why);
  process.exit(1);
}

/** Main merged in; answers whether a merge was made. */
function mergeMain() {
  git("fetch", "--quiet", "origin", "main");
  if (tryGit("merge-base", "--is-ancestor", "origin/main", "HEAD").status === 0) return false;
  const merged = tryGit("merge", "--no-edit", "origin/main");
  if (merged.status === 0) return true;
  const conflicted = git("diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
  const byHand = conflicted.filter((f) => !isWritten(f));
  if (byHand.length)
    stop(
      `main conflicts with the branch in ${byHand.join(", ")}: resolve ${byHand.length === 1 ? "it" : "them"}, ` +
        "leave the rest, and run this again (the merge is left open)",
    );
  git("checkout", "--theirs", "--", ...conflicted);
  say(`took main's side of ${conflicted.length} written file${conflicted.length === 1 ? "" : "s"}; writing them again`);
  return true;
}

function write() {
  for (const [name, command] of WRITERS) {
    say(name);
    if (run(command) !== 0) stop(`writing ${name} failed`);
  }
  git("add", "-A");
}

function main() {
  const args = process.argv.slice(2);
  const auto = !args.includes("--no-auto");
  const title = args.includes("--title") ? args[args.indexOf("--title") + 1] : null;
  const bodyFile = args.includes("--body-file") ? args[args.indexOf("--body-file") + 1] : null;
  const merging = tryGit("rev-parse", "-q", "--verify", "MERGE_HEAD").status === 0;
  if (!merging && git("status", "--porcelain", "--untracked-files=no"))
    stop("commit first: what lands is what was committed");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch === "main" || branch === "HEAD") stop("land a branch, not main or a detached head");

  // A title is judged before anything is pushed: a push with a title that breaks the rule is a run spent for nothing.
  if (title && run(`node tooling/scripts/checks/pr-title.mjs ${JSON.stringify(title)}`) !== 0)
    stop("the title breaks the rule");
  const made = merging || mergeMain();
  if (made) {
    write();
    say("the typecheck of the merged tree");
    if (run("corepack pnpm -r typecheck") !== 0) stop("the merged tree does not typecheck: fix it, commit, run again");
    if (tryGit("rev-parse", "-q", "--verify", "MERGE_HEAD").status === 0) git("commit", "--no-edit", "--quiet");
    else if (git("status", "--porcelain", "--untracked-files=no"))
      git("commit", "--quiet", "-m", "What the commands write, written again from main merged in");
  }

  if (run(`git push --quiet -u origin ${branch}`) !== 0) stop("the push was refused");
  const head = git("rev-parse", "HEAD");
  let pr = spawnSync("gh", ["pr", "view", branch, "--json", "number,url", "-q", ".number"], {
    cwd: ROOT,
    encoding: "utf8",
  }).stdout.trim();
  if (!pr) {
    if (!title || !bodyFile) stop("pushed; there is no pull request yet: run again with --title and --body-file");
    const made = spawnSync(
      "gh",
      ["pr", "create", "--base", "main", "--head", branch, "--title", title, "--body-file", bodyFile],
      {
        cwd: ROOT,
        encoding: "utf8",
      },
    );
    if (made.status !== 0) stop(`gh pr create failed: ${made.stderr.trim()}`);
    pr = made.stdout.trim().split("/").pop();
  }
  say(`pushed ${head.slice(0, 9)} to #${pr}`);
  if (!auto) return say("merge it once CI is green: gh pr merge --squash --match-head-commit " + head);
  const set = spawnSync("gh", ["pr", "merge", pr, "--auto", "--squash", "--match-head-commit", head], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (set.status !== 0)
    return say(
      `auto-merge could not be set (${set.stderr.trim()}): merge once CI is green with gh pr merge ${pr} --squash --match-head-commit ${head}`,
    );
  say(`#${pr} merges itself once every required check passes on ${head.slice(0, 9)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
