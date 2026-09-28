/**
 * The wire says snake_case (docs/naming.md, decision 0022).
 *
 * Every name a /api/v1 route takes (its body, or a read's query) and answers is read with the type checker from the
 * typed client's registry (apps/dashboard/src/client/routes.generated.ts): each handler carries what it takes and
 * answers as a phantom `Shape<I, O>` (server/route.ts), so a route's JSON names are its types' property names, read
 * through unions, arrays and a record's values to six levels down. A name that is not snake_case and is not in
 * baselines/wire-casing.json fails the build. The bank holds the names the wire had when the rule was written, one
 * entry per route and name, and may only fall (_ratchet.mjs; docs/debt.md names it): a route that renames one banks
 * the fall with `UPDATE_BASELINES=1 corepack pnpm test`.
 *
 * A route that reads its body by hand is invisible here, as it is to the typed client: its input is `undefined`.
 * Declaring its `input` is what brings it under the rule.
 *
 * The measure is in _measures.mjs, beside the others the register prints. Its own file, not
 * code-health-ratchets.test.mjs, because it needs a program over the dashboard, not the syntax trees that file parses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { ROOT } from "../_source.mjs";
import { ratchet } from "../_ratchet.mjs";
import { WIRE_CASING, WIRE_REGISTRY, dashboardWire, isSnakeCase, offTheWire, wireShapes } from "../_measures.mjs";

ratchet(WIRE_CASING);

// The measure the ratchet rests on, kept honest: a handler whose module the checker could not resolve reads as
// `any`, a handler that takes or answers `any` or `unknown` as a whole shows no names, and a walk that stopped at the
// top would see a clean wire, so each would pass the ratchet and bank the names away. These say so instead. A field
// typed `unknown` below the top (a stored JSON column, an answer relayed from the edge) still hides the names under
// it: decision 0022 lists them.
test("the measure reads every handler in the registry, none hidden whole, and the names below each route's top level", async () => {
  const { ROUTES } = await import(pathToFileURL(path.join(ROOT, WIRE_REGISTRY)).href);
  const shapes = dashboardWire();
  assert.deepEqual(Object.keys(shapes).sort(), Object.keys(ROUTES).sort(), "one handler per key the client names");
  assert.deepEqual(
    Object.keys(shapes).filter((k) => !shapes[k]),
    [],
    "every handler carries a shape the checker can read",
  );
  assert.deepEqual(
    Object.keys(shapes).filter((k) => shapes[k].hidden.length),
    [],
    "no handler takes or answers `any` or `unknown` as a whole: its names would never reach the bank",
  );
  const names = new Set(Object.values(shapes).flatMap((io) => [...io.takes, ...io.answers]));
  assert.ok(
    [...names].filter(isSnakeCase).length > 300,
    `the walk reaches the answers' nested names: ${names.size} distinct names read`,
  );
});

// The walk, on a registry written for it: what counts as a name, how deep it looks, and what it passes over.
test("the walk reads a union's and an array's names and a record's values, to six levels, nothing JSON cannot carry, and says a side it cannot see into", () => {
  const file = "/fixture/routes.ts";
  const text = [
    "declare const shape: unique symbol;",
    "declare const brand: unique symbol;",
    "type Shape<I, O> = { readonly [shape]?: { input: I; output: O } };",
    'type Id = string & { readonly [brand]: "Id" };',
    "interface Row { row_id: Id; atMs: number; when: Date; tags: string[] }",
    "type Deep = { a: { b: { c: { d: { e: { deepName: 1; f: { tooDeep: 1 } } } } } } };",
    "export type Routes = {",
    '  "GET rows": Shape<{ page?: number }, { rows: Row[]; byWorkspace: Record<string, { lastSeen: string }>; nested: Deep }>;',
    '  "POST rows": Shape<{ askedAt: string } | { asked_at: string }, { saved: [{ savedAt: string }] }>;',
    '  "GET export": Shape<undefined, Response>;',
    '  "PUT relay": Shape<unknown, any>;',
    '  "GET bare": { run: () => void };',
    "};",
  ].join("\n");
  const options = { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022, types: [] };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, ...rest) =>
    name === file ? ts.createSourceFile(name, text, language) : read(name, language, ...rest);
  host.fileExists = (name) => name === file || ts.sys.fileExists(name);
  const shapes = wireShapes(ts.createProgram({ rootNames: [file], options, host }), file);

  assert.deepEqual(shapes["GET bare"], null, "a handler with no shape is null, never clean");
  assert.deepEqual(shapes["GET export"], { takes: [], answers: [], hidden: [] }, "a Response is no JSON names");
  assert.deepEqual(
    shapes["PUT relay"],
    { takes: [], answers: [], hidden: ["takes", "answers"] },
    "a body or an answer that is `any` or `unknown` as a whole is said, never read as clean",
  );
  assert.deepEqual(shapes["GET rows"].hidden, []);
  assert.deepEqual(shapes["GET rows"].takes, ["page"]);
  assert.ok(shapes["GET rows"].answers.includes("deepName"), "six levels below the answer");
  assert.ok(!shapes["GET rows"].answers.includes("tooDeep"), "and no further");
  assert.ok(!shapes["GET rows"].answers.some((n) => n.startsWith("__@")), "a brand is the type's, not the wire's");
  assert.ok(!shapes["GET rows"].answers.includes("getTime"), "a Date is written as a string");
  assert.deepEqual(offTheWire(shapes), {
    "GET rows answers atMs": 1,
    "GET rows answers byWorkspace": 1,
    "GET rows answers deepName": 1,
    "GET rows answers lastSeen": 1,
    "POST rows answers savedAt": 1,
    "POST rows takes askedAt": 1,
  });
});

test("snake_case is lower-case words joined by underscores", () => {
  for (const name of ["id", "reply_delay_ms", "e164", "max_llm_tokens_day", "deals_on"])
    assert.ok(isSnakeCase(name), name);
  for (const name of ["askedAt", "Id", "URL", "reply-delay", "_private", "a__b", "trailing_", "2fa"])
    assert.ok(!isSnakeCase(name), name);
});
