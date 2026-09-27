/**
 * Every alias the shell gives a React hook that takes dependencies is one the
 * lint checks.
 *
 * The shell's files are scripts in one global scope, so each names its own copy
 * of a hook (`const { useEffect: useCvEffect } = React`), and
 * react-hooks/exhaustive-deps checks a call only when it knows the name: React's
 * own, or the pattern eslint.config.mjs gives it. Until 27 September that pattern
 * was a list of five names that matched one of the shell's 38 aliases, and calls
 * to the other 37 held 102 findings nobody saw.
 *
 * The aliases come from the syntax tree. Each is then called, with a dependency
 * missing, in a component linted through the repository's own config at a path
 * inside the shell, and the rule must say so for every one. A new alias outside
 * the pattern fails here, and so does a pattern that stops matching one; the
 * second test holds the pattern to aliases, so it cannot grow to read some other
 * function as a hook.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { ESLint } from "eslint";
import { ROOT } from "../_source.mjs";
import { repoFiles, parse } from "../_ast.mjs";

/** React's hooks whose callback comes first and dependencies second: the ones the rule can check under another name. */
const WITH_DEPS = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect", "useMemo", "useCallback"]);
const SHELL = repoFiles(["apps/dashboard/src/legacy"]).filter((f) => f.endsWith(".jsx"));
const PROBE = path.join(ROOT, "apps/dashboard/src/legacy/pages/hook-alias-probe.jsx");
const RULE = "react-hooks/exhaustive-deps";

const isReact = (e) => ts.isIdentifier(e) && e.text === "React";

/** The hook an initialiser names: `React.useEffect`, or `React.useLayoutEffect || React.useEffect` for a stub React. */
function hookOf(e) {
  if (ts.isParenthesizedExpression(e)) return hookOf(e.expression);
  if (ts.isPropertyAccessExpression(e) && isReact(e.expression) && WITH_DEPS.has(e.name.text)) return e.name.text;
  if (
    ts.isBinaryExpression(e) &&
    [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)
  ) {
    return hookOf(e.left) ?? hookOf(e.right);
  }
  return null;
}

/** `const { useEffect: useCvEffect } = React` and `const useArEffect = React.useEffect`, anywhere in a file. */
function aliasesIn(file) {
  const found = [];
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isObjectBindingPattern(node.name) && isReact(node.initializer)) {
        for (const el of node.name.elements) {
          const hook = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : null;
          if (hook && WITH_DEPS.has(hook) && ts.isIdentifier(el.name)) found.push({ alias: el.name.text, hook, file });
        }
      }
      const hook = ts.isIdentifier(node.name) ? hookOf(node.initializer) : null;
      if (hook) found.push({ alias: node.name.text, hook, file });
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return found;
}

/** Every name the shell calls as a plain function, with the files that call it. */
function calledNames() {
  const called = new Map();
  for (const file of SHELL) {
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const name = node.expression.text;
        if (!called.has(name)) called.set(name, new Set());
        called.get(name).add(file);
      }
      ts.forEachChild(node, visit);
    };
    visit(parse(file));
  }
  return called;
}

const aliases = SHELL.flatMap(aliasesIn).filter((a) => a.alias !== a.hook);
const eslint = new ESLint({ cwd: ROOT });
const pattern = async () => {
  const config = await eslint.calculateConfigForFile(PROBE);
  const [, options] = config.rules[RULE];
  return new RegExp(options.additionalHooks);
};

test("the shell declares its hooks under other names, so the lint has aliases to learn", () => {
  // The count is not the point; a scan that found none would pass the next test vacuously.
  assert.ok(aliases.length >= 30, `found only ${aliases.length} aliases; the scan has stopped seeing them`);
});

test("the lint checks a call to every alias the shell declares", async () => {
  const names = [...new Set(aliases.map((a) => a.alias))].sort();
  const probe = names
    .map((name, i) => {
      const hook = aliases.find((a) => a.alias === name).hook;
      const call =
        hook === "useMemo" || hook === "useCallback"
          ? `${name}(() => value, [])`
          : `${name}(() => { void value; }, [])`;
      return `function Probe${i}({ value }) {\n  ${call};\n  return null;\n}`;
    })
    .join("\n");
  const [result] = await eslint.lintText(probe, { filePath: PROBE });
  const flagged = new Set(
    result.messages.filter((m) => m.ruleId === RULE).map((m) => /^React Hook (\S+) /.exec(m.message)?.[1]),
  );
  const unchecked = names.filter((n) => !flagged.has(n));
  const where = (n) => aliases.find((a) => a.alias === n).file;
  assert.deepEqual(
    unchecked.map((n) => `${n} (${where(n)})`),
    [],
    "name the alias use<Prefix>Effect, …Memo or …Callback, the shell's convention, or widen the pattern in eslint.config.mjs",
  );
});

test("the pattern matches nothing the shell calls but React's hooks and their aliases", async () => {
  const re = await pattern();
  const known = new Set([...WITH_DEPS, ...aliases.map((a) => a.alias)]);
  const misread = [...calledNames()]
    .filter(([name]) => re.test(name) && !known.has(name))
    .map(([name, files]) => `${name} (${[...files].join(", ")})`);
  assert.deepEqual(misread, [], "the rule would read these as hooks with dependencies; narrow the pattern");
});
