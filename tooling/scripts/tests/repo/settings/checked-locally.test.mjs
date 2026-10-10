/**
 * A tree checked on a laptop is not checked again by CI (tooling/scripts/checks/checked-locally.mjs, ci.yml's scope
 * job): only a pull request whose head names its own tree in the stamp's line, merged into main as that same tree.
 * The reading runs against real merge commits made in a repository of its own, as GitHub makes the one it tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LOCAL_CHECKS, TRAILER, decide, readMerge, stampedTree } from "../../../checks/checked-locally.mjs";

const TREE = "a".repeat(40);

test("the line names a tree, or nothing", () => {
  assert.equal(stampedTree(`Checked locally\n\n${TRAILER}: ${TREE}\n`), TREE);
  assert.equal(stampedTree(`Checked locally\n\n${TRAILER}: ${TREE.slice(1)}\n`), null, "a whole tree id");
  assert.equal(stampedTree(`the ${TRAILER}: ${TREE} quoted in a sentence`), null, "a line of its own");
  assert.equal(stampedTree(""), null);
});

test("only a pull request skips, and only for the tree it names merged as that tree", () => {
  const msg = `Checked locally\n\n${TRAILER}: ${TREE}\n`;
  assert.equal(decide({ event: "pull_request", headMessage: msg, headTree: TREE, mergeTree: TREE }).checked, true);
  for (const event of ["push", "merge_group", "workflow_dispatch", ""])
    assert.equal(decide({ event, headMessage: msg, headTree: TREE, mergeTree: TREE }).checked, false, event);
  const other = "b".repeat(40);
  assert.equal(decide({ event: "pull_request", headMessage: "Fix", headTree: TREE, mergeTree: TREE }).checked, false);
  assert.equal(
    decide({ event: "pull_request", headMessage: msg, headTree: other, mergeTree: other }).checked,
    false,
    "a commit after the stamp",
  );
  assert.equal(
    decide({ event: "pull_request", headMessage: msg, headTree: TREE, mergeTree: other }).checked,
    false,
    "main moved past the branch",
  );
});

/** A repository of its own: main, a branch off it, and GitHub's kind of merge commit of the branch into main. */
function world(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "checked-locally-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "ci@example.com");
  git("config", "user.name", "CI");
  git("config", "commit.gpgsign", "false");
  const write = (file, text) => fs.writeFileSync(path.join(dir, file), text);
  const commit = (message) => git("commit", "--quiet", "--allow-empty", "--no-verify", "-m", message);
  write("a.txt", "one\n");
  git("add", ".");
  commit("main's first");
  git("switch", "--quiet", "-c", "branch");
  write("b.txt", "two\n");
  git("add", ".");
  commit("the change");
  const stamp = () =>
    git(
      "commit",
      "--quiet",
      "--allow-empty",
      "--no-verify",
      "-m",
      "Checked locally",
      "-m",
      `${TRAILER}: ${git("rev-parse", "HEAD^{tree}")}`,
    );
  /** GitHub's test merge: main's tip first, the branch's head second, never a fast-forward. */
  const merge = () => {
    git("switch", "--quiet", "--detach", "main");
    git("merge", "--quiet", "--no-ff", "--no-edit", "--no-verify", "branch");
    return readMerge(dir);
  };
  const back = () => git("switch", "--quiet", "branch");
  const onMain = (file, text) => {
    git("switch", "--quiet", "main");
    write(file, text);
    git("add", ".");
    commit("main moves");
    back();
  };
  return { git, write, commit, stamp, merge, back, onMain };
}

test("a stamped branch holding all of main skips; a commit after the stamp, or main moving past it, runs everything", (t) => {
  const w = world(t);
  w.stamp();
  assert.equal(decide({ event: "pull_request", ...w.merge() }).checked, true, "stamped, and main has not moved");

  w.back();
  w.write("b.txt", "three\n");
  w.git("add", ".");
  w.commit("after the stamp");
  assert.equal(decide({ event: "pull_request", ...w.merge() }).checked, false, "the head's tree is not the one named");

  w.back();
  w.stamp();
  w.onMain("c.txt", "main's own\n");
  assert.equal(decide({ event: "pull_request", ...w.merge() }).checked, false, "the merge is a tree nobody checked");
});

test("the laptop runs what the skipped jobs run, the tests against origin/main", () => {
  const names = LOCAL_CHECKS.map(([name]) => name).join(" | ");
  for (const command of [
    'corepack pnpm --filter "./packages/*" build',
    "git diff --exit-code --stat -- packages/*/dist",
    "corepack pnpm -r typecheck",
    "corepack pnpm lint",
    "corepack pnpm check:dead-exports",
    "corepack pnpm format:check",
    "corepack pnpm audit --prod --audit-level high",
    "corepack pnpm licenses list --prod --json | node tooling/scripts/checks/licences.mjs",
    "node tooling/scripts/checks/changed-tests.mjs origin/main HEAD",
  ])
    assert.ok(
      LOCAL_CHECKS.some(([, c]) => c === command),
      `${command} (have: ${names})`,
    );
});
