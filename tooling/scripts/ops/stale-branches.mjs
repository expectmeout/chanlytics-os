#!/usr/bin/env node
/**
 * The remote branches no open pull request stands for, older than N days: a list, never a deletion.
 *
 * `delete_branch_on_merge` deletes only a merged pull request's own head, so a lane folded into another pull request,
 * or superseded by one, leaves its branch behind, and the next session can take it for open work: 21 of 31 non-main
 * branches on 29 Sep 2026 (the scorecard's I2:3). This lists them with the age of their last commit. Deleting one is
 * Ruben's call; the last line says the command he would run.
 *
 *   git fetch --prune origin && node tooling/scripts/ops/stale-branches.mjs [--days 7]
 *
 * Reads the remote-tracking refs git holds and the open pull requests through `gh`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const DAY_MS = 24 * 3600 * 1000;
/** What is never stale: the trunk, and the name a remote gives its default. */
const KEPT = new Set(["main", "HEAD"]);

/**
 * The branches no open pull request stands for, whose last commit is older than `days`, oldest first, each with its
 * age in whole days. `branches` are [{ name, lastCommitAt }]; `openHeads` the head branches of open pull requests.
 */
export function staleBranches({ branches, openHeads, now, days }) {
  return branches
    .filter((b) => !KEPT.has(b.name) && !openHeads.has(b.name))
    .map((b) => ({ name: b.name, ageDays: Math.floor((now - Date.parse(b.lastCommitAt)) / DAY_MS) }))
    .filter((b) => b.ageDays >= days)
    .sort((a, b) => b.ageDays - a.ageDays || a.name.localeCompare(b.name));
}

function main() {
  const at = process.argv.indexOf("--days");
  const days = at >= 0 ? Number(process.argv[at + 1]) : 7;
  const refs = execFileSync(
    "git",
    ["for-each-ref", "refs/remotes/origin", "--format=%(refname:strip=3)%09%(committerdate:iso-strict)"],
    { encoding: "utf8" },
  );
  const branches = refs
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, lastCommitAt] = line.split("\t");
      return { name, lastCommitAt };
    });
  const open = JSON.parse(
    execFileSync("gh", ["pr", "list", "--state", "open", "--limit", "300", "--json", "headRefName"], {
      encoding: "utf8",
    }),
  );
  const stale = staleBranches({ branches, openHeads: new Set(open.map((p) => p.headRefName)), now: Date.now(), days });
  if (!stale.length) {
    console.log(`No remote branch without an open pull request is older than ${days} days.`);
    return;
  }
  console.log(`${stale.length} remote branches have no open pull request and no commit for ${days} days or more:`);
  for (const b of stale) console.log(`  ${String(b.ageDays).padStart(3)} d  ${b.name}`);
  console.log("\nDeleting one is Ruben's call, one at a time: git push origin --delete <branch>");
}

// Run as a script, not when a test imports it.
const real = (p) => fs.realpathSync.native(p);
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main();
