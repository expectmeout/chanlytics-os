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

test("the landed job reads pushes only, opens its issue once, and the Auckland leg does not fail the run until its tests are fixed", () => {
  const y = workflow("ci.yml");
  const landed = y.slice(y.indexOf("  landed:"));
  assert.ok(landed.includes("if: github.event_name == 'push'"));
  assert.ok(landed.includes("grep -qxF") && landed.includes("gh issue list"), "a re-run finds its issue open");
  const auckland = y.slice(y.indexOf("  auckland:"), y.indexOf("  # The title check above"));
  assert.ok(auckland.includes("continue-on-error: true"));
  assert.ok(
    auckland.includes("TZ: Pacific/Auckland") && auckland.includes("TEST_TZ: Pacific/Auckland"),
    "node's zone and the launcher's",
  );
});
