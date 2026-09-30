/**
 * The one list of what the migrations replay depends on, and the question the
 * Database workflow asks of every pull request before it starts a Supabase stack.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { couldTheDatabaseHaveChanged } from "../../checks/db-paths-changed.mjs";
import { ROOT } from "../_source.mjs";
import { parse } from "../_ast.mjs";

const CLI = fileURLToPath(new URL("../../checks/db-paths-changed.mjs", import.meta.url));
const ask = (files) => spawnSync(process.execPath, [CLI], { input: files.join("\n") + "\n", encoding: "utf8" });

test("a migration, a SQL suite, the checks' inputs or the lockfile could change what the replay proves", () => {
  for (const file of [
    "supabase/migrations/00123_a_new_rule.sql",
    "supabase/seed.sql",
    "supabase/config.toml",
    "tooling/scripts/tests/database/tenancy.db.test.mjs",
    "tooling/scripts/tests/reports/metrics.integration.test.mjs",
    "tooling/scripts/tests/_second-factor.mjs",
    "packages/db/src/repositories/calls.ts",
    "packages/db/dist/index.js",
    // What the suites run against the stack: core, jobs, the edge, the dashboard's server and routes. Each of these
    // skipped the replay on main while a suite loaded it (06ebd0a2f, 00e310ef5, 65b12330a).
    "packages/core/src/inbound/answer-inbound.ts",
    "packages/core/dist/index.js",
    "packages/jobs/src/broadcast-send.ts",
    "packages/jobs/dist/index.js",
    "apps/edge/api/cron/calls.ts",
    "apps/edge/lib/billing/billing.ts",
    "apps/edge/lib/reach-out/sender.ts",
    "apps/dashboard/src/server/people/erasure/erasure.ts",
    "apps/dashboard/src/lib/supabase/server.ts",
    "apps/dashboard/app/api/v1/conversations/[id]/reply/route.ts",
    "packages/contracts/src/schema-sets.generated.ts",
    "tooling/scripts/gen/schema-sets.mjs",
    "tooling/scripts/gen/db-types.mjs",
    "tooling/scripts/gen/unique-keys.mjs",
    "tooling/scripts/tests/_unique-keys.generated.json",
    "tooling/scripts/checks/migration-ledger.mjs",
    "tooling/scripts/checks/replay-range.mjs",
    "tooling/scripts/checks/test.mjs",
    "tooling/scripts/checks/coverage.mjs",
    ".github/workflows/database.yml",
    "tooling/scripts/checks/db-paths-changed.mjs",
    "package.json",
    "pnpm-lock.yaml",
  ]) {
    assert.equal(couldTheDatabaseHaveChanged([file]), true, file);
  }
});

test("a change that leaves the database alone does not start a stack", () => {
  for (const files of [
    [],
    ["apps/dashboard/src/x.tsx"],
    ["apps/dashboard/src/legacy/pages/inbox.jsx", "docs/system-map.md", ".github/workflows/ci.yml"],
    ["tooling/scripts/tests/tenancy.test.mjs"],
    ["packages/contracts/src/calendar/calendar-words.ts", "packages/contracts/dist/index.js"],
    ["packages/channels/src/lines/sms.ts", "packages/channels/dist/index.js"],
  ]) {
    assert.equal(couldTheDatabaseHaveChanged(files), false, files.join(", ") || "no files");
  }
});

test("patterns read the way GitHub reads paths filters", () => {
  // ** crosses directories
  assert.equal(couldTheDatabaseHaveChanged(["packages/db/src/deep/nested/file.ts"]), true);
  // and the suites sit in domain folders, at any depth
  assert.equal(couldTheDatabaseHaveChanged(["tooling/scripts/tests/nested/x.db.test.mjs"]), true);
  assert.equal(couldTheDatabaseHaveChanged(["tooling/scripts/tests/nested/deeper/x.integration.test.mjs"]), true);
  // * does not: a helper is one at the root of the tests
  assert.equal(couldTheDatabaseHaveChanged(["tooling/scripts/tests/nested/_world.mjs"]), false);
  // a pattern with no directory matches at the root only
  assert.equal(couldTheDatabaseHaveChanged(["apps/dashboard/package.json"]), false);
  // a dot is a dot
  assert.equal(couldTheDatabaseHaveChanged(["pnpm-lockxyaml"]), false);
});

test("the workflow reads the answer from stdout and the reason from the log", () => {
  const yes = ask(["apps/dashboard/src/x.tsx", "supabase/migrations/00123_a_new_rule.sql"]);
  assert.equal(yes.status, 0, yes.stderr);
  assert.equal(yes.stdout.trim(), "db=true");
  assert.match(yes.stderr, /supabase\/migrations\/00123_a_new_rule\.sql is something the replay depends on/);

  const no = ask(["apps/dashboard/src/x.tsx", "docs/system-map.md"]);
  assert.equal(no.status, 0, no.stderr);
  assert.equal(no.stdout.trim(), "db=false");
  assert.match(no.stderr, /None of the 2 changed files can change the database/);

  const nothing = ask([]);
  assert.equal(nothing.status, 0, nothing.stderr);
  assert.equal(nothing.stdout.trim(), "db=false");
});

/**
 * What a stack suite loads and the list may leave out, each with why. Contracts is words and shapes, pure functions
 * with no database in them; the one database fact it holds, the CHECK sets, is schema-sets.generated.ts, which the
 * list names. Channels is the providers' wires. Either reaches a suite's rows only through core, jobs or db, whose dists
 * a change to it rewrites (they bundle both), so the replay runs when it matters and not on every change of a word.
 */
const NOT_THE_DATABASE = [
  [/^packages\/contracts\/(src|dist)\//, "contracts: words and shapes; its CHECK sets are on the list"],
  [/^packages\/channels\/(src|dist)\//, "channels: the providers' wires; core and jobs bundle what they use"],
];

test("every module a stack suite loads, followed through its imports, is on the list", () => {
  const suites = execFileSync("git", ["ls-files", "tooling/scripts/tests"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => /\.(db|integration)\.test\.mjs$/.test(f));
  assert.ok(suites.length > 50, `found only ${suites.length} stack suites: is this the repository's tree?`);
  const outside = new Map();
  for (const suite of suites) {
    for (const file of loadedBy(suite)) {
      if (couldTheDatabaseHaveChanged([file]) || NOT_THE_DATABASE.some(([re]) => re.test(file))) continue;
      outside.set(file, [...(outside.get(file) ?? []), suite]);
    }
  }
  assert.deepEqual(
    [...outside].map(
      ([file, by]) => `${file} (loaded by ${by[0]}${by.length > 1 ? ` and ${by.length - 1} more` : ""})`,
    ),
    [],
    "a stack suite loads these, and a change to one would skip the replay: add their tree to DB_PATHS " +
      "(tooling/scripts/checks/db-paths-changed.mjs), or to NOT_THE_DATABASE here with why",
  );
});

/* ---- What a test file loads: every file of the repository it imports, and everything those import ---- */
// Read from the syntax tree, never the text: an import or export's specifier, a dynamic `import()` of a literal, and, in
// a test or a helper beside it, a string that names a module by its path from the root (`at("apps/edge/lib/pg.ts")`)
// or from the file (`"../_fake-db.mjs"`). A package imported by name (`@chanlytics/core`) is its source,
// `packages/<name>/src/index.ts`, followed like any other: its dist is built from those files in the same change. The
// dashboard's `@/` is `apps/dashboard/src/`. A module outside the repository (node_modules) is not followed.

const MODULE = /\.(ts|tsx|mjs|js)$/;
/** A module named by its path from the root, as a test hands one to `at()`. */
const FROM_ROOT = /^(apps|packages|tooling)\/[^\s'"`]+\.(ts|tsx|mjs|js)$/;
const FROM_HERE = /^\.\.?\/[^\s'"`]+\.(ts|tsx|mjs|js)$/;

const exists = (rel) => {
  try {
    return fs.statSync(path.join(ROOT, rel)).isFile();
  } catch {
    return false;
  }
};

/** A specifier, as the file at `from` wrote it, to a repo-relative file; null when it is not the repository's. */
function resolve(from, spec) {
  const pkg = /^@chanlytics\/([a-z-]+)(\/.*)?$/.exec(spec);
  if (pkg) {
    const entry = `packages/${pkg[1]}/src/index.ts`;
    return exists(entry) ? entry : null;
  }
  let base;
  if (spec.startsWith("@/")) base = path.posix.join("apps/dashboard/src", spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.posix.join(path.posix.dirname(from), spec);
  else if (FROM_ROOT.test(spec)) base = spec;
  else return null;
  const candidates = [
    base,
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
  ];
  return candidates.find((c) => MODULE.test(c) && exists(c)) ?? null;
}

/** The specifiers one file names: its imports and exports, a literal `import()`, and in a script, a module's path. */
function specifiersOf(file) {
  const sf = parse(file);
  const script = /\.(mjs|js)$/.test(file);
  const out = [];
  const visit = (n) => {
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    )
      out.push(n.moduleSpecifier.text);
    else if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0])
    )
      out.push(n.arguments[0].text);
    else if (script && ts.isStringLiteralLike(n) && (FROM_ROOT.test(n.text) || FROM_HERE.test(n.text)))
      out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const followed = new Map();

/** Every repository file `file` loads, itself excluded, followed to the end. Repo-relative, forward slashes. */
function loadedBy(file) {
  const seen = new Set();
  const walk = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    let next = followed.get(f);
    if (!next) {
      next = specifiersOf(f)
        .map((s) => resolve(f, s))
        .filter(Boolean);
      followed.set(f, next);
    }
    for (const n of next) walk(n);
  };
  walk(file);
  seen.delete(file);
  return seen;
}
