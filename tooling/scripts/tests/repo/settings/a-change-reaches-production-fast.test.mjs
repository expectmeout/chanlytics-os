/**
 * A change reaches production in minutes (16 Oct 2026, Ruben: "from project done to uploaded live on Vercel within a few
 * minutes tops"). What holds the parts that make it so:
 *
 *   - `land` (tooling/scripts/land.mjs) takes main's side only of files a command writes, and writes them again;
 *     every other conflict is a person's.
 *   - `check:local` runs everything after the build side by side (runTogether), and says each check's own result.
 *   - CI's tests run as four parts at once, each a quarter of the files, and the lint and the format check start from
 *     main's cache, which main's own lint writes afresh. The dashboard's build, the dist against its sources and the
 *     typecheck run side by side, each against the committed dist (repo/settings/workflow-rules.test.mjs holds it).
 *   - The edge's functions are built here (tooling/scripts/edge-functions.mjs, in seconds) and Vercel deploys them as
 *     they are, with the settings its own builder gave each, where it once compiled them one by one for seven minutes.
 *     CI's typecheck still reads the edge's own tsconfig, every function in it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import ts from "typescript";
import { isWritten, migrationsAdded, WRITERS } from "../../../land.mjs";
import { FIRST, LOCAL_CHECKS, runTogether } from "../../../checks/checked-locally.mjs";
import { cacheOptions } from "../../../checks/lint.mjs";
import { buildEdge, edgeFunctions, functionFiles, nodeMajor, ROUTES, vcConfig } from "../../../edge-functions.mjs";

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
    "sorted-lists.mjs",
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

test("a pull request that adds a migration never merges itself: land holds its auto-merge until it is applied", () => {
  assert.deepEqual(
    migrationsAdded([
      "supabase/migrations/00453_a_visit_says_where_it_came_from.sql",
      "apps/dashboard/src/surfaces/calendar/visit-sheet.tsx",
      "supabase/schema.sql",
      "supabase/migrations/README.md",
      "tooling/scripts/tests/fixtures/00453_a_visit_says_where_it_came_from.sql",
      "",
    ]),
    ["supabase/migrations/00453_a_visit_says_where_it_came_from.sql"],
    "a migration file, and nothing else the branch adds",
  );
  assert.deepEqual(
    migrationsAdded(["apps/edge/api/cron/notes.ts", "docs/decisions/0063-a.md"]),
    [],
    "none: it merges itself",
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

test("main's fresh lint keeps the cache the pull requests start from: emptied first, never turned off", async () => {
  assert.deepEqual(
    [cacheOptions({ LINT_CACHE: "0" }).fresh, cacheOptions({ LINT_CACHE: "0" }).cache],
    [true, true],
    "main lints every file afresh, and writes what it found",
  );
  assert.deepEqual([cacheOptions({}).fresh, cacheOptions({}).cache], [false, true]);
  // Why never off: ESLint deletes its cache file when the cache is off.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lint-cache-"));
  try {
    fs.writeFileSync(path.join(dir, "a.js"), "export const a = 1;\n");
    const cacheLocation = path.join(dir, ".cache/");
    const lint = (cache) =>
      new ESLint({ cwd: dir, overrideConfigFile: true, cache, cacheLocation, cacheStrategy: "content" }).lintFiles([
        "a.js",
      ]);
    const files = () => (fs.existsSync(cacheLocation) ? fs.readdirSync(cacheLocation) : []);
    await lint(true);
    assert.equal(files().length, 1, "a run with the cache on writes it");
    await lint(false);
    assert.equal(files().length, 0, "a run with it off deletes it: main left the pull requests nothing to start from");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Vercel deploys the edge's functions as they are built here, and runs no builder of its own over them", () => {
  const vercel = JSON.parse(read("apps/edge/vercel.json"));
  assert.deepEqual(Object.keys(vercel), ["builds"], "no `functions` beside `builds`: Vercel refuses the two together");
  assert.equal(vercel.builds.length, 1, "one build: zero-config's Node builder would compile each api file again");
  assert.deepEqual([vercel.builds[0].src, vercel.builds[0].use], ["package.json", "@vercel/static-build"]);
  assert.equal(
    JSON.parse(read("apps/edge/package.json")).scripts["vercel-build"],
    "node ../../tooling/scripts/edge-functions.mjs",
    "the static build runs the edge's vercel-build, then deploys the .vercel/output it leaves",
  );
  const doors = execFileSync("git", ["ls-files", "apps/edge/api"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => f.slice("apps/edge/".length));
  assert.deepEqual(functionFiles(), doors.sort(), "every door is a function, and nothing else is");
  for (const file of Object.keys(edgeFunctions())) assert.ok(doors.includes(file), `a limit for ${file}, a door`);
  assert.deepEqual(vcConfig(60, "24"), {
    handler: "index.js",
    runtime: "nodejs24.x",
    architecture: "x86_64",
    maxDuration: 60,
    environment: {},
    shouldDisableAutomaticFetchInstrumentation: false,
    launcherType: "Nodejs",
    shouldAddHelpers: true,
    shouldAddSourcemapSupport: true,
    awsLambdaHandler: "",
  });
  assert.equal("maxDuration" in vcConfig(undefined, "24"), false, "no limit written: the project's own");
  assert.equal(nodeMajor(), read(".nvmrc").trim(), "the functions run on the Node the project is set to (.nvmrc)");
  const slash = (p) => p.split(path.sep).join("/");
  const edge = ts.parseJsonConfigFileContent(
    ts.readConfigFile(path.join(ROOT, "apps/edge/tsconfig.json"), ts.sys.readFile).config,
    ts.sys,
    path.join(ROOT, "apps/edge"),
  );
  for (const file of doors)
    assert.ok(
      edge.fileNames.some((f) => slash(f).endsWith(`apps/edge/${file}`)),
      `CI's typecheck reads ${file}`,
    );
  assert.equal(fs.existsSync(path.join(ROOT, "apps/edge/api/tsconfig.json")), false, "an editor reads the edge's own");
});

test("a function built here loads, answers through its export, and carries the settings and limit Vercel needs", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "edge-output-"));
  try {
    await buildEdge({ out, files: ["api/cron/notes.ts", "api/stripe-webhook.ts"] });
    const fn = (file, name) => path.join(out, "functions", `${file.replace(/\.ts$/, "")}.func`, name);
    const config = JSON.parse(fs.readFileSync(fn("api/cron/notes.ts", ".vc-config.json"), "utf8"));
    assert.equal(config.maxDuration, 60, "the limit from vercel.json");
    assert.equal(JSON.parse(fs.readFileSync(fn("api/stripe-webhook.ts", ".vc-config.json"), "utf8")).maxDuration, 30);
    assert.equal(JSON.parse(fs.readFileSync(fn("api/cron/notes.ts", "package.json"), "utf8")).type, "module");
    assert.ok(fs.existsSync(fn("api/cron/notes.ts", "index.js.map")), "a stack trace names the source");
    const notes = await import(pathToFileURL(fn("api/cron/notes.ts", config.handler)).href);
    assert.equal(typeof notes.POST, "function", "the door's export, bundled with all it imports");
    // Without a database the door answers before it reads anything: its own refusal, from the bundle's own code.
    const kept = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    let answer;
    try {
      answer = await notes.POST(new Request("https://edge.test/api/cron/notes", { method: "POST" }));
    } finally {
      if (kept.url !== undefined) process.env.SUPABASE_URL = kept.url;
      if (kept.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = kept.key;
    }
    assert.equal(answer.status, 503);
    assert.deepEqual(await answer.json(), { ok: false, error: "no_database" });
    assert.ok(fs.existsSync(path.join(out, "static/index.html")), "public/ is the static");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, "config.json"), "utf8")), {
      version: 3,
      routes: ROUTES,
      crons: [],
    });
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
