/**
 * Nothing in this repository sends anything to Expo by itself (Ruben, 7 October 2026: the phone app is paused, and
 * its runs were spending the plan). An EAS workflow (.eas/workflows) starts when a hand runs it, and on no push, tag,
 * pull request or schedule; and no GitHub workflow holds what it would need to run one, the Expo account's token.
 *
 * Until then the release ran on a tag v*.*.*, a pattern the tag release.yml gives every merge to main
 * (vYYYY.MM.DD-<sha>) also matched: each merge started an App Store build, which failed, and published an update to
 * the production channel. The preview ran on every push to main that changed what the app is made of.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const EAS_WORKFLOWS = "apps/mobile/.eas/workflows";
const GITHUB_WORKFLOWS = ".github/workflows";

const read = (file) => fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
const workflowsIn = (dir) =>
  fs
    .readdirSync(path.join(REPO_ROOT, dir))
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => `${dir}/${f}`);

/** What starts a workflow: the keys of its `on`, written as a block, a list or one word. */
function triggersOf(yaml) {
  const lines = yaml
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|\s)#.*$/, ""))
    .filter((l) => l.trim());
  const at = lines.findIndex((l) => /^["']?on["']?\s*:/.test(l));
  assert.ok(at >= 0, "the workflow says what starts it");
  const nameOf = (item) => item.replace(/^-\s*/, "").split(":")[0].replace(/["']/g, "").trim();
  const inline = lines[at].replace(/^["']?on["']?\s*:/, "").trim();
  if (inline) {
    return inline
      .replace(/[[\]{}]/g, "")
      .split(",")
      .map(nameOf)
      .filter(Boolean);
  }
  const block = [];
  for (const line of lines.slice(at + 1)) {
    if (!/^\s/.test(line)) break;
    block.push(line);
  }
  const depth = Math.min(...block.map((l) => l.search(/\S/)));
  return block.filter((l) => l.search(/\S/) === depth).map((l) => nameOf(l.trim()));
}

test("a trigger is read however it is written", () => {
  assert.deepEqual(triggersOf('on:\n  push:\n    tags: ["v*.*.*"]\n  workflow_dispatch: {}\njobs:\n  a: {}\n'), [
    "push",
    "workflow_dispatch",
  ]);
  assert.deepEqual(triggersOf("# why\non: # by hand\n  workflow_dispatch:\n    inputs:\n      a: {}\njobs:\n"), [
    "workflow_dispatch",
  ]);
  assert.deepEqual(triggersOf("on: [push, pull_request]\n"), ["push", "pull_request"]);
  assert.deepEqual(triggersOf("on: { schedule: [] }\n"), ["schedule"]);
  assert.deepEqual(triggersOf("on: push\n"), ["push"]);
  assert.deepEqual(triggersOf("on:\n  - push\n  - workflow_dispatch\n"), ["push", "workflow_dispatch"]);
});

test("an EAS workflow starts by hand, and by nothing else", () => {
  const files = workflowsIn(EAS_WORKFLOWS);
  assert.ok(files.length > 0, "the workflows were read");
  for (const file of files) assert.deepEqual(triggersOf(read(file)), ["workflow_dispatch"], file);
});

test("no GitHub workflow holds the Expo account's token, so none can build, update or submit", () => {
  const files = workflowsIn(GITHUB_WORKFLOWS);
  assert.ok(files.length > 0, "the workflows were read");
  assert.deepEqual(
    files.filter((file) => /EXPO_TOKEN|eas-cli|expo-github-action/.test(read(file))),
    [],
  );
});
