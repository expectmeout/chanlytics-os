/**
 * The rules of the workflows that decide whether main is verified after every merge, read as text like the nightly's in
 * ops-hygiene.test.mjs (no YAML parser is a dependency here). A workflow cannot run in this suite, so what it proves
 * is the scripts' tests; what these hold is the wiring a script's test cannot see, each one a way a rule goes quietly
 * wrong: a merge whose run is cancelled, a page that asks nothing of the history, an issue no job may open.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../_source.mjs";

const dir = path.join(ROOT, ".github/workflows");
const workflow = (name) => fs.readFileSync(path.join(dir, name), "utf8").replace(/\r\n/g, "\n");
const all = fs.readdirSync(dir).filter((f) => f.endsWith(".yml"));
/** One job's text: from its key to the next job's (a line of two spaces, a name and a colon) or the file's end. */
const job = (y, name) => {
  const start = y.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `the job ${name}`);
  const next = y.slice(start + 1).search(/\n {2}[a-z0-9_-]+:\n/);
  return next < 0 ? y.slice(start) : y.slice(start, start + 1 + next);
};

test("main is verified after every merge: a pull request's newer run cancels its older, a main commit is never cancelled", () => {
  // A group shared by pushes cancels a queued run even with cancel-in-progress: false, so each main commit's group is
  // its own (the scorecard's defect 15: 44% of main's CI runs cancelled).
  for (const [file, prefix] of [
    ["ci.yml", "ci"],
    ["database.yml", "database"],
  ]) {
    const y = workflow(file);
    assert.ok(
      y.includes(`group: ${prefix}-\${{ github.event.pull_request.number || github.sha }}`),
      `${file}: the group`,
    );
    assert.ok(
      y.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"),
      `${file}: only a pull request`,
    );
    assert.match(y, /^ {2}merge_group:\s*$/m, `${file} answers a merge queue`);
  }
});

test("the replay's question is the script's: the range since the last green replay, never the push's own commits", () => {
  const y = workflow("database.yml");
  assert.ok(y.includes('node tooling/scripts/checks/replay-range.mjs >> "$GITHUB_OUTPUT"'));
  assert.ok(y.includes("gh run list") && y.includes("--status success") && y.includes("--workflow database.yml"));
  assert.ok(!y.includes("github.event.before"), "a push's own range is what let a cancelled replay go unmade up");
  assert.ok(y.includes("actions: read"), "the history is read with the token's own permission");
  assert.ok(y.includes('migration-ledger.mjs --base "origin/$BASE_REF"'), "a pull request's ledger is held to main's");
});

test("every workflow that opens or closes an issue may write issues, and no run of the release is cancelled", () => {
  for (const file of all) {
    const y = workflow(file);
    if (/gh issue create|rolling-issue\.mjs/.test(y)) assert.ok(/issues: write/.test(y), `${file} opens issues`);
  }
  const release = workflow("release.yml");
  assert.ok(release.includes("group: release") && release.includes("cancel-in-progress: false"));
  assert.ok(release.includes("contents: write"), "the tag and the release are written");
});

test("a smoke of a preview is cancelled only by a newer preview of the same branch and project, not by another event", () => {
  // Every deployment_status event takes the group before the job's `if:` is read: the other project's event, or the
  // `inactive` status GitHub adds to the previous deployment, would cancel the run that matters.
  const y = workflow("preview-smoke.yml");
  const group = /group: (preview-smoke-.+)/.exec(y)?.[1] ?? "";
  for (const part of ["deployment.ref", "deployment.environment", "deployment_status.state"])
    assert.ok(group.includes(part), `the group carries ${part}: ${group}`);
});

test("a rolling issue closes only the issues its own titles opened, never one a person wrote with the same first words", () => {
  const nightly = workflow("nightly-e2e.yml");
  const matches = [...nightly.matchAll(/--match "([^"]+)"/g)].map((m) => m[1]);
  for (const prefix of ["Nightly e2e is red", "Nightly e2e failed ", "Nightly e2e hit its cap "])
    assert.ok(matches.includes(prefix), `the nightly matches "${prefix}"`);
  assert.ok(!matches.includes("Nightly e2e"), "a bare prefix would close a person's issue");
  assert.ok(workflow("migration-ledger.yml").includes(`--match "Production's migrations disagree with main's"`));
});

test("the landed job reads pushes only, opens its issue once, and the Auckland leg fails the run like any other", () => {
  const y = workflow("ci.yml");
  const landed = y.slice(y.indexOf("  landed:"));
  assert.ok(landed.includes("if: github.event_name == 'push'"));
  assert.ok(landed.includes("grep -qxF") && landed.includes("gh issue list"), "a re-run finds its issue open");
  const auckland = y.slice(y.indexOf("  auckland:"), y.indexOf("  # The title check above"));
  assert.ok(!auckland.includes("continue-on-error: true"), "green since the tests lane: a red leg is a red run");
  // Ruben, 1 Oct 2026: the second zone costs a second ~20-minute suite, so it runs when a pull request asks for it with
  // the `suite` label or a person starts it, and no other event (a merge queue's commit or a push) runs it. It is not a
  // required check, so a merge needs nothing from it.
  assert.ok(
    auckland.includes(
      "if: contains(github.event.pull_request.labels.*.name, 'suite') || github.event_name == 'workflow_dispatch'",
    ),
    "the Auckland leg runs on the `suite` label or by hand, as CLAUDE.md says",
  );
  assert.ok(
    auckland.includes("TZ: Pacific/Auckland") && auckland.includes("TEST_TZ: Pacific/Auckland"),
    "node's zone and the launcher's",
  );
});

test("every pull request runs the tests of what it changed, and a label starts the suite alone, never CI again", () => {
  const y = workflow("ci.yml");
  assert.match(y, /pull_request:\n {4}types: \[opened, synchronize, reopened\]\n/, "no `labeled`: a label re-ran CI");
  const tests = job(y, "tests");
  assert.ok(tests.includes("fetch-depth: 2"), "the merge commit's base, for HEAD^1..HEAD");
  assert.ok(tests.includes("run: node tooling/scripts/checks/changed-tests.mjs HEAD^1 HEAD"));
  assert.ok(
    tests.includes(
      "if: github.event_name == 'pull_request' && !contains(github.event.pull_request.labels.*.name, 'suite')",
    ),
    "a labelled pull request runs the whole suite instead",
  );
  assert.ok(
    tests.includes("contains(github.event.pull_request.labels.*.name, 'suite'))"),
    "the label asks for the suite whatever the laptop ran",
  );
  const suite = workflow("suite.yml");
  assert.match(suite, /pull_request:\n {4}types: \[labeled\]\n/);
  assert.equal((suite.match(/if: github\.event\.label\.name == 'suite'/g) ?? []).length, 2, "both legs, on that label");
  assert.ok(!/Typecheck|Secret scan|Migrations replay/.test(suite), "no required check's name");
});

test("the nightly's node suite has its own job and cap, the specs run after it whatever it said, and one report says which half was red", () => {
  const y = workflow("nightly-e2e.yml");
  const suite = y.slice(y.indexOf("  suite:"), y.indexOf("  e2e:"));
  assert.ok(suite.includes("timeout-minutes: 45") && suite.includes("run: pnpm test"));
  const e2e = y.slice(y.indexOf("  e2e:"), y.indexOf("  report:"));
  assert.ok(
    e2e.includes("needs: suite") && e2e.includes("if: ${{ !cancelled() }}"),
    "after, never beside, never skipped",
  );
  assert.ok(!e2e.includes("run: pnpm test\n"), "the suite runs once");
  const report = y.slice(y.indexOf("  report:"));
  assert.ok(report.includes("needs: [suite, e2e]") && report.includes("always()"));
  assert.ok(report.includes("SUITE: ${{ needs.suite.result }}") && report.includes("SPECS: ${{ needs.e2e.result }}"));
});

test("every job says how long it may run: a step that hangs is ended at its cap, not at GitHub's six hours", () => {
  // No job had a cap on ci.yml, database.yml, release.yml, suite.yml or the ledger's compare (9 Oct 2026), so a hung
  // install or a stack that never came up would have held a runner, and the account's minutes, for 360 minutes.
  for (const file of all) {
    const lines = workflow(file).split("\n");
    const jobs = [];
    for (const line of lines.slice(lines.indexOf("jobs:") + 1)) {
      const job = /^ {2}([a-z0-9_-]+):\s*$/.exec(line);
      if (job) jobs.push({ name: job[1], cap: null });
      const cap = /^ {4}timeout-minutes: (\d+)\s*$/.exec(line);
      if (cap && jobs.length) jobs.at(-1).cap = Number(cap[1]);
    }
    assert.ok(jobs.length > 0, `${file}: its jobs were read`);
    for (const { name, cap } of jobs)
      assert.ok(cap !== null && cap >= 1 && cap <= 60, `${file}: the job ${name} has no cap of an hour or less`);
  }
});

test("Typecheck, the check branch protection requires, is a gate over parts that run side by side", () => {
  // Ruben, 10 Oct 2026: a push is through CI in under ten minutes. The parts run at once after `scope`; the gate keeps
  // the required check's name, runs whatever they said, and fails on a part that failed or was cancelled.
  const y = workflow("ci.yml");
  const gate = job(y, "typecheck");
  assert.ok(gate.includes("name: Typecheck"), "the name branch protection matches");
  assert.ok(gate.includes("needs: [scope, build, lint, hygiene, tests]"), "every part");
  assert.ok(gate.includes("if: ${{ always() }}"), "a gate that ran nothing would read as a pass");
  assert.ok(gate.includes('.result == "failure" or .result == "cancelled"'));
  for (const part of ["build", "lint", "hygiene", "tests"]) assert.ok(job(y, part).includes("needs: scope"), part);
});

test("a tree checked locally skips lint, hygiene, the tests and the typecheck, never the build and the bundle", () => {
  const y = workflow("ci.yml");
  const scope = job(y, "scope");
  assert.ok(scope.includes("fetch-depth: 2"), "the merge commit's second parent is the pull request's head");
  assert.ok(scope.includes('run: node tooling/scripts/checks/checked-locally.mjs --ci >> "$GITHUB_OUTPUT"'));
  assert.ok(scope.includes("run: node tooling/scripts/checks/pr-title.mjs"), "the title fails first");
  for (const part of ["lint", "hygiene"])
    assert.ok(job(y, part).includes("if: needs.scope.outputs.checked != 'true'"), part);
  assert.ok(job(y, "tests").includes("needs.scope.outputs.checked != 'true' ||"));
  const build = job(y, "build");
  assert.ok(!/\n {4}if:/.test(build), "the build job runs for every change");
  assert.ok(build.includes("- if: needs.scope.outputs.checked != 'true'\n        run: pnpm -r typecheck"));
  assert.ok(
    build.includes("run: git diff --exit-code -- packages/*/dist"),
    "what the other parts read is the source's",
  );
  assert.ok(build.includes("run: pnpm --filter @chanlytics/dashboard build") && build.includes("pnpm check:bundle"));
});

test("the replay runs every database suite on main, and on a pull request the ones its changes name", () => {
  const y = workflow("database.yml");
  assert.ok(
    y.includes(
      "- if: steps.changed.outputs.db == 'true' && github.event_name != 'pull_request'\n        run: pnpm test:db",
    ),
  );
  assert.ok(y.includes("if: steps.changed.outputs.db == 'true' && github.event_name == 'pull_request'"));
  assert.ok(y.includes("run: node tooling/scripts/checks/changed-tests.mjs --db HEAD^1 HEAD"));
  assert.ok(workflow("nightly-database.yml").includes("run: pnpm test:db"), "every night, every suite");
});
