/**
 * Measuring the code as code, for the ratchets that hold a number.
 *
 * Every measure here walks the syntax tree the TypeScript compiler builds, never
 * the text: a comment that mentions `window.__foo` or `as unknown as` is not a
 * global or a cast, and a string that contains one is not either. That is also
 * why none of this counts against the source-scan ratchet — nothing in here
 * reads a file to search it.
 *
 * The file set is `git ls-files`, so a checkout and a desk measure the same
 * thing (the lesson the source-scan ratchet learned on its first CI run).
 *
 * Definitions, so a number here can be re-derived by hand:
 *   lines     from a function's first token to its closing brace, inclusive
 *   branches  cyclomatic complexity as ESLint counts it: one, plus one per if,
 *             loop, case, catch, ternary, `&&`, `||` and `??`; branches inside a
 *             nested function count toward the enclosing function too, so
 *             indenting logic into an inner callback does not lower the number
 *             and extracting it into a module does
 *   depth     the nesting of if, loops, case, catch and ternaries
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./_source.mjs";

export const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;
const NOT_SOURCE = /(^|\/)(dist|node_modules|\.next)\/|\.generated\.ts$|database\.types\.ts$|\.d\.ts$/;

/** Repo-relative paths under `trees`, as the repository has them, that exist on disk. */
export function repoFiles(trees, { keep = SOURCE, drop = NOT_SOURCE } = {}) {
  let list;
  try {
    list = execFileSync("git", ["ls-files", "--", ...trees], { cwd: ROOT, encoding: "utf8" }).split("\n");
  } catch {
    list = trees.flatMap((t) => walk(path.join(ROOT, t)).map((p) => path.relative(ROOT, p)));
  }
  return list
    .map((l) => l.trim().split(path.sep).join("/"))
    .filter((f) => f && keep.test(f) && !drop.test(f) && fs.existsSync(path.join(ROOT, f)));
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

const parsed = new Map();

/** The syntax tree of one repo-relative file, parsed once per process. */
export function parse(file) {
  const hit = parsed.get(file);
  if (hit) return hit;
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const kind = file.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : file.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : file.endsWith(".ts")
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  parsed.set(file, sf);
  return sf;
}

const isFunction = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isConstructorDeclaration(n) ||
  ts.isGetAccessor(n) ||
  ts.isSetAccessor(n);

const BRANCHES = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
]);
const SHORT_CIRCUIT = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function nameOf(n) {
  if (n.name && ts.isIdentifier(n.name)) return n.name.text;
  if (ts.isConstructorDeclaration(n)) return "constructor";
  const p = n.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isCallExpression(p)) return "(callback)";
  return "(anonymous)";
}

/**
 * Every function with a body in one file: `{ key, name, line, lines, branches, depth }`.
 * `key` is `<name>#<n>`, the n-th function of that name in the file in source order —
 * stable across edits above it, which a line number is not.
 */
export function functionsIn(sf) {
  const out = [];
  const seen = new Map();
  const visit = (node) => {
    if (isFunction(node) && node.body) {
      const name = nameOf(node);
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
      const end = sf.getLineAndCharacterOfPosition(node.end).line;
      let branches = 1;
      let depth = 0;
      const walkBody = (m, d) => {
        if (BRANCHES.has(m.kind)) {
          branches++;
          d++;
          if (d > depth) depth = d;
        } else if (ts.isBinaryExpression(m) && SHORT_CIRCUIT.has(m.operatorToken.kind)) {
          branches++;
        }
        ts.forEachChild(m, (c) => walkBody(c, d));
      };
      walkBody(node.body, 0);
      out.push({ key: `${name}#${n}`, name, line: start + 1, lines: end - start + 1, branches, depth });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Lines in a file, as an editor counts them. */
export function linesOf(sf) {
  return sf.getLineAndCharacterOfPosition(sf.end).line + (sf.text.endsWith("\n") ? 0 : 1);
}

const isWindow = (e) => ts.isIdentifier(e) && (e.text === "window" || e.text === "globalThis");

/**
 * How one file uses the window: the `__names` it reads or writes, and the sites that
 * publish something on it (`Object.assign(window, {…})` and `window.x = …`).
 */
export function windowUse(sf) {
  const names = new Set();
  let publishers = 0;
  const visit = (n) => {
    if (ts.isPropertyAccessExpression(n) && isWindow(n.expression) && n.name.text.startsWith("__")) {
      names.add(n.name.text);
    }
    if (
      ts.isElementAccessExpression(n) &&
      isWindow(n.expression) &&
      ts.isStringLiteral(n.argumentExpression) &&
      n.argumentExpression.text.startsWith("__")
    ) {
      names.add(n.argumentExpression.text);
    }
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      (ts.isPropertyAccessExpression(n.left) || ts.isElementAccessExpression(n.left)) &&
      isWindow(n.left.expression)
    ) {
      publishers++;
    }
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "assign" &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === "Object" &&
      n.arguments[0] &&
      isWindow(n.arguments[0])
    ) {
      publishers++;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return { names, publishers };
}

/** The names a file declares at its top level: functions, and `const`/`let`/`var` bindings. */
export function topLevelNames(sf) {
  const names = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) names.push(st.name.text);
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text);
    }
  }
  return names;
}

/** `x as unknown as T`: the number of times a value is laundered through `unknown`. */
export function unknownCasts(sf) {
  let n = 0;
  const visit = (m) => {
    if (
      ts.isAsExpression(m) &&
      m.type.kind === ts.SyntaxKind.UnknownKeyword &&
      m.parent &&
      ts.isAsExpression(m.parent)
    ) {
      n++;
    }
    ts.forEachChild(m, visit);
  };
  visit(sf);
  return n;
}

const NOT_A_TABLE = new Set([
  "Buffer",
  "Array",
  "Uint8Array",
  "Int8Array",
  "Float32Array",
  "Float64Array",
  "ArrayBuffer",
  "Set",
  "Map",
  "Object",
  "Blob",
  "String",
]);

/** `.from("<table>")`: a table named by its string, in this file. `Buffer.from("…")` is not one. */
export function tableNames(sf) {
  let n = 0;
  const visit = (m) => {
    if (
      ts.isCallExpression(m) &&
      ts.isPropertyAccessExpression(m.expression) &&
      m.expression.name.text === "from" &&
      !(ts.isIdentifier(m.expression.expression) && NOT_A_TABLE.has(m.expression.expression.text)) &&
      m.arguments.length >= 1 &&
      ts.isStringLiteralLike(m.arguments[0]) &&
      /^[a-z][a-z0-9_]*$/.test(m.arguments[0].text)
    ) {
      n++;
    }
    ts.forEachChild(m, visit);
  };
  visit(sf);
  return n;
}
