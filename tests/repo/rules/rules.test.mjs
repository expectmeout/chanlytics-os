/**
 * A rule's pattern lives in one place (decision 0108), and each measure of what is said twice is kept honest on a source written for it. `_rules.mjs` has the measures; what still falls is check:debt's (RULE_RATCHETS).
 * And every call out leaves through its door (layer 12, 25 Nov 2026): no global fetch past a client but the named exceptions.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import {
  CONSOLE_SINKS,
  FETCH_EXCEPTIONS,
  RULE_PATTERNS,
  RULE_RATCHETS,
  consoleCallsIn,
  copiedRuns,
  fetchesBy,
  fetchesIn,
  functionsIn,
  patternsOutsideTheirHomes,
  repeatedSentences,
  rulePatternsIn,
  sameFunctions,
  sentencesIn,
} from "./_rules.mjs";

const source = (...lines) => ts.createSourceFile("probe.ts", lines.join("\n"), ts.ScriptTarget.Latest, true);

const LONG = (a, b, c, word) => `(${a}: unknown): string => {
  const ${b} = typeof ${a} === "string" ? ${a}.trim() : "";
  if (!${b}) return "${word}";
  const ${c} = ${b}.split(" ").filter(Boolean);
  return ${c}.length > 1 ? ${c}.join("-") : ${b};
}`;

test("two functions the same but for their names are one shape", () => {
  const one = functionsIn(source(`export const first = ${LONG("value", "text", "parts", "none")};`));
  const two = functionsIn(source(`const second = ${LONG("raw", "trimmed", "words", "none")};`));
  assert.equal(one.length, 1, "long enough to be read");
  assert.equal(one[0].name, "first");
  assert.equal(one[0].shape, two[0].shape);
});

test("a literal is the rule: another literal is another function", () => {
  const one = functionsIn(source(`const a = ${LONG("v", "t", "p", "none")};`));
  const two = functionsIn(source(`const b = ${LONG("v", "t", "p", "nothing")};`));
  assert.notEqual(one[0].shape, two[0].shape);
});

test("a short function is not read: two guards agree by chance", () => {
  assert.deepEqual(functionsIn(source("const a = (v: string) => v.trim();")), []);
});

test("the same function in two modules names both, and one alone names neither", () => {
  const a = source(`const a = ${LONG("v", "t", "p", "none")};`);
  const b = source(`const b = ${LONG("x", "y", "z", "none")};`);
  const c = source(`const c = ${LONG("v", "t", "p", "other")};`);
  assert.deepEqual(
    sameFunctions([
      ["a.ts", a],
      ["b.ts", b],
      ["c.ts", c],
    ]),
    { "a.ts::a": 1, "b.ts::b": 1 },
  );
});

test("a long run the same as an earlier module's is counted there, and a module alone or a short run is not", () => {
  const words = Array.from({ length: 40 }, (_, i) => `"w${i}"`).join(", ");
  const first = source(`const a = [${words}];`);
  const second = source('import x from "./an-import";', `const b = [${words}];`);
  const alone = copiedRuns([["first.ts", first]]);
  assert.deepEqual(alone, {}, "the first to say it copied nothing");
  const both = copiedRuns([
    ["first.ts", first],
    ["second.ts", second],
  ]);
  assert.deepEqual(Object.keys(both), ["second.ts"]);
  assert.ok(both["second.ts"] >= 70, "the tokens of the run");
  const short = copiedRuns([
    ["a.ts", source('const a = ["w1", "w2", "w3"];')],
    ["b.ts", source('const b = ["w1", "w2", "w3"];')],
  ]);
  assert.deepEqual(short, {});
});

test("a sentence is a long string with words: not a short one, an import's path or a type", () => {
  const said = "A sentence long enough for someone to read it.";
  const sf = source(
    `import x from "./a-module/whose-path-is-long-enough-to-be-counted as words";`,
    `type T = "${said} As a type.";`,
    `const a = "${said}";`,
    'const b = "Short.";',
    'const c = "ALL_CAPS_WITH_NOTHING_ELSE_LONG_ENOUGH_TO_BE_COUNTED_HERE";',
  );
  assert.deepEqual([...sentencesIn(sf)], [said]);
});

test("a sentence in one module twice is not repeated, and in two it is", () => {
  const said = "A sentence long enough for someone to read it.";
  const a = source(`const a = "${said}";`, `const b = "${said}";`);
  assert.deepEqual(repeatedSentences([a]), {});
  assert.deepEqual(repeatedSentences([a, source(`const c = "${said}";`)]), { [said]: 2 });
});

test("the global fetch is counted, a port's or a client's method of that name is not", () => {
  const sf = source(
    'await fetch("https://example.com");',
    'await globalThis.fetch("https://example.com");',
    'await ports.fetch("https://example.com");',
    'await client.fetch("https://example.com");',
  );
  assert.equal(fetchesIn(sf), 2);
});

test("a reach for the global fetch by any name is counted: the window's, one handed to a client, never a key, a type or a local", () => {
  const reached = source(
    'await window.fetch("/api/v1/signup");',
    "const send = deps.fetch ?? self.fetch;",
    "makeClient(fetch, token);",
    "export function viaDoor(fetchImpl: typeof fetch = fetch) { return fetchImpl; }",
  );
  assert.equal(fetchesIn(reached), 4, "window.fetch, self.fetch, fetch handed on, fetch as a default");
  const named = source(
    "const port = { fetch: async () => null };",
    "interface Port { fetch(url: string): Promise<Response>; }",
    'if (typeof fetch !== "function") throw new Error("no fetch");',
    "type Send = typeof fetch;",
  );
  assert.equal(fetchesIn(named), 0, "a key, a method signature, typeof and a type are names");
  const local = source("function read(fetch) { return fetch('/x'); }");
  assert.equal(fetchesIn(local), 0, "a module's own fetch is its own");
});

test("every call out leaves through its door: no global fetch in apps or packages but where a named exception says why", () => {
  assert.deepEqual(
    fetchesBy({ exceptions: false }),
    {},
    "a provider, the edge, the dashboard or the bucket: channels' fetchFromProvider; a page's own route: the API client or client/own-route.ts",
  );
});

test("each exception is still there and still calls out, so the list says only what is true", () => {
  const excepted = Object.keys(fetchesBy({ exceptions: true }));
  for (const [at, why] of Object.entries(FETCH_EXCEPTIONS)) {
    assert.ok(why.length > 20, `${at}: says why`);
    assert.ok(
      excepted.some((f) => (at.endsWith("/") ? f.startsWith(at) : f === at)),
      `${at} calls out no more: take it off the list`,
    );
  }
});

test("a console call is counted, a logger's line is not; the two sinks still write with it", () => {
  const sf = source('console.warn("a", 1);', 'console.log("b");', 'log.warn("c", {});', 'logger().error("d");');
  assert.equal(consoleCallsIn(sf), 2);
  for (const [file, why] of Object.entries(CONSOLE_SINKS)) {
    assert.ok(why.length > 20, `${file}: says why`);
    const sink = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    assert.ok(consoleCallsIn(sink) > 0, `${file} writes no console line: take it off the list`);
  }
});

test("a rule's pattern is read by what it says, whatever its flags", () => {
  const sf = source(
    "const a = /^[0-9a-f-]{36}$/;",
    "const b = /^[0-9a-f-]{36}$/i;",
    "const c = /^\\d{4}-\\d{2}-\\d{2}$/;",
    "const d = /inside [0-9a-f-]{36} a longer text/;",
  );
  assert.deepEqual(
    rulePatternsIn(sf).map((r) => r.written),
    ["/^[0-9a-f-]{36}$/", "/^[0-9a-f-]{36}$/i", "/^\\d{4}-\\d{2}-\\d{2}$/"],
  );
});

test("every rule's home is there and still says its pattern", () => {
  for (const { rule, home, sources } of RULE_PATTERNS) {
    assert.ok(fs.existsSync(home), `${rule}: ${home} is gone`);
    const written = rulePatternsIn(
      ts.createSourceFile(home, fs.readFileSync(home, "utf8"), ts.ScriptTarget.Latest, true),
    ).map((r) => r.written);
    assert.ok(
      written.some((w) => sources.includes(w.slice(1, w.lastIndexOf("/")))),
      `${home} no longer says ${rule}`,
    );
  }
});

test("no rule's pattern is written outside its home", () => {
  assert.deepEqual(
    patternsOutsideTheirHomes(),
    [],
    "import it from its home: a second copy is a second rule the day one changes",
  );
});

test("the ratchets say what they hold and read the tree", () => {
  assert.deepEqual(RULE_RATCHETS.map((r) => r.file).sort(), [
    "console-calls.json",
    "copied-runs.json",
    "repeated-sentences.json",
    "same-functions.json",
  ]);
  for (const r of RULE_RATCHETS) {
    assert.ok(r.advice && r.name, r.file);
    assert.ok(
      Object.keys(r.measure()).length > 0,
      `${r.file} measured nothing: a falling number should be earned, not a broken reading`,
    );
  }
});
