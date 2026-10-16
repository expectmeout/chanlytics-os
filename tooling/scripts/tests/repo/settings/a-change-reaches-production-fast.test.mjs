/**
 * A change reaches production in minutes (16 Oct 2026, Ruben: "from project done to uploaded live on Vercel within a few
 * minutes tops"). What holds the parts that make it so:
 *
 *   - `land` (tooling/scripts/land.mjs) takes main's side only of files a command writes, and writes them again;
 *     every other conflict is a person's.
 *   - `check:local` runs everything after the build side by side (runTogether), and says each check's own result.
 *   - CI's tests run as four parts at once, each a quarter of the files, and the lint and the format check start from
 *     main's cache, which main's own lint writes afresh.
 *   - Vercel's builder compiles each edge function from that function and its imports alone (apps/edge/api/tsconfig.json
 *     includes nothing), and CI's typecheck still reads the edge's own tsconfig, every function in it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { isWritten, WRITERS } from "../../../land.mjs";
import { FIRST, LOCAL_CHECKS, runTogether } from "../../../checks/checked-locally.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("land takes main's side only of what a command writes, and has a command for each", () => {
  for (const file of [
    "packages/contracts/dist/index.d.ts",
    "packages/db/dist/index.js",
    "packages/contracts/src/browser.generated.ts",
    "packages/contracts/src/route-keys.generated.ts",
    "apps/dashboard/src/client/routes.generated.ts",
    "packages/contracts/src/schema-sets.generated.ts",
    "tooling/scripts/tests/_unique-keys.generated.json",
    "docs/api.md",
    "docs/data-model.md",
  ])
    assert.equal(isWritten(file), true, file);
  for (const file of [
    "packages/contracts/src/ask-proposals/guide.ts",
    "supabase/schema.sql",
    "supabase/migrations/00448_an_owners_correction_is_kept.sql",
    "docs/debt.md",
    "apps/dashboard/src/surfaces/settings/autonomy/pane.tsx",
    "packages/contracts/distance.ts",
  ])
    assert.equal(isWritten(file), false, `${file} is a person's to resolve`);
  const commands = WRITERS.map(([, c]) => c).join(" | ");
  for (const writer of [
    "contracts-browser-entry.mjs",
    "route-types.mjs",
    "gen:api-reference",
    "gen:data-model",
    "build",
  ])
    assert.ok(commands.includes(writer), writer);
  assert.match(
    WRITERS.at(-1)[1],
    /--filter "\.\/packages\/\*" build/,
    "the dist last, from the sources the others read",
  );
});

test("check:local builds first, then runs the rest side by side and says each one's own result", async () => {
  assert.deepEqual(
    LOCAL_CHECKS.slice(0, FIRST).map(([name]) => name),
    ["the packages' build", "dist matches the sources"],
  );
  const said = [];
  const node = JSON.stringify(process.execPath);
  const failed = await runTogether(
    [
      ["a slow one", `${node} -e "setTimeout(() => console.log('slow done'), 300)"`],
      ["a failing one", `${node} -e "console.error('it broke'); process.exit(3)"`],
      ["a function", () => 0],
    ],
    ROOT,
    (text) => said.push(text),
  );
  assert.deepEqual(failed, ["a failing one"]);
  const text = said.join("");
  assert.match(text, /check:local: a function/);
  assert.match(text, /check:local: a failing one \(\d+s, failed\)\nit broke/, "a failure says all it printed");
  assert.match(text, /check:local: a slow one \(\d+s\)\nslow done/);
  assert.ok(text.indexOf("a failing one") < text.indexOf("a slow one"), "each is said as it ends, not in turn");
});

test("CI's tests run as four parts at once, and lint and format start from main's cache", () => {
  const ci = read(".github/workflows/ci.yml");
  assert.match(ci, /name: Tests of what changed \(\$\{\{ matrix\.shard \}\}\/4\)/);
  assert.match(ci, /fail-fast: false\n\s+matrix:\n\s+shard: \[1, 2, 3, 4\]/);
  assert.match(ci, /changed-tests\.mjs HEAD\^1 HEAD --test-shard=\$\{\{ matrix\.shard \}\}\/4/);
  assert.match(ci, /pnpm test -- --test-shard=\$\{\{ matrix\.shard \}\}\/4/);
  assert.match(ci, /path: node_modules\/\.cache\/eslint/);
  assert.match(ci, /LINT_CACHE: \$\{\{ github\.event_name == 'push' && '0' \|\| '1' \}\}/, "main lints afresh");
  assert.match(ci, /path: node_modules\/\.cache\/prettier/);
  assert.match(read("package.json"), /"format:check": "prettier --check \. --cache --cache-strategy content/);
  const picker = spawnSync(
    process.execPath,
    ["tooling/scripts/checks/changed-tests.mjs", "--list", "HEAD", "HEAD", "--test-shard=1/4"],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
  assert.equal(picker.status, 0, picker.stderr);
});

test("Vercel compiles each edge function from its own imports, and CI's typecheck still reads every function", () => {
  const vercel = JSON.parse(read("apps/edge/vercel.json"));
  assert.equal(vercel.installCommand, undefined, "Vercel's own install");
  assert.equal(vercel.buildCommand, undefined, "no build command: the edge's project has no output folder to find");
  // The builder finds its tsconfig from the function it compiles first, walking up: the api folder's, for every function.
  const slash = (p) => p.split(path.sep).join("/");
  for (const fn of ["apps/edge/api/admin/billing.ts", "apps/edge/api/cron/notes.ts"]) {
    const found = ts.findConfigFile(slash(path.join(ROOT, fn)), ts.sys.fileExists);
    assert.equal(slash(path.relative(ROOT, found)), "apps/edge/api/tsconfig.json", fn);
  }
  const parse = (rel) => {
    const file = path.join(ROOT, rel);
    return ts.parseJsonConfigFileContent(ts.readConfigFile(file, ts.sys.readFile).config, ts.sys, path.dirname(file));
  };
  const builder = parse("apps/edge/api/tsconfig.json");
  assert.deepEqual(builder.fileNames, [], "a function's program starts from the function alone");
  assert.deepEqual(
    builder.errors.map((e) => e.code).filter((c) => c !== 18002 && c !== 18003),
    [],
    "nothing but the empty list the builder ignores",
  );
  const edge = parse("apps/edge/tsconfig.json");
  assert.equal(builder.options.module, edge.options.module, "the edge's own settings, inherited");
  assert.equal(builder.options.isolatedModules, true, "each file emits alone, as a transpiler sees it");
  assert.ok(
    edge.fileNames.some((f) => slash(f).endsWith("apps/edge/api/admin/billing.ts")),
    "CI's typecheck still reads every function",
  );
});
