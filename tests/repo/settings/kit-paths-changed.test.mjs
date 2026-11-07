/**
 * The question ci.yml asks before it spends a runner on the kit's gallery in a browser, and the wiring that asks it.
 *
 * The job runs the checks of e2e/kit/kit.spec.ts that take seconds, by name, when a pull request changes what they read
 * (tooling/scripts/e2e-harness/kit-paths-changed.mjs). Playwright itself lists what those names pick, with no browser, so a
 * check renamed or split out of the job fails here, where a job that quietly ran three of its four would stay green.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KIT_PATHS, firstKitPath } from "../../../tooling/scripts/e2e-harness/kit-paths-changed.mjs";
import { ROOT } from "../../_source.mjs";

const CLI = fileURLToPath(new URL("../../../tooling/scripts/e2e-harness/kit-paths-changed.mjs", import.meta.url));
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const ask = (files) => spawnSync(process.execPath, [CLI], { input: files.join("\n") + "\n", encoding: "utf8" });

/** One job's text: from its key to the next job's, whichever it is. */
function jobOf(name) {
  const y = read(".github/workflows/ci.yml");
  const from = y.indexOf(`\n  ${name}:\n`);
  assert.ok(from > 0, `the job ${name}`);
  const next = y.slice(from + 1).search(/\n {2}[a-z0-9_-]+:\n/);
  return y.slice(from + 1, next < 0 ? undefined : from + 1 + next);
}

test("a change to what the fast checks read runs them; any other does not", () => {
  for (const file of [
    "apps/dashboard/src/surfaces/kit/kit.css",
    "apps/dashboard/src/surfaces/kit/classes.json",
    "apps/dashboard/src/styles/tokens.css",
    "tooling/scripts/e2e-harness/kit-gallery.mjs",
    "tooling/scripts/e2e-harness/kit-shared.mjs",
    "e2e/kit/kit.spec.ts",
    "e2e/kit/kit-behaves.spec.ts",
    "e2e/kit/kit-checks.ts",
    ".github/workflows/ci.yml",
    "tooling/scripts/e2e-harness/kit-paths-changed.mjs",
  ])
    assert.equal(firstKitPath(["docs/runbook.md", file]), file, file);
  // A component of the kit, a page's stylesheet, another spec, the harness's server, a document: the nightly's.
  const elsewhere = [
    "apps/dashboard/src/surfaces/kit/button/button.tsx",
    "apps/dashboard/src/styles/record.css",
    "e2e/people/people.spec.ts",
    "tooling/scripts/e2e-harness/server.mjs",
    ".github/workflows/nightly-kit.yml",
    "docs/runbook.md",
  ];
  assert.equal(firstKitPath(elsewhere), null);
  assert.equal(firstKitPath([]), null, "no change is no change to the kit");
  // A path is everything under it only when it is written as a directory: a neighbour that shares its first letters is not.
  assert.equal(firstKitPath(["e2e/kit-notes.md", "apps/dashboard/src/surfaces/kit/kit.css.bak"]), null);
  for (const p of KIT_PATHS)
    assert.ok(fs.existsSync(path.join(ROOT, p)), `${p} is a path of this repository, not a guess`);
});

test("the answer is a line for the workflow and a sentence for the log, and never an exit code", () => {
  const yes = ask(["docs/runbook.md", "e2e/kit/kit-checks.ts"]);
  assert.deepEqual([yes.status, yes.stdout.trim()], [0, "kit=true"]);
  assert.match(yes.stderr, /e2e\/kit\/kit-checks\.ts is something the kit gallery's fast checks read/);
  const no = ask(["docs/runbook.md"]);
  assert.deepEqual([no.status, no.stdout.trim()], [0, "kit=false"]);
  assert.match(no.stderr, /None of the 1 changed files is one the kit gallery's fast checks read/);
});

test("ci.yml asks the question first, of the change itself, every step after it waits for a yes, and no gate needs it", () => {
  const job = jobOf("kit");
  assert.ok(
    job.includes("if: github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'"),
    "a pull request's, or a person's: a push to main is the nightly's",
  );
  assert.ok(job.includes("timeout-minutes: 10"), "Ruben, 10 Oct 2026: a push is through CI in under ten minutes");
  const steps = job
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n")
    .split(/\n {6}- /)
    .slice(1);
  assert.match(steps[0], /^uses: actions\/checkout@/, "the checkout is first");
  assert.ok(steps[0].includes("fetch-depth: 2"), "with the commit before it, which the question is asked against");
  assert.ok(
    steps[1].includes("id: changed") &&
      steps[1].includes("git diff --name-only HEAD^1 HEAD") &&
      steps[1].includes('node tooling/scripts/e2e-harness/kit-paths-changed.mjs >> "$GITHUB_OUTPUT"'),
    "then the question, of the change's own files",
  );
  assert.ok(steps[1].includes("workflow_dispatch"), "a run asked for by hand is a yes");
  assert.ok(steps.some((s) => s.includes("run: pnpm e2e:install")) && steps.some((s) => s.includes("pnpm e2e:local")));
  for (const step of steps.slice(2))
    assert.ok(
      step.includes("steps.changed.outputs.kit == 'true'"),
      `a step that runs whatever the answer: ${step.split("\n")[0]}`,
    );
  // Ruben decides when it may block: it is a part of no gate until then.
  assert.ok(!/\bkit\b/.test(/needs: \[.*\]/.exec(jobOf("typecheck"))?.[0] ?? "kit"), "the gate needs no kit job");
});

test("the job's names pick the spec's four quick checks and nothing else, on the record that draws the gallery", () => {
  const asked = /run: pnpm e2e:local -- e2e\/kit\/kit\.spec\.ts --scenario=kit --grep "([^"]+)"/.exec(jobOf("kit"));
  assert.ok(asked, "the spec, the record and the names, as the harness takes them");
  const listed = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "node_modules/@playwright/test/cli.js"),
      "test",
      "--list",
      "e2e/kit/kit.spec.ts",
      "--grep",
      asked[1],
    ],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, E2E_SCENARIO: "kit" } },
  );
  assert.equal(listed.status, 0, listed.stderr);
  const picked = listed.stdout
    .split(/\r?\n/)
    .filter((line) => line.includes("kit.spec.ts:"))
    .map((line) => line.split(" › ").at(-1));
  const quick = ["every class in", "every selector of", "a toast raised over", "every control an entry"];
  assert.deepEqual(
    picked.map((title) => quick.find((q) => title.startsWith(q))).sort(),
    [...quick].sort(),
    listed.stdout,
  );
});
