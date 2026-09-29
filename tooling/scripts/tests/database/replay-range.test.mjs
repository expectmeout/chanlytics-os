/**
 * Which history database.yml asks "could the database have changed?" of, run over a repository made here: a pull
 * request's own diff, a merge queue's group, and, for a push to main, everything since the last main commit whose
 * replay passed. Asking only of the push's own commits is defect 62: a replay cancelled on one merge (00237's) was never
 * made up, because its successor found nothing in its own push that touched the database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "../_source.mjs";
import { replayRange } from "../../checks/replay-range.mjs";

const SCRIPT = path.join(ROOT, "tooling/scripts/checks/replay-range.mjs");

/** A repository of commits, each writing files, and a runner that asks the script as the workflow's step does. */
function history(commits) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "replay-range-"));
  const git = (...args) =>
    execFileSync("git", ["-c", "user.name=ci", "-c", "user.email=ci@example.com", ...args], {
      cwd: dir,
      encoding: "utf8",
    }).trim();
  git("init", "-q", "-b", "main");
  const shas = {};
  for (const [name, files] of Object.entries(commits)) {
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), `${name}\n`);
    }
    git("add", "-A");
    git("commit", "-q", "-m", name);
    shas[name] = git("rev-parse", "HEAD");
  }
  const ask = (env) => {
    const r = spawnSync(process.execPath, [SCRIPT], {
      cwd: dir,
      env: { PATH: process.env.PATH ?? "", ...env },
      encoding: "utf8",
    });
    return { status: r.status, out: r.stdout.trim(), why: r.stderr.trim() };
  };
  return { dir, git, shas, ask, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("a push asks of everything since the last replay that passed: a cancelled replay's migration is made up by the next push", () => {
  const h = history({
    green: ["README.md"],
    "merge that carried a migration": ["supabase/migrations/00237_a_rule.sql"],
    "merge that only touched docs": ["docs/runbook.md"],
  });
  try {
    const push = (lastGreen) =>
      h.ask({ EVENT: "push", AFTER: h.shas["merge that only touched docs"], LAST_GREEN: lastGreen });
    // The migration's own replay never passed: main's last green is the commit before it.
    const madeUp = push(h.shas.green);
    assert.equal(madeUp.out, "db=true", madeUp.why);
    assert.match(madeUp.why, /supabase\/migrations\/00237_a_rule\.sql is something the replay depends on/);
    // Asked of the push's own commits alone, as the workflow did before: the docs-only merge answers no, and 00237
    // stays unreplayed. This is defect 62.
    const ownPushAlone = push(h.shas["merge that carried a migration"]);
    assert.equal(ownPushAlone.out, "db=false");
    assert.match(ownPushAlone.why, /Everything since \w{9}, main's last replay that passed/);
  } finally {
    h.done();
  }
});

test("no replay on record, or one main no longer holds, replays from zero: an unanswerable question is a replay", () => {
  const h = history({ one: ["README.md"], two: ["docs/a.md"] });
  try {
    const none = h.ask({ EVENT: "push", AFTER: h.shas.two, LAST_GREEN: "" });
    assert.equal(none.out, "db=true");
    assert.match(none.why, /No replay on main that passed is on record/);
    const gone = h.ask({ EVENT: "push", AFTER: h.shas.two, LAST_GREEN: "f".repeat(40) });
    assert.equal(gone.out, "db=true", "a green commit git does not know: a force-push took it");
    assert.match(gone.why, /not in this history/);
  } finally {
    h.done();
  }
});

test("a pull request asks of its own diff against its base, and a merge queue's commit of its group's", () => {
  const h = history({ base: ["README.md"], "the pull request": ["apps/dashboard/src/x.tsx"] });
  try {
    h.git("update-ref", "refs/remotes/origin/main", h.shas.base);
    const pr = h.ask({ EVENT: "pull_request", BASE_REF: "main", AFTER: h.shas["the pull request"] });
    assert.equal(pr.out, "db=false", pr.why);
    fs.mkdirSync(path.join(h.dir, "supabase/migrations"), { recursive: true });
    fs.writeFileSync(path.join(h.dir, "supabase/migrations/00001_x.sql"), "select 1;\n");
    h.git("add", "-A");
    h.git("commit", "-q", "-m", "a migration");
    assert.equal(h.ask({ EVENT: "pull_request", BASE_REF: "main" }).out, "db=true");
    const queued = h.ask({ EVENT: "merge_group", MERGE_BASE: h.shas.base, AFTER: h.git("rev-parse", "HEAD") });
    assert.equal(queued.out, "db=true", "the group carries the migration");
    assert.equal(
      h.ask({ EVENT: "merge_group", MERGE_BASE: h.shas.base, AFTER: h.shas["the pull request"] }).out,
      "db=false",
    );
  } finally {
    h.done();
  }
});

test("a git command that fails fails the step: it never reads as 'not needed'", () => {
  const h = history({ one: ["README.md"] });
  try {
    const r = h.ask({ EVENT: "pull_request", BASE_REF: "no-such-branch" });
    assert.notEqual(r.status, 0);
    assert.equal(r.out, "", "and prints no answer for the workflow to read");
  } finally {
    h.done();
  }
});

test("the range is the pull request's, the group's, or since the last green, and the reason to replay comes first", () => {
  const held = () => true;
  assert.deepEqual(replayRange({ event: "pull_request", baseRef: "main" }, held).diff, ["origin/main...HEAD"]);
  assert.deepEqual(replayRange({ event: "merge_group", mergeBase: "a", after: "b" }, held).diff, ["a", "b"]);
  assert.deepEqual(replayRange({ event: "push", after: "b", lastGreen: "a" }, held).diff, ["a", "b"]);
  assert.ok(replayRange({ event: "push", after: "b", lastGreen: "" }, held).replay);
  assert.ok(replayRange({ event: "push", after: "b", lastGreen: "a" }, () => false).replay);
});
