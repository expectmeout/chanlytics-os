/**
 * Every publish on the window names what it publishes.
 *
 * The dashboard's browser code still shares a few names through the window: one file publishes what it defines
 * (`Object.assign(window, { Name })`), another reads it. A publish whose names cannot be read from the syntax tree (a
 * spread, a computed key, an object built elsewhere) is a name nobody can find by reading, and the window measures
 * (`window-globals`, `window-publishers`) cannot count it. This holds every publish to named keys.
 *
 * It once also ran ESLint's no-undef over the shell's script files, which read those names bare under `/* global *\/`
 * headers, against everything published. The last of those files went with the standalone mockup (15 Nov 2026), and
 * the TypeScript that replaced them imports what it reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { repoFiles, parse } from "../_ast.mjs";

/** Everything that can publish on the window: the bridge and the dashboard's browser code. */
const PUBLISHERS = repoFiles(["apps/dashboard/src"]);

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

const { opaque } = publishes();

test("every publish on the window names what it publishes", () => {
  assert.deepEqual(
    opaque,
    [],
    "publish with named keys (`Object.assign(window, { Name })`), so the names the shell may read can be listed",
  );
});
