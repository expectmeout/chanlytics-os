/**
 * The question ci.yml asks before it spends a runner on the phone app's check, and the wiring that asks it.
 *
 * The app is paused, and its check ran on every pull request and every push for an app almost none of them touch. It
 * runs now only when a change reaches what the app is built from (tooling/scripts/checks/mobile-paths-changed.mjs):
 * its own tree, the one module of the workspace it imports and everything that module reaches, and what an install
 * resolves. The script follows the imports as text, since it runs before anything is installed; here the compiler's
 * own reading of the same files is what it is held to, so an import form the text misses fails this, not a merge.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  MOBILE_PATHS,
  PHONE_APP_DOOR,
  couldThePhoneAppHaveChanged,
  phoneAppModules,
} from "../../../checks/mobile-paths-changed.mjs";
import { ROOT } from "../../_source.mjs";

const CLI = fileURLToPath(new URL("../../../checks/mobile-paths-changed.mjs", import.meta.url));
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const ask = (files) => spawnSync(process.execPath, [CLI], { input: files.join("\n") + "\n", encoding: "utf8" });

/** Every module the door reaches, as the compiler reads imports: type-only ones, re-exports and `import()` included. */
function reachedByTheCompiler() {
  const seen = new Set([PHONE_APP_DOOR]);
  const queue = [PHONE_APP_DOOR];
  while (queue.length) {
    const file = queue.pop();
    for (const { fileName } of ts.preProcessFile(read(file), true, true).importedFiles) {
      if (!fileName.startsWith(".")) continue;
      const base = path.posix.join(path.posix.dirname(file), fileName);
      const next = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((c) => {
        const at = path.join(ROOT, c);
        return fs.existsSync(at) && fs.statSync(at).isFile();
      });
      assert.ok(next, `${file} imports ${fileName}, which opens no file`);
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

test("the app takes one door from the workspace, and the walk from it finds what the compiler finds", () => {
  // The door: contracts' `./phone-app` export is this module, and the app's own tree names no other workspace import.
  const contracts = JSON.parse(read("packages/contracts/package.json"));
  assert.equal(contracts.exports["./phone-app"], `./${PHONE_APP_DOOR.replace("packages/contracts/", "")}`);
  const named = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const at = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(at);
      else if (/\.(ts|tsx)$/.test(entry.name))
        for (const { fileName } of ts.preProcessFile(read(at), true, true).importedFiles)
          if (fileName.startsWith("@chanlytics/")) named.add(fileName);
    }
  };
  walk("apps/mobile");
  assert.deepEqual([...named], ["@chanlytics/contracts/phone-app"], "the app imports the workspace through one door");

  const byText = [...phoneAppModules()].sort();
  assert.deepEqual(byText, [...reachedByTheCompiler()].sort(), "the walk as text reaches what the compiler reaches");
  assert.ok(byText.length > 1 && byText.includes("packages/contracts/src/mobile/app-bridge.ts"));
});

test("a change to the app, to a module its door reaches, or to what an install resolves runs the check; any other does not", () => {
  const reached = phoneAppModules();
  for (const file of [
    "apps/mobile/src/shell/Surface.tsx",
    "apps/mobile/package.json",
    PHONE_APP_DOOR,
    "packages/contracts/src/mobile/app-bridge.ts",
    "packages/contracts/package.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    ".github/workflows/ci.yml",
    "tooling/scripts/checks/mobile-paths-changed.mjs",
  ])
    assert.equal(couldThePhoneAppHaveChanged([file]), true, file);
  // A module of contracts the door does not reach, the dashboard, the edge, a migration, a document: none is the app's.
  const elsewhere = [
    "packages/contracts/src/deals/deal-words.ts",
    "packages/contracts/dist/index.js",
    "apps/dashboard/src/server/people/deals.ts",
    "apps/edge/lib/env.ts",
    "supabase/migrations/00357_a_deal_and_a_playbook_s_start_are_one_write.sql",
    "docs/runbook.md",
    "tooling/scripts/tests/repo/settings/mobile-paths-changed.test.mjs",
  ];
  for (const file of elsewhere) assert.ok(!reached.has(file), `${file} is not one the door reaches`);
  assert.equal(couldThePhoneAppHaveChanged(elsewhere), false);
  assert.equal(couldThePhoneAppHaveChanged([]), false, "no change is no change to the app");
  // A path is everything under it only when it is written as a directory: a neighbour that shares its first letters is not.
  assert.equal(couldThePhoneAppHaveChanged(["apps/mobile-notes.md", "package.json.bak"]), false);
  for (const p of MOBILE_PATHS)
    assert.ok(fs.existsSync(path.join(ROOT, p)), `${p} is a path of this repository, not a guess`);
});

test("the answer is a line for the workflow and a sentence for the log, and never an exit code", () => {
  const yes = ask(["docs/runbook.md", "apps/mobile/app.config.ts"]);
  assert.deepEqual([yes.status, yes.stdout.trim()], [0, "mobile=true"]);
  assert.match(yes.stderr, /apps\/mobile\/app\.config\.ts is something the phone app is built from/);
  const no = ask(["docs/runbook.md"]);
  assert.deepEqual([no.status, no.stdout.trim()], [0, "mobile=false"]);
  assert.match(no.stderr, /None of the 1 changed files reaches the phone app/);
});

test("ci.yml asks the question first, of the change itself, and every step after it waits for a yes", () => {
  const y = read(".github/workflows/ci.yml").replace(/\r\n/g, "\n");
  const from = y.indexOf("\n  mobile:\n");
  // To the next job's key, whichever it is.
  const next = y.slice(from + 1).search(/\n {2}[a-z0-9_-]+:\n/);
  const job = y.slice(from + 1, next < 0 ? undefined : from + 1 + next);
  assert.ok(from > 0 && job.includes("name: Mobile (typecheck, lint, doctor, bundle)"), "the job keeps its name");
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
      steps[1].includes('node tooling/scripts/checks/mobile-paths-changed.mjs >> "$GITHUB_OUTPUT"'),
    "then the question, of the change's own files",
  );
  assert.ok(steps[1].includes("workflow_dispatch"), "a run asked for by hand is a yes");
  assert.ok(steps.length >= 8, "the check's own steps are still there");
  for (const step of steps.slice(2))
    assert.ok(
      step.includes("steps.changed.outputs.mobile == 'true'"),
      `a step that runs whatever the answer: ${step.split("\n")[0]}`,
    );
});
