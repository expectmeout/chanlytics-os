#!/usr/bin/env node
/**
 * Land a branch: hold all of main, push, and have the pull request merge itself the moment CI is green.
 *
 * Several sessions push to main at once (16 Oct 2026: #1639 merged main in four times in one afternoon, and three of the
 * four conflicts were only in the committed dist, which left git on 28 October, decision 0074). So this does by rule
 * what was done by hand each time:
 *
 *   1. Nothing uncommitted: what lands is what was committed.
 *   2. Main merged in, when the branch does not hold it. A conflict in a file a command writes (a `*.generated.*` file,
 *      the API reference, the data model, the tree, the migration ledger) takes main's side and is written again below; a
 *      dist or a baseline a branch from before 28 October 2026 changed, and main no longer has, is taken out, as main
 *      took it (isRetired); and the number blocks and the tree it changed in the register, the takeover checklist and the
 *      architecture take main's side, its pointer to check:debt and docs/tree.md (mainsBlocks). A conflict in anything
 *      else stops here, the merge left open, with the files to resolve by hand (then run this again, and it takes up
 *      the merge where it was left).
 *      What the migrations write through a database (REPLAYED: the schema snapshot, the database's types, the closed
 *      sets and the unique keys) is written only from a replay: with --replay, and a local stack that answers
 *      (`supabase status`), main's side is taken and the stack is replayed from zero (`supabase db reset`, so its data
 *      goes) before they are written again; without either, it stops and names them, as a conflict a person resolves.
 *   3. What the commands write, written again from the merged sources: the barrels' order, the browser entry, the typed
 *      client and route keys, the API reference, the migration ledger, the data model and the tree. Then the
 *      typecheck, the one check that is quick and sure to catch a merge that no longer fits together; CI runs the rest.
 *   4. Pushed, and the pull request (opened with --title and --body-file when there is none) set to squash-merge itself
 *      once every required check passes, pinned to the commit pushed (`--match-head-commit`), so nothing pushed after
 *      it lands unchecked. Where the repository does not allow auto-merge, it says to merge once green.
 *   5. Not while a migration it adds is off production. Production takes a migration before the code that needs it
 *      merges (docs/runbook.md, "Apply a migration"), and a pull request that merged itself the moment CI was green
 *      would deploy that code first. So one that adds a migration is pushed and left to merge by hand, or set to merge
 *      itself by running this again with --applied once each one is on production and read back.
 *
 *   node tooling/scripts/land.mjs                                    merge main, write, push, auto-merge
 *   node tooling/scripts/land.mjs --title "<title>" --body-file <f>  the same, opening the pull request first
 *   node tooling/scripts/land.mjs --no-auto                          everything but the auto-merge
 *   node tooling/scripts/land.mjs --applied                          the auto-merge too, its migrations on production
 *   node tooling/scripts/land.mjs --replay                           a conflict in what the migrations write, written
 *                                                                    again from the local stack, replayed from zero
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * What the migrations write through a database: each needs a stack that has replayed them, so a conflict in one is
 * written again only from a replay (REPLAYERS), and is a person's to resolve without one.
 */
export const REPLAYED = [
  "packages/contracts/src/schema-sets.generated.ts",
  "packages/db/src/database.types.ts",
  "supabase/schema.sql",
  "tooling/scripts/tests/_unique-keys.generated.json",
];
export const isReplayed = (file) => REPLAYED.includes(file);

/** A file a command writes from the tree: main's side is taken in a conflict, and the command writes it again (WRITERS). */
export function isWritten(file) {
  return (
    !isReplayed(file) &&
    (/\.generated\.(ts|json)$/.test(file) ||
      file === "docs/api.md" ||
      file === "docs/data-model.md" ||
      file === "docs/tree.md" ||
      file === "supabase/migrations-ledger.json")
  );
}

/**
 * A file main may have retired on 28 October 2026 (decision 0074): a package's dist, and a ratchet's baseline, whose
 * number check:debt measures instead. One a branch changed and main no longer has is taken out (settle's `mainHas`); a
 * baseline main keeps (the coverage floors, the bundle's ceilings, the hearing tests' lists) is a person's, as before.
 */
export const isRetired = (file) =>
  /^packages\/[^/]+\/dist\//.test(file) ||
  /^tooling\/scripts\/tests\/(baselines\/|source-scan-baseline\.json$)/.test(file);

/** The pages whose number blocks and drawn tree left them that day, each block now a pointer (decision 0074). */
export const BLOCK_PAGES = ["docs/architecture.md", "docs/debt.md", "docs/takeover.md"];
const BLOCK_MARK = /<!-- (measured|tree):(start|end) -->/;

/**
 * A page's conflicts settled where each is a block main retired: a hunk whose branch side holds a measured or tree block's
 * marker, and whose main side holds none, is main's side. The page as settled, or null when any hunk is another's (a
 * person's, as any conflict). Either conflict style: a diff3 hunk's base lines are dropped with the branch's.
 */
export function mainsBlocks(text) {
  const out = [];
  let side = null;
  let ours = [];
  let theirs = [];
  let settled = 0;
  for (const line of text.split("\n")) {
    if (side === null && line.startsWith("<<<<<<< ")) [side, ours, theirs] = ["ours", [], []];
    else if (side === "ours" && line.startsWith("||||||| ")) side = "base";
    else if ((side === "ours" || side === "base") && line === "=======") side = "theirs";
    else if (side === "theirs" && line.startsWith(">>>>>>> ")) {
      if (!ours.some((l) => BLOCK_MARK.test(l)) || theirs.some((l) => BLOCK_MARK.test(l))) return null;
      out.push(...theirs);
      [side, settled] = [null, settled + 1];
    } else if (side === "ours") ours.push(line);
    else if (side === "theirs") theirs.push(line);
    else if (side === null) out.push(line);
  }
  return settled && side === null ? out.join("\n") : null;
}

/** The migrations among a branch's added files (`git diff --diff-filter=A`): each holds its auto-merge (step 5). */
export const migrationsAdded = (files) => files.filter((f) => /^supabase\/migrations\/\d{5}_[a-z0-9_]+\.sql$/.test(f));

/**
 * What writes them, in order: the barrels first, since the browser entry is written from them. The ledger records the
 * branch's migrations above main's head again, and refuses one at or below it (a number two lanes took: move it up).
 */
export const WRITERS = [
  ["the barrels' order", "node tooling/scripts/gen/sorted-lists.mjs"],
  ["the browser entry", "node tooling/scripts/gen/contracts-browser-entry.mjs"],
  ["the typed client and route keys", "node tooling/scripts/gen/route-types.mjs"],
  ["the API reference", "corepack pnpm gen:api-reference"],
  ["the migration ledger", "node tooling/scripts/checks/migration-ledger.mjs --record"],
  ["the data model", "corepack pnpm gen:data-model"],
  ["the tree", "node tooling/scripts/gen/docs-tree.mjs"],
];

const SUPABASE = process.env.SUPABASE_CLI || "supabase";

/**
 * What writes REPLAYED, after the stack is replayed from zero and before WRITERS, whose data model reads the snapshot.
 * The types' command writes the unique keys too (tooling/scripts/gen/db-types.mjs).
 */
export const REPLAYERS = [
  ["the replay of every migration", `${SUPABASE} db reset`],
  ["the database's types and unique keys", "corepack pnpm gen:db-types"],
  ["the closed sets", "corepack pnpm gen:schema-sets"],
  ["the schema snapshot", "corepack pnpm gen:schema-snapshot"],
];

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const tryGit = (...args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
const run = (command) => spawnSync(command, { cwd: ROOT, shell: true, stdio: "inherit" }).status;
const say = (line) => console.error(`land: ${line}`);
function stop(why) {
  say(why);
  process.exit(1);
}

/** Main merged in; answers whether a merge was made. A conflict is left for `resolve`. */
function mergeMain() {
  git("fetch", "--quiet", "origin", "main");
  if (tryGit("merge-base", "--is-ancestor", "origin/main", "HEAD").status === 0) return false;
  const merged = tryGit("merge", "--no-edit", "origin/main");
  if (merged.status !== 0 && tryGit("rev-parse", "-q", "--verify", "MERGE_HEAD").status !== 0)
    stop(`main could not be merged in: ${merged.stderr.trim() || merged.stdout.trim()}`);
  return true;
}

/**
 * How a merge's conflicts are settled: who takes each file. `replay` says whether the stack may be replayed (--replay
 * and a stack that answers); a file a person resolves, or one the migrations write when it may not, stops the land.
 */
export function settle(conflicted, replay, mainHas = () => false) {
  const retired = conflicted.filter((f) => isRetired(f) && !mainHas(f));
  const left = conflicted.filter((f) => !retired.includes(f));
  const replayed = left.filter(isReplayed);
  const blocks = left.filter((f) => BLOCK_PAGES.includes(f));
  const theirs = left.filter((f) => isWritten(f) || isReplayed(f));
  const byHand = left.filter((f) => !theirs.includes(f) && !blocks.includes(f));
  const blocked = replay ? [] : replayed;
  return { retired, theirs, replayed, blocks, byHand, blocked };
}

const stackAnswers = () => spawnSync(SUPABASE, ["status"], { cwd: ROOT, stdio: "ignore" }).status === 0;

/** The open merge's conflicts settled by rule (settle); answers whether the stack is to be replayed. */
function resolve(replayAsked) {
  const conflicted = git("diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
  if (!conflicted.length) return false;
  const replay = replayAsked && stackAnswers();
  const mainHas = (f) => tryGit("cat-file", "-e", `origin/main:${f}`).status === 0;
  const { retired, theirs, replayed, blocks, byHand, blocked } = settle(conflicted, replay, mainHas);
  // A retired baseline is not ignored as a dist is, so it leaves the working tree too, or the add below would keep it.
  if (retired.length) git("rm", "-r", "-q", "-f", "--ignore-unmatch", "--", ...retired);
  const pages = [];
  for (const page of blocks) {
    const text = mainsBlocks(fs.readFileSync(path.join(ROOT, page), "utf8"));
    if (text === null) byHand.push(page);
    else pages.push([page, text]);
  }
  const why = [];
  if (byHand.length)
    why.push(
      `main conflicts with the branch in ${byHand.join(", ")}: resolve ${byHand.length === 1 ? "it" : "them"} and git add`,
    );
  if (blocked.length)
    why.push(
      `${blocked.join(", ")} ${blocked.length === 1 ? "is" : "are"} written by the migrations through a database: ` +
        (replayAsked
          ? "no local stack answers: start one (supabase start) and run this again with --replay, or resolve them by hand"
          : "run this again with --replay to replay the local stack from zero (its data goes) and write them"),
    );
  if (why.length) stop(`${why.join("; ")}. Leave the rest and run this again (the merge is left open)`);
  if (retired.length)
    say(`took ${retired.length} file${retired.length === 1 ? "" : "s"} main retired out of the branch, as main did`);
  for (const [page, text] of pages) fs.writeFileSync(path.join(ROOT, page), text);
  if (pages.length) {
    git("add", "--", ...pages.map(([page]) => page));
    say(`took main's side of the retired blocks in ${pages.map(([page]) => page).join(", ")}`);
  }
  if (theirs.length) git("checkout", "--theirs", "--", ...theirs);
  say(`took main's side of ${theirs.length} written file${theirs.length === 1 ? "" : "s"}; writing them again`);
  return replayed.length > 0;
}

function write(replay) {
  for (const [name, command] of [...(replay ? REPLAYERS : []), ...WRITERS]) {
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
    write(resolve(args.includes("--replay")));
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
  const held = migrationsAdded(git("diff", "--name-only", "--diff-filter=A", "origin/main...HEAD").split("\n"));
  if (held.length && !args.includes("--applied"))
    return say(
      `#${pr} adds ${held.join(", ")}: it merges by hand, or apply ${held.length === 1 ? "it" : "them"} to production, read ` +
        "back, and run this again with --applied to have it merge itself once green",
    );
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
