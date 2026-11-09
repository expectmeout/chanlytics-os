/**
 * How long and wide a backend module may be, and a door (decision 0107), with each measure kept honest on a source written for it. `_size.mjs` has the measures; what still falls is check:debt's (SIZE_RATCHETS).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { parse } from "../../_ast.mjs";
import {
  COGNITIVE_LIMIT,
  LEFT_WHOLE,
  MODULE_CODE_LIMIT,
  MODULE_EXPORT_LIMIT,
  SIZE_RATCHETS,
  backendModules,
  codeLinesIn,
  cognitiveOf,
  exportsIn,
  hardFunctionsIn,
  longDoors,
} from "./_size.mjs";

const source = (...lines) => ts.createSourceFile("probe.ts", lines.join("\n"), ts.ScriptTarget.Latest, true);
const firstFunction = (sf) => sf.statements.find(ts.isFunctionDeclaration);

test("a code line is a line with a token: a comment and a blank line are not", () => {
  assert.equal(codeLinesIn(source("/** A word. */", "// Another.", "", "const a = 1;", "", "export const b = a;")), 2);
});

test("a module's exports are what it declares and names itself, not what it hands on", () => {
  const sf = source(
    "export const a = 1, b = 2;",
    "export function c() {}",
    "export type D = string;",
    "const e = 1;",
    "export { e };",
    'export { f } from "./g";',
  );
  assert.equal(exportsIn(sf), 5);
});

test("cognitive complexity charges a branch for its depth, a chain once, and a run of one operator once", () => {
  const flat = firstFunction(
    source("function f(a) { if (a) { return 1; } else if (a > 1) { return 2; } else { return 3; } }"),
  );
  assert.equal(cognitiveOf(flat), 3, "if 1, else if 1, else 1");
  const deep = firstFunction(source("function f(a) { for (const x of a) { if (x) { if (x > 1) { return x; } } } }"));
  assert.equal(cognitiveOf(deep), 6, "for 1, if 2, if 3");
  const runs = firstFunction(source("function f(a, b, c) { return a && b && c; }"));
  assert.equal(cognitiveOf(runs), 1);
  const mixed = firstFunction(source("function f(a, b, c) { return a && b || c; }"));
  assert.equal(cognitiveOf(mixed), 2);
  const hard = source(`function f(a) { ${"if (a) { ".repeat(8)}${"} ".repeat(8)} }`);
  assert.equal(hardFunctionsIn(hard, COGNITIVE_LIMIT).length, 1);
});

test("the ratchets say what they hold and read the tree", () => {
  assert.deepEqual(SIZE_RATCHETS.map((r) => r.file).sort(), [
    "cognitive-complexity.json",
    "long-modules.json",
    "wide-modules.json",
  ]);
  for (const r of SIZE_RATCHETS) assert.ok(r.advice && r.name, r.file);
  assert.ok(backendModules().length > 1500, "the backend was read");
});

test("no backend module is past the limits, but those left whole for a reason", () => {
  const long = [];
  const wide = [];
  for (const f of backendModules()) {
    if (LEFT_WHOLE[f]) continue;
    const sf = parse(f);
    if (codeLinesIn(sf) > MODULE_CODE_LIMIT) long.push(f);
    if (exportsIn(sf) > MODULE_EXPORT_LIMIT) wide.push(f);
  }
  assert.deepEqual(long, [], `over ${MODULE_CODE_LIMIT} code lines: split it by what it holds`);
  assert.deepEqual(wide, [], `over ${MODULE_EXPORT_LIMIT} exports: split it by what its names are about`);
});

test("what is left whole still needs to be", () => {
  for (const f of Object.keys(LEFT_WHOLE)) {
    const sf = parse(f);
    assert.ok(
      codeLinesIn(sf) > MODULE_CODE_LIMIT || exportsIn(sf) > MODULE_EXPORT_LIMIT,
      `${f} is under the limits: take it off LEFT_WHOLE`,
    );
  }
});

test("a door stays thin", () => {
  assert.deepEqual(longDoors(), {}, "a door verifies, parses and answers; what else it holds goes behind it");
});
