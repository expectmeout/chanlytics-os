/**
 * No module of contracts reaches itself through the values it imports (Reach out, Part 2.6).
 *
 * The bundle declares every top-level name as a `var`, so a cycle among value imports never throws: the module the
 * cycle enters first runs with the other's names still undefined, and an initializer that reads one (a table, a set,
 * a helper object) is built from `undefined` without a word. That is how FIRST_RUN_HELPERS once read TRY_SKIPPED before
 * it was set (Part 2.5, PR 7), and the split that fixed it left one cycle that is safe: signup and workspace call
 * each other's function declarations from inside functions only. Any other cycle, and any new member of that one,
 * fails here, before a bundle can order it wrong.
 *
 * Type-only imports are erased and order nothing; a value import used only as a type is counted anyway, which errs on
 * the side of a cycle.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = path.join(ROOT, "packages/contracts/src");
// The compiler contracts itself declares.
const ts = createRequire(path.join(ROOT, "packages/contracts/package.json"))("typescript");

/** The one cycle allowed, and why it is safe: each calls the other's function declaration inside a function. */
const ALLOWED = [["workspace/signup.ts", "workspace/workspace.ts"]];

/**
 * Each module's value imports and re-exports of another module of the folder, from its source. Modules are named by
 * their path in the folder ("sub/x.ts"), and a specifier is resolved from the module that says it, so a subfolder or a
 * "../" is read as the bundle reads it: to a file ("x.ts") or a folder's index ("x/index.ts").
 */
function edgesOf(sources) {
  const names = new Set(sources.map(([f]) => f));
  const resolve = (from, spec) => {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)).replace(/\.(js|ts)$/, "");
    return [`${base}.ts`, `${base}/index.ts`].find((n) => names.has(n)) ?? `${base}.ts`;
  };
  const edges = new Map();
  for (const [f, text] of sources) {
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
    const out = new Set();
    for (const s of sf.statements) {
      if (!(ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) || !s.moduleSpecifier) continue;
      const spec = s.moduleSpecifier.text;
      if (!spec.startsWith(".")) continue;
      if (ts.isImportDeclaration(s)) {
        const c = s.importClause;
        if (c?.isTypeOnly) continue;
        const nb = c?.namedBindings;
        const allTypes =
          nb && ts.isNamedImports(nb) && nb.elements.length > 0 && nb.elements.every((e) => e.isTypeOnly);
        if (c && !c.name && allTypes) continue;
      } else if (s.isTypeOnly) continue;
      out.add(resolve(f, spec));
    }
    edges.set(f, out);
  }
  return edges;
}

/** The strongly connected components of more than one module (Tarjan), each sorted. */
function cyclesOf(edges) {
  let next = 0;
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const found = [];
  const visit = (v) => {
    index.set(v, next);
    low.set(v, next++);
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v) ?? []) {
      if (!edges.has(w)) continue;
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) !== index.get(v)) return;
    const c = [];
    let w;
    do {
      w = stack.pop();
      onStack.delete(w);
      c.push(w);
    } while (w !== v);
    if (c.length > 1) found.push(c.sort());
  };
  for (const v of edges.keys()) if (!index.has(v)) visit(v);
  return found.sort((a, b) => a[0].localeCompare(b[0]));
}

test("contracts has no value-import cycle but the one known safe pair", () => {
  const files = fs
    .readdirSync(SRC, { recursive: true })
    .map((n) => String(n).split(path.sep).join("/"))
    .filter((n) => n.endsWith(".ts"));
  const edges = edgesOf(files.map((f) => [f, fs.readFileSync(path.join(SRC, f), "utf8")]));
  assert.ok(edges.size > 50, `read the folder (${edges.size} modules)`);
  assert.deepEqual(
    cyclesOf(edges),
    ALLOWED,
    "a new cycle hands an initializer undefined without an error: move the shared value into a module both import",
  );
});

test("the check sees a cycle through an import or a re-export, and none through types alone", () => {
  const edges = edgesOf([
    ["a.ts", `import { b } from "./b";\nexport const A = b;`],
    ["b.ts", `export { c as b } from "./c";`],
    ["c.ts", `import A, { type X } from "./a";\nexport const c = () => A;`],
    // Types only, in each spelling: erased, so no cycle.
    ["d.ts", `import type { E } from "./e";\nexport type D = E;`],
    ["e.ts", `import { type D } from "./d";\nexport type { F } from "./f";\nexport type E = D;`],
    ["f.ts", `export type F = 1;\nimport "./other-package-free";`],
  ]);
  assert.deepEqual(cyclesOf(edges), [["a.ts", "b.ts", "c.ts"]]);
  assert.deepEqual([...edges.get("d.ts")], []);
  assert.deepEqual([...edges.get("e.ts")], []);
  // Through a subfolder, its index and a "../", as a future folder of contracts would.
  const nested = edgesOf([
    ["g.ts", `import { h } from "./sub/h.js";`],
    ["sub/h.ts", `export { i as h } from "./deep";`],
    ["sub/deep/index.ts", `import { g } from "../../g";\nexport const i = g;`],
  ]);
  assert.deepEqual(cyclesOf(nested), [["g.ts", "sub/deep/index.ts", "sub/h.ts"]]);
});
