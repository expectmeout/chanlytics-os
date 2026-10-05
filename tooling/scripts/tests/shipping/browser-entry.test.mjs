/**
 * The browser's entry into contracts (decision 0024; gen/contracts-browser-entry.mjs): generated from the barrels and
 * committed, so this regenerates it in memory and refuses a stale copy; holds every value a page's module imports from
 * contracts to a name it exports, since a page's bundle reads this file and nothing else of the package; and reads the
 * built entry for the classic API it must not load.
 *
 * A page's module is one under the browser layers (legacy-bridge, client, yes, auth, surfaces, lib), a "use client"
 * file under app/, or instrumentation-client.ts. A miss here is a page that would not build: the bundler finds no such
 * export in the browser's entry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { generate, OUT } from "../../gen/contracts-browser-entry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const DASH = path.join(ROOT, "apps/dashboard");
const current = generate(ROOT);

test("the browser's entry is current", () => {
  assert.equal(
    fs.readFileSync(path.join(ROOT, OUT), "utf8").replace(/\r\n/g, "\n"),
    current.text,
    "run node tooling/scripts/gen/contracts-browser-entry.mjs",
  );
});

/** Every file a page's bundle may hold. */
function pageModules() {
  const out = [path.join(DASH, "instrumentation-client.ts")];
  const walk = (d, take) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, take);
      else if (/\.(ts|tsx|jsx)$/.test(e.name) && !/\.(type-test|d)\.ts$/.test(e.name) && take(p)) out.push(p);
    }
  };
  for (const layer of ["legacy-bridge", "client", "yes", "auth", "surfaces", "lib"])
    walk(path.join(DASH, "src", layer), () => true);
  walk(path.join(DASH, "app"), (p) => /^\s*["']use client["']/.test(fs.readFileSync(p, "utf8")));
  return out;
}

/** The values a module imports from the package's root, by the name the package exports them under. */
function contractsValues(file) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const names = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || st.moduleSpecifier.text !== "@chanlytics/contracts") continue;
    const c = st.importClause;
    if (!c || c.isTypeOnly) continue;
    assert.ok(!c.name, `${file}: contracts has no default export`);
    const b = c.namedBindings;
    assert.ok(!b || !ts.isNamespaceImport(b), `${file}: a namespace import of contracts reads names this cannot see`);
    for (const el of b?.elements ?? []) if (!el.isTypeOnly) names.push((el.propertyName ?? el.name).text);
  }
  return names;
}

test("every value a page imports from contracts is the browser entry's", () => {
  const exported = new Set(current.names);
  const missing = [];
  let read = 0;
  for (const file of pageModules()) {
    for (const name of contractsValues(file)) {
      read++;
      if (!exported.has(name)) missing.push(`${path.relative(ROOT, file).split(path.sep).join("/")}: ${name}`);
    }
  }
  assert.ok(read > 500, `the pages import ${read} values from contracts: the scan found too few to be the pages`);
  assert.deepEqual(
    missing,
    [],
    "a classic schema a page needs comes by import() from @chanlytics/contracts/write-rules",
  );
});

test("a page's bundle is pointed at the entry, and the server's at the index", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/contracts/package.json"), "utf8"));
  const root = pkg.exports["."];
  assert.deepEqual(Object.keys(root), ["types", "browser", "import", "default"], "the browser condition before import");
  assert.equal(root.browser, "./dist/browser.js");
  assert.equal(root.import, "./dist/index.js");
});

test("the built entry loads no classic zod", () => {
  const built = fs.readFileSync(path.join(ROOT, "packages/contracts/dist/browser.js"), "utf8");
  const specs = [...built.matchAll(/^import\b[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);
  assert.ok(specs.length > 0, "the entry imports zod's core and mini");
  assert.deepEqual(
    specs.filter((s) => ["zod", "zod/v4", "zod/v4/classic"].includes(s)),
    [],
    "classic zod in the browser's entry",
  );
});
