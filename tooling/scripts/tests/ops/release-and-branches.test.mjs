/**
 * Two of the release's helpers, run: the tag and note every deploy gets (ops/release-note.mjs), and the list of remote
 * branches no open pull request stands for (ops/stale-branches.mjs, the scorecard's I2:3). The note's commits are made
 * here in a repository of their own, since CI's checkout holds one commit and no tag.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { parseSubject, renderNote, tagFor } from "../../ops/release-note.mjs";
import { staleBranches } from "../../ops/stale-branches.mjs";

test("a deploy's tag is the UTC day it was committed and the commit's first nine characters", () => {
  assert.equal(tagFor("2026-09-29T04:23:58-04:00", "1388f2cc6581dc21596184252dc090b65d2f1d4c"), "v2026.09.29-1388f2cc6");
  assert.equal(tagFor("2026-09-29T21:30:00-04:00", "abcdef0123456789"), "v2026.09.30-abcdef012", "the UTC day");
});

test("a landed subject splits into its title and pull request, and one without a number keeps it whole", () => {
  assert.deepEqual(parseSubject("The wire says snake_case (#1311)"), { title: "The wire says snake_case", pr: 1311 });
  assert.deepEqual(parseSubject("Merge pull request #1243 from x/y"), { title: "Merge pull request #1243 from x/y", pr: null });
});

test("the note lists what landed since the last tag, oldest first, by the pull request's own title when GitHub gave it", () => {
  const note = renderNote({
    tag: "v2026.09.30-bbbbbbbbb",
    since: "v2026.09.29-aaaaaaaaa",
    commits: [
      { sha: "c".repeat(40), subject: "Typed at merge, longer than the title (#1330)" },
      { sha: "d".repeat(40), subject: "A commit pushed straight to main" },
      { sha: "e".repeat(40), subject: "Reach out 7 (#1329)" },
    ],
    titles: new Map([[1330, "Wave 3: the media fence"]]),
    repoUrl: "https://github.com/example/repo",
  });
  assert.equal(
    note,
    [
      "What deployed as v2026.09.30-bbbbbbbbb, since v2026.09.29-aaaaaaaaa:",
      "",
      "- Reach out 7 ([#1329](https://github.com/example/repo/pull/1329))",
      "- A commit pushed straight to main (ddddddddd, no pull request named)",
      "- Wave 3: the media fence ([#1330](https://github.com/example/repo/pull/1330))",
      "",
    ].join("\n"),
  );
});

test("run as the release workflow runs it: the first note holds the one commit, the next everything after the tag", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "release-"));
  const git = (...args) =>
    execFileSync("git", ["-c", "user.name=ci", "-c", "user.email=ci@example.com", ...args], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
  const script = path.join(ROOT, "tooling/scripts/ops/release-note.mjs");
  const env = { ...process.env, GH_TOKEN: "", GITHUB_TOKEN: "", GITHUB_REPOSITORY: "", GITHUB_SERVER_URL: "" };
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: repo, env, encoding: "utf8" });
  try {
    git("init", "-q", "-b", "main");
    git("commit", "--allow-empty", "-q", "-m", "The first thing is true (#1)");
    const first = git("rev-parse", "HEAD");
    const tag = run("--tag", first);
    assert.equal(tag.status, 0, tag.stderr);
    assert.match(tag.stdout.trim(), new RegExp(`^v\\d{4}\\.\\d{2}\\.\\d{2}-${first.slice(0, 9)}$`));
    const firstNote = run("--to", first);
    assert.equal(firstNote.stderr, "", "no tag yet is not an error");
    assert.match(firstNote.stdout, /^What deployed as v[\d.]+-\w{9}:\n\n- The first thing is true \(#1\)\n$/);
    git("tag", tag.stdout.trim());
    git("commit", "--allow-empty", "-q", "-m", "The second thing is true (#2)");
    git("commit", "--allow-empty", "-q", "-m", "The third thing is true (#3)");
    const next = run("--to", "HEAD");
    assert.match(next.stdout, new RegExp(`since ${tag.stdout.trim()}:\\n\\n- The second thing is true \\(#2\\)\\n- The third`));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("a stale branch is one no open pull request stands for, older than the days asked; main is never one", () => {
  const now = Date.parse("2026-09-29T12:00:00Z");
  const branches = [
    { name: "main", lastCommitAt: "2026-09-01T00:00:00Z" },
    { name: "fix/folded-into-another", lastCommitAt: "2026-09-20T12:00:00Z" },
    { name: "scale/superseded", lastCommitAt: "2026-09-25T12:00:00Z" },
    { name: "s10/open-lane", lastCommitAt: "2026-09-10T12:00:00Z" },
    { name: "fix/yesterday", lastCommitAt: "2026-09-28T13:00:00Z" },
  ];
  assert.deepEqual(staleBranches({ branches, openHeads: new Set(["s10/open-lane"]), now, days: 2 }), [
    { name: "fix/folded-into-another", ageDays: 9 },
    { name: "scale/superseded", ageDays: 4 },
  ]);
  assert.deepEqual(
    staleBranches({ branches, openHeads: new Set(), now, days: 0 }).map((b) => b.name),
    ["s10/open-lane", "fix/folded-into-another", "scale/superseded", "fix/yesterday"],
  );
});
