#!/usr/bin/env node
/**
 * Which stretch of history database.yml asks its question of: could the database have changed?
 *
 * A pull request asks of its own diff against the base, a merge queue's commit of its group's, and a push to main of
 * everything since the last main commit whose replay passed, not only of its own push. A replay that was cancelled,
 * died on the runner or never started (the spending-limit block of 28 Sep) is then made up by the next push. Asking
 * only of its own push, a successor answered "not needed" while the merge before it carried a migration nothing had
 * replayed (the scorecard's defect 62: 00237). A last green commit that is unknown, or that main no longer holds
 * (a force-push), replays from zero: a question that cannot be answered is a replay, never a skip.
 *
 *   EVENT=push AFTER=<sha> LAST_GREEN=<sha, or empty> node tooling/scripts/checks/replay-range.mjs
 *   EVENT=pull_request BASE_REF=main node tooling/scripts/checks/replay-range.mjs
 *   EVENT=merge_group MERGE_BASE=<sha> AFTER=<sha> node tooling/scripts/checks/replay-range.mjs
 *
 * Prints db=true or db=false on stdout, for $GITHUB_OUTPUT, and the reason on stderr, for the log, as
 * db-paths-changed.mjs does, whose list of paths it asks. A git command that fails fails the step (exit 1): a crash
 * read as "not needed" would skip the replay this exists to run. The workflow reads LAST_GREEN from its own history
 * (`gh run list`), the one part that needs the network.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { firstDatabasePath } from "./db-paths-changed.mjs";

const short = (sha) => String(sha).slice(0, 9);

/**
 * The git range to ask about, as diff arguments, or the reason to replay without asking. `isAncestor(a, b)` says
 * whether commit a is in b's history.
 */
export function replayRange({ event, baseRef, mergeBase, after, lastGreen }, isAncestor) {
  if (event === "pull_request") return { diff: [`origin/${baseRef}...HEAD`], note: `The pull request's own diff.` };
  if (event === "merge_group") return { diff: [mergeBase, after], note: "The merge queue's group." };
  if (!lastGreen) return { replay: "No replay on main that passed is on record, so the migrations replay from zero." };
  if (!isAncestor(lastGreen, after))
    return {
      replay: `Main's last replay that passed (${short(lastGreen)}) is not in this history, so the migrations replay from zero.`,
    };
  return { diff: [lastGreen, after], note: `Everything since ${short(lastGreen)}, main's last replay that passed.` };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function main() {
  const { EVENT, BASE_REF, MERGE_BASE, AFTER, LAST_GREEN } = process.env;
  const isAncestor = (a, b) => {
    try {
      git("merge-base", "--is-ancestor", a, b);
      return true;
    } catch {
      return false;
    }
  };
  const asked = replayRange(
    { event: EVENT, baseRef: BASE_REF, mergeBase: MERGE_BASE, after: AFTER, lastGreen: LAST_GREEN },
    isAncestor,
  );
  if (asked.replay) {
    console.error(asked.replay);
    console.log("db=true");
    return;
  }
  const files = git("diff", "--name-only", ...asked.diff)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  console.error(asked.note);
  const hit = firstDatabasePath(files);
  if (hit) {
    console.error(`${hit} is something the replay depends on, so the migrations replay from zero.`);
    console.log("db=true");
  } else {
    console.error(`None of the ${files.length} changed files can change the database, so the replay is not needed.`);
    console.log("db=false");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
