/**
 * A test file with a top-level `after` hook awaits nothing at its top level once its first test is written.
 *
 * Node's runner (22 and up) starts a file's tests while the file is still being read, and runs its top-level `after`
 * hooks as soon as the tests registered so far are done. A top-level `await` between two tests (an `import()`, a seed)
 * hands it that moment: when the await outlasts the tests above it, the hooks put the real `fetch` back, close the
 * database or unset the environment, and every test below runs without them. cron-doors-b went red that way on
 * 23 Nov 2026, 14 tests mailing the real provider, only on the runs where its import was slow; `TEST_SLOW_IMPORTS=1`
 * made it red every time. So in such a file every awaited import and seed comes before the first test.
 *
 * A top-level hook is an `after` called outside any function: in the file, in a function of its own it calls there,
 * or in a module beside it that it loads (`tests/today/zones/_world.mjs` registers one as it loads). Such a module
 * counts when it calls `after` anywhere: a helper it gives the file (`stubFetch()`) may register one when called, and
 * where the file calls it is not read, so the file holds the rule either way. One inside a
 * `describe` (or `suite`) is the suite's, and a suite's tests wait for its body, so an await there is not one either;
 * nor is an await inside a function. A test is a call of `test`, `it`, `describe` or `suite` as `node:test` gives them
 * (`.skip`, `.only`, `.todo` too), or of a function of the file's own that makes one, anywhere in a top-level statement.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse, repoFiles } from "../_ast.mjs";
import { ROOT } from "../_source.mjs";

const TESTS = new Set(["test", "it", "describe", "suite"]);
const AFTER = new Set(["after"]);
const MODIFIERS = new Set(["skip", "only", "todo"]);

/** What a file binds `node:test` to: each local name's export (`t` of `test as t`, a default is `test`), its namespaces. */
function nodeTestBindings(sf) {
  const byLocal = new Map();
  const spaces = new Set();
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    if (s.moduleSpecifier.text !== "node:test" || !s.importClause) continue;
    if (s.importClause.name) byLocal.set(s.importClause.name.text, "test");
    const bound = s.importClause.namedBindings;
    if (bound && ts.isNamespaceImport(bound)) spaces.add(bound.name.text);
    if (bound && ts.isNamedImports(bound))
      for (const e of bound.elements) byLocal.set(e.name.text, (e.propertyName ?? e.name).text);
  }
  return { byLocal, spaces };
}

/** `test`, `test.skip`, `nt.describe.only`: the identifiers a callee is read through, root first, or null. */
function chainOf(callee) {
  const out = [];
  let e = callee;
  while (ts.isPropertyAccessExpression(e)) {
    out.unshift(e.name.text);
    e = e.expression;
  }
  return ts.isIdentifier(e) ? [e.text, ...out] : null;
}

/** Whether `found` holds of `node` or a node under it, looking into the functions under it or not. */
const holds = (node, found, { intoFunctions }) => {
  let hit = false;
  const visit = (n) => {
    if (hit || (!intoFunctions && ts.isFunctionLike(n))) return;
    if (found(n)) hit = true;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return hit;
};

/** A top-level statement that only names a function: `function door() {}`, `const run = () => test(...)`. */
const definesOnly = (s) =>
  ts.isFunctionDeclaration(s) ||
  ts.isClassDeclaration(s) ||
  (ts.isVariableStatement(s) &&
    s.declarationList.declarations.every((d) => d.initializer && ts.isFunctionLike(d.initializer)));

/** Each function a file names, as its name and the function. */
function functionsOf(sf) {
  const out = [];
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) out.push([n.name.text, n]);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && ts.isFunctionLike(n.initializer))
      out.push([n.name.text, n.initializer]);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * Whether a call is one of `wanted` as `node:test` gives it (by any local name, or through a namespace), with only
 * `tails` after it (`test.skip`), or a call of a function of the file's own that makes one.
 */
function callOf(sf, wanted, tails) {
  const { byLocal, spaces } = nodeTestBindings(sf);
  const helpers = new Set();
  const isCall = (n) => {
    const chain = ts.isCallExpression(n) ? chainOf(n.expression) : null;
    if (!chain) return false;
    const [root, ...rest] = chain;
    if (rest.length === 0 && helpers.has(root)) return true;
    const tail = spaces.has(root) && wanted.has(rest[0]) ? rest.slice(1) : wanted.has(byLocal.get(root)) ? rest : null;
    return tail !== null && tail.every((p) => tails.has(p));
  };
  const fns = functionsOf(sf);
  for (let size = -1; size !== helpers.size;) {
    size = helpers.size;
    for (const [name, fn] of fns) if (holds(fn, isCall, { intoFunctions: true })) helpers.add(name);
  }
  return isCall;
}

/** Each top-level `await` (and `for await`) after the statement that writes the file's first test. */
function awaitsAfterTheFirstTest(sf) {
  const isTest = callOf(sf, TESTS, MODIFIERS);
  const first = sf.statements.findIndex((s) => !definesOnly(s) && holds(s, isTest, { intoFunctions: true }));
  if (first < 0) return [];
  const out = [];
  const visit = (n) => {
    if (ts.isFunctionLike(n)) return;
    if (ts.isAwaitExpression(n) || (ts.isForOfStatement(n) && n.awaitModifier))
      out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text: n.getText(sf).slice(0, 100) });
    else ts.forEachChild(n, visit);
  };
  for (const s of sf.statements.slice(first + 1)) visit(s);
  return out;
}

/** The scripts beside a file it loads by a relative path: an import, a re-export, or an `import("./x.mjs")` written out. */
function besideImports(sf) {
  const out = [];
  const add = (spec) => {
    const file = path.posix.normalize(path.posix.join(path.posix.dirname(sf.fileName), spec));
    if (spec.startsWith(".") && /\.m?js$/.test(file)) out.push(file);
  };
  const visit = (n) => {
    const from = ts.isImportDeclaration(n) || ts.isExportDeclaration(n) ? n.moduleSpecifier : null;
    if (from && ts.isStringLiteral(from)) add(from.text);
    const arg = ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword ? n.arguments[0] : null;
    if (arg && ts.isStringLiteralLike(arg)) add(arg.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const besideOnDisk = (file) => (fs.existsSync(path.join(ROOT, file)) ? parse(file) : null);

/** The modules beside a file that it loads, each read once. */
const besideOnce = (sf, read, seen) =>
  besideImports(sf).flatMap((f) => {
    if (seen.has(f)) return [];
    seen.add(f);
    const beside = read(f);
    return beside ? [beside] : [];
  });

/** Whether a module beside a test calls `after` anywhere, or loads one that does. */
const callsAfter = (sf, read, seen) =>
  holds(sf, callOf(sf, AFTER, new Set()), { intoFunctions: true }) ||
  besideOnce(sf, read, seen).some((b) => callsAfter(b, read, seen));

/** Whether a file registers a top-level `after` hook: itself, or through a module beside it that it loads. */
function hooksAfter(sf, read = besideOnDisk) {
  const isAfter = callOf(sf, AFTER, new Set());
  if (sf.statements.some((s) => !definesOnly(s) && holds(s, isAfter, { intoFunctions: false }))) return true;
  const seen = new Set([sf.fileName]);
  return besideOnce(sf, read, seen).some((b) => callsAfter(b, read, seen));
}

const written = (text) =>
  ts.createSourceFile("tests/case.test.mjs", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const lines = (text) => awaitsAfterTheFirstTest(written(text)).map((a) => a.line);

test("the measure finds an await after the first test, and only there", () => {
  const head = 'import { test, describe, it } from "node:test";\n';
  assert.deepEqual(lines(`${head}const a = await import("./a.mjs");\ntest("one", () => {});`), [], "before is fine");
  assert.deepEqual(lines(`${head}test("one", () => {});\nconst a = await import("./a.mjs");`), [3]);
  assert.deepEqual(lines(`${head}test.skip("one", () => {});\nawait seed();`), [3], ".skip is a test");
  assert.deepEqual(lines(`${head}describe("s", () => {});\nawait seed();`), [3], "a describe is a test");
  assert.deepEqual(lines(`${head}for (const c of cases) test(c, () => {});\nif (x) {\n  await seed();\n}`), [4]);
  assert.deepEqual(lines(`${head}cases.forEach((c) => it(c, () => {}));\nfor await (const r of rows) use(r);`), [3]);
  assert.deepEqual(lines(`${head}test("one", async () => { await go(); });\nconst f = async () => await go();`), []);
  assert.deepEqual(
    lines(`${head}describe("s", async () => {\n  it("a", () => {});\n  await go();\n});`),
    [],
    "a suite waits",
  );
  assert.deepEqual(
    lines(`${head}function door(n) { test(n, () => {}); }\nawait seed();\ndoor("a");\nawait seed();`),
    [5],
  );
  assert.deepEqual(lines(`import { test as t } from "node:test";\nt("one", () => {});\nawait seed();`), [3]);
  assert.deepEqual(lines(`import * as nt from "node:test";\nnt.test.only("one", () => {});\nawait seed();`), [3]);
  assert.deepEqual(lines(`${head}test.mock;\nawait seed();`), [], "a read of test is not a test");
});

test("the measure finds a top-level after hook: the file's, a function's it calls, a module's it loads", () => {
  const hooks = (text, beside = {}) =>
    hooksAfter(written(text), (f) =>
      f in beside ? ts.createSourceFile(f, beside[f], ts.ScriptTarget.Latest, true) : null,
    );
  const head = 'import { after, describe } from "node:test";\n';
  assert.equal(hooks(`${head}after(() => restore());`), true);
  assert.equal(hooks(`${head}if (db) {\n  after(() => db.end());\n}`), true, "in a block at the top");
  assert.equal(hooks(`${head}function stub() { after(() => restore()); }\nstub();`), true, "through a function");
  assert.equal(hooks(`${head}function stub() { after(() => restore()); }`), false, "a function never called");
  assert.equal(hooks(`${head}describe("s", () => { after(() => restore()); });`), false, "a suite's own");
  assert.equal(hooks(`import { after as last } from "node:test";\nlast(() => restore());`), true);
  const world = { "tests/_world.mjs": `${head}after(() => restore());` };
  assert.equal(hooks('import { W } from "./_world.mjs";', world), true, "a module beside it, as it loads");
  assert.equal(hooks('const w = await import("./_world.mjs");', world), true, "loaded by an import()");
  assert.equal(hooks('import { W } from "./_world.mjs";', { "tests/_world.mjs": "export const W = {};" }), false);
  const stub = { "tests/_stub.mjs": `${head}export function stubFetch() { after(() => restore()); }` };
  assert.equal(hooks('import { stubFetch } from "./_stub.mjs";\nstubFetch();', stub), true, "a helper it gives");
  const deeper = { ...world, "tests/_both.mjs": 'export * from "./_world.mjs";' };
  assert.equal(hooks('import { W } from "./_both.mjs";', deeper), true, "a module that module loads");
});

test("no test file with a top-level after hook awaits at its top level after its first test", () => {
  const files = repoFiles(["tests", "apps/mobile/test"]).filter((f) => f.endsWith(".test.mjs"));
  assert.ok(files.length > 1000, `the suite was read whole (${files.length} files)`);
  const found = files.flatMap((f) => {
    const sf = parse(f);
    const awaits = awaitsAfterTheFirstTest(sf);
    return awaits.length && hooksAfter(sf) ? awaits.map((a) => `${f}:${a.line}  ${a.text}`) : [];
  });
  assert.deepEqual(found, [], "move each import or seed above the file's first test");
});
