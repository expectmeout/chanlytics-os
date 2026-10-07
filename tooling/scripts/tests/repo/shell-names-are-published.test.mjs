/**
 * Every bare name the shell reads is one something publishes.
 *
 * The shell's files are modules that share their names through the window: one
 * publishes what it defines (`Object.assign(window, { Sidebar })`), another reads
 * it bare (`<Sidebar />`). Nothing checked the read. The shell is outside the
 * typecheck, and a `/* global *\/` header only says a name is global, not that
 * anything puts it there. A name no file publishes is a ReferenceError the first
 * time its line runs, in front of a customer.
 *
 * This collects every name the shell and its bridge publish, from the syntax tree,
 * then runs ESLint's no-undef over each shell file with the headers ignored and
 * nothing defined but the browser's globals, React and those names. It must find
 * nothing. On 27 September the shell read 136 names bare, 1,230 times in 92 files,
 * and every one was published. The first test keeps the collection honest: a
 * publish whose names cannot be read from the tree (a spread, a computed key, an
 * object built elsewhere) fails there, so no name can be missed quietly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { Linter } from "eslint";
import globals from "globals";
import { ROOT } from "../_source.mjs";
import { repoFiles, parse } from "../_ast.mjs";

/** Everything that can publish on the window: the shell, its bridge and the dashboard's browser code. */
const PUBLISHERS = repoFiles(["apps/dashboard/src"]);
const SHELL = PUBLISHERS.filter((f) => f.startsWith("apps/dashboard/src/legacy/") && f.endsWith(".jsx"));

const isWindow = (e) => ts.isIdentifier(e) && (e.text === "window" || e.text === "globalThis");
const isAssignToWindow = (n) =>
  ts.isCallExpression(n) &&
  ts.isPropertyAccessExpression(n.expression) &&
  n.expression.name.text === "assign" &&
  ts.isIdentifier(n.expression.expression) &&
  n.expression.expression.text === "Object" &&
  n.arguments.length > 0 &&
  isWindow(n.arguments[0]);
const keyOf = (p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null);

/** The names published on the window, and every publish whose names the tree does not say. */
function publishes() {
  const names = new Set();
  const opaque = [];
  for (const file of PUBLISHERS) {
    const sf = parse(file);
    const at = (n) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    const visit = (n) => {
      if (isAssignToWindow(n)) {
        for (const source of n.arguments.slice(1)) {
          if (!ts.isObjectLiteralExpression(source)) opaque.push(at(source));
          else {
            for (const p of source.properties) {
              const key = keyOf(p);
              if (key) names.add(key);
              else opaque.push(at(p));
            }
          }
        }
      }
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        (ts.isPropertyAccessExpression(n.left) || ts.isElementAccessExpression(n.left)) &&
        isWindow(n.left.expression)
      ) {
        if (ts.isPropertyAccessExpression(n.left)) names.add(n.left.name.text);
        else if (ts.isStringLiteral(n.left.argumentExpression)) names.add(n.left.argumentExpression.text);
        else opaque.push(at(n.left));
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { names, opaque };
}

const { names, opaque } = publishes();

test("every publish on the window names what it publishes", () => {
  assert.deepEqual(
    opaque,
    [],
    "publish with named keys (`Object.assign(window, { Name })`), so the names the shell may read can be listed",
  );
});

test("the shell reads no bare name that nothing publishes", () => {
  const defined = { ...globals.browser, React: "readonly" };
  for (const name of names) defined[name] = "readonly";
  const config = [
    {
      files: ["**/*.jsx"],
      // The headers are what this checks, so they are not believed.
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: "script",
        globals: defined,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      rules: { "no-undef": "error" },
    },
  ];
  const linter = new Linter();
  const undefinedNames = [];
  for (const file of SHELL) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of linter.verify(text, config, { filename: file })) {
      // A file that does not parse is not checked, so it fails too; ESLint's note that a header is ignored does not.
      if (m.ruleId === "no-undef" || m.fatal) undefinedNames.push(`${file}:${m.line} ${m.message}`);
    }
  }
  assert.deepEqual(
    undefinedNames,
    [],
    "publish the name from the file that defines it (Object.assign(window, { … })), or fix its spelling",
  );
});
