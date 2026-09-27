/**
 * The measures and the bank, on sources written for them.
 *
 * code-health-ratchets.test.mjs holds the repository's numbers; this holds what a
 * number means, on inline modules small enough to count by hand. Each case is one
 * the measures or the bank got wrong before a review of Phase 0, so a test here
 * fails on the old definition and passes on the one the plan (§5) writes down.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import ts from "typescript";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { bank, compare } from "../_ratchet.mjs";
import { functionsIn, windowUse, unknownCasts, copiesAmong } from "../_ast.mjs";
import { bankedSourceScan } from "../_measures.mjs";
import { knipCommand } from "../../check-dead-exports.mjs";

const source = (text, name = "fixture.ts") =>
  ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

/* ---- The bank ---- */

// It used to write the measure and then compare the measure with itself, so
// `UPDATE_BASELINES=1` banked a rise, or a new offender, as readily as a fall.
test("banking takes a fall and a removal, and leaves a rise and a new key to a raise", () => {
  const baseline = { fell: 5, rose: 3, gone: 2, fn: { lines: 200, branches: 40, depth: 6 } };
  const now = { fell: 4, rose: 7, fresh: 1, fn: { lines: 190, branches: 42, depth: 6 } };
  const banked = bank(now, baseline);
  assert.deepEqual(banked, { fell: 4, fn: { lines: 190, branches: 40, depth: 6 }, rose: 3 });
  // So the build still fails on what the bank would not take.
  assert.deepEqual(compare(now, banked).worse, [
    "fn: now lines 190, branches 42, depth 6, baseline lines 190, branches 40, depth 6",
    "fresh: new (1)",
    "rose: now 7, baseline 3",
  ]);
  assert.deepEqual(compare(now, banked).better, []);
  // Banking twice is banking once: the register reads a baseline another process may just have banked.
  assert.deepEqual(bank(now, banked), banked);
  // A raise takes the measure as it is, and seeds a baseline that is missing; a plain bank seeds nothing.
  assert.deepEqual(bank(now, baseline, { raise: true }), now);
  assert.equal(bank(now, null), null);
  assert.deepEqual(bank(now, null, { raise: true }), now);
});

// The source-scan ratchet banked on `UPDATE_BASELINES=1` too, by writing every count as measured.
test("a source-scan count banks by the same rule, and a repo-wide lint's count is a record", () => {
  const baseline = {
    lint: ["repo/lint.test.mjs"],
    counts: { "a.test.mjs": 3, "gone.test.mjs": 1, "repo/lint.test.mjs": 10 },
  };
  const counts = { "a.test.mjs": 5, "new.test.mjs": 2, "repo/lint.test.mjs": 12 };
  assert.deepEqual(bankedSourceScan(counts, baseline, false), { "a.test.mjs": 3, "repo/lint.test.mjs": 12 });
  assert.deepEqual(bankedSourceScan(counts, baseline, true), counts);
});

test("a set's numbers are a record: its keys may only go, its numbers follow the measure", () => {
  const baseline = { __A: 2, __B: 5, __GONE: 1 };
  const now = { __A: 4, __B: 1, __NEW: 1 };
  assert.deepEqual(bank(now, baseline, { mode: "set" }), { __A: 4, __B: 1 });
  assert.deepEqual(compare(now, baseline, "set"), {
    worse: ["__NEW: new (1)"],
    better: ["__B: now 1, baseline 5", "__GONE: gone (baseline 1)"],
  });
});

/* ---- Functions, as ESLint's `complexity` and `max-depth` count them ---- */

test("an else-if chain is flat, and a ternary adds no depth", () => {
  const [chain] = functionsIn(
    source(
      "function f(x){ if(x===1){} else if(x===2){} else if(x===3){} else if(x===4){} else if(x===5){} else if(x===6){} }",
    ),
  );
  assert.deepEqual([chain.branches, chain.depth], [7, 1]);
  const [flat] = functionsIn(source("function g(a){ return a ? (b ? 1 : 2) : 3 }"));
  assert.deepEqual([flat.branches, flat.depth], [3, 0]);
});

test("a nested function's branches and depth are its own, not its container's", () => {
  const [outer, inner] = functionsIn(
    source("function outer(xs){ return xs.map(x => { if(x){ if(x>1){ if(x>2){ return 1 } } } return 0 }) }"),
  );
  assert.deepEqual([outer.branches, outer.depth], [1, 0]);
  assert.deepEqual([inner.branches, inner.depth], [4, 3]);
});

test("defaults, logical assignment and optional chaining are branches", () => {
  const [g] = functionsIn(source("function g(a = 1, b = 2){ let c; c ??= 1; c ||= 2; c &&= 3; return a?.b?.c }"));
  assert.equal(g.branches, 8);
});

// The definition, checked against ESLint itself: every function in the module has the
// complexity ESLint's `complexity` reports for it and the depth `max-depth` reports
// inside it. Written one function head per line, so a report's line names its function.
test("every function counts as ESLint counts it", () => {
  const code = [
    "function chain(x) {",
    "  if (x === 1) {",
    "  } else if (x === 2) {",
    "  } else if (x === 3) {",
    "  } else {",
    "    if (x) {",
    "    }",
    "  }",
    "}",
    "function outer(xs) {",
    "  return xs.map((x) => {",
    "    if (x) {",
    "      for (const y of x) {",
    "        while (y) {",
    "          break;",
    "        }",
    "      }",
    "    }",
    "    return x ? 1 : 2;",
    "  });",
    "}",
    "function defaults(a = 1, { b = 2, c: { d = 3 } = {} } = {}, [e = 4] = []) {",
    "  let f;",
    "  f ??= a;",
    "  f ||= b;",
    "  f &&= d;",
    "  [f = 5] = [];",
    "  ({ g: f = 6 } = {});",
    "  const { h = 7 } = {};",
    "  return a?.b?.c ?? d?.(e) ?? e?.[0] ?? h;",
    "}",
    "function tries(a, b, c) {",
    "  try {",
    "    if (a) {",
    "      do {",
    "      } while (b);",
    "    }",
    "  } catch (e) {",
    "    switch (e) {",
    "      case 1:",
    "        if (c) {",
    "        }",
    "        break;",
    "      default:",
    "    }",
    "  } finally {",
    "    for (;;) {",
    "      break;",
    "    }",
    "  }",
    "}",
    "class K {",
    "  x = a ?? b;",
    "  static {",
    "    if (c) {",
    "    }",
    "  }",
    "  method(p = 1) {",
    "    return p || this.x;",
    "  }",
    "  get g() {",
    "    return a && b;",
    "  }",
    "  constructor() {",
    "    if (a) {",
    "    }",
    "  }",
    "}",
    "const arrow = (a) => (a && b ? <div>{a ?? <span />}</div> : null);",
    "function withClass() {",
    "  class Inner {",
    "    y = a || b;",
    "    m() {",
    "      return c ?? d;",
    "    }",
    "  }",
    "  return new Inner();",
    "}",
  ].join("\n");
  const linter = new Linter();
  const reports = linter.verify(
    code,
    [
      {
        files: ["**/*.tsx"],
        languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
        rules: { complexity: ["error", 0], "max-depth": ["error", 0] },
      },
    ],
    "fixture.tsx",
  );
  assert.deepEqual(
    reports.filter((r) => r.fatal),
    [],
  );
  const fns = functionsIn(source(code, "fixture.tsx"));
  // max-depth reports each block at its depth; a block belongs to the innermost function around its line.
  const innermost = (line) =>
    fns.filter((f) => line >= f.line && line < f.line + f.lines).sort((a, b) => a.lines - b.lines)[0];
  const eslint = new Map(fns.map((f) => [f.line, { line: f.line, branches: NaN, depth: 0 }]));
  for (const r of reports) {
    if (r.ruleId === "complexity") {
      // A class field's initializer is a code path of its own to ESLint and no function to the measure.
      if (/^Class field initializer/.test(r.message)) continue;
      const row = eslint.get(r.line) ?? { line: r.line, branches: NaN, depth: 0 };
      row.branches = Number(r.message.match(/complexity of (\d+)/)[1]);
      eslint.set(r.line, row);
    } else if (r.ruleId === "max-depth") {
      const row = eslint.get(innermost(r.line).line);
      row.depth = Math.max(row.depth, Number(r.message.match(/\((\d+)\)/)[1]));
    }
  }
  assert.deepEqual(
    fns.map((f) => ({ line: f.line, branches: f.branches, depth: f.depth })),
    [...eslint.values()].sort((a, b) => a.line - b.line),
  );
});

// A key named its function by its place among every callback in the file, so adding
// one anywhere above renamed it. A callback is now named by the function it is written
// in and what it is handed to, and numbered among those alone.
test("a callback's key survives an unrelated callback added above it", () => {
  const key = (text) =>
    functionsIn(source(text))
      .filter((f) => f.branches > 30)
      .map((f) => f.key);
  const body = "if(a){} ".repeat(31);
  const before = key(`function A(){ useEffect(() => { ${body} }) }`);
  const after = key(`function A(){ useMemo(() => 1); xs.map(x => x); useEffect(() => { ${body} }) }`);
  assert.deepEqual(before, ["A/useEffect(fn)#1"]);
  assert.deepEqual(after, before);
  const named = functionsIn(
    source("const B = () => <b onClick={() => go()} />; function C(){ return new Promise((r) => r()) }", "b.tsx"),
  );
  assert.deepEqual(
    named.map((f) => f.key),
    ["B#1", "B/onClick={fn}#1", "C#1", "C/Promise(fn)#1"],
  );
});

/* ---- Casts hide nothing ---- */

test("a window read or written through a cast or an alias is still one", () => {
  const use = windowUse(
    source(
      [
        "const a = (window as any).__FOO;",
        "const b = (<any>window).__QUX;",
        "const { __BAR, plain } = window as any;",
        "(window as any).__BAZ = 1;",
        "Object.assign(window as unknown as object, {});",
        "window.__OK;",
        'window["__QUOTED"];',
        "window[__notAName];",
        "function f() {",
        "  const w = window as unknown as Record<string, unknown>;",
        "  w.__ALIAS;",
        "  w.x = 1;",
        "}",
        "function g(w: { __NOT: number; y: number }) {",
        "  w.__NOT;",
        "  w.y = 2;",
        "}",
      ].join("\n"),
    ),
  );
  assert.deepEqual([...use.names].sort(), ["__ALIAS", "__BAR", "__BAZ", "__FOO", "__OK", "__QUOTED", "__QUX"]);
  assert.equal(use.publishers, 3);
});

test("a value laundered through unknown is counted however it is written", () => {
  const casts = (text) => unknownCasts(source(text));
  assert.equal(casts("const a = x as unknown as T;"), 1);
  assert.equal(casts("const a = (x as unknown) as T;"), 1);
  assert.equal(casts("const a = <T><unknown>x;"), 1);
  assert.equal(casts("const a = <T>(<unknown>x);"), 1);
  assert.equal(casts("const a = x as unknown; const b = y as T;"), 0);
});

/* ---- Copies ---- */

// A name shorter than four letters was skipped, which hid the helpers most often copied
// (`num`, `str`, `obj`, `hex`, `sum`); plan §5 has no such floor.
test("a short name declared in three files is a copy like any other", () => {
  const files = ["a", "b", "c"].map((f) =>
    source(`const num = (v) => Number(v); function plural(n) { return n; } const ${f}Only = 1;`, `${f}.ts`),
  );
  assert.deepEqual(copiesAmong(files, 3), { num: 3, plural: 3 });
});

/* ---- knip without pnpm ---- */

// check-dead-exports spawned a bare `pnpm`, which a corepack-only machine does not have.
test("knip runs from node alone, from knip's own bin", () => {
  const [exe, args] = knipCommand(["--version"]);
  assert.equal(exe, process.execPath);
  assert.match(args[0].split(path.sep).join("/"), /\/knip\/bin\/knip\.js$/);
  // A PATH that holds node and nothing else: no pnpm, no corepack shim.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== "PATH"));
  const out = execFileSync(exe, args, { encoding: "utf8", env: { ...env, PATH: path.dirname(process.execPath) } });
  assert.match(out.trim(), /^\d+\.\d+\.\d+$/);
});
