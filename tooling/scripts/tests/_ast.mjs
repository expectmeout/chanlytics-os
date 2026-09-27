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

/* ---- Lengths of time written as bare numbers (the durations ratchet) ---- */

const K = ts.SyntaxKind;
/** A minute, an hour, a day and a week in milliseconds: what contracts' shared/time.ts names MIN_MS … WEEK_MS. */
const UNIT_MS = new Set([60_000, 3_600_000, 86_400_000, 604_800_000]);
/** A name that says it holds milliseconds (`LEASE_MS`, `ttlMs`, `max_call_duration_ms`) or is a unit (`MIN`, `DAY`). */
const SAYS_MS = /(^|[a-z0-9])Ms$|(^|_)(MS|ms)$|^(MIN|MINUTE|HOUR|DAY|WEEK)S?$/;
/** The words of a name that say its value is in another unit: metres, characters, bytes, tokens, cents, seconds. */
const OTHER_UNITS = new Set(
  "m km meters metres chars characters bytes kb mb tokens cents s sec secs seconds".split(" "),
);
/** A name with such a word anywhere (`RADIUS_MAX_M`, `TAB_TOTAL_CHARS`, `ASK_TOKENS_DAY`, `maxBytes`): not a time. */
const saysOtherUnit = (name) =>
  name.split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/).some((w) => OTHER_UNITS.has(w.toLowerCase()));
const OFFSET_OPS = new Set([
  K.PlusToken,
  K.MinusToken,
  K.LessThanToken,
  K.LessThanEqualsToken,
  K.GreaterThanToken,
  K.GreaterThanEqualsToken,
]);

const numberOf = (n) => Number(n.text.replace(/_/g, ""));
const bare = (n) => {
  while (n && (ts.isParenthesizedExpression(n) || ts.isNonNullExpression(n) || ts.isAsExpression(n))) n = n.expression;
  return n;
};
const isProduct = (n) => ts.isBinaryExpression(n) && n.operatorToken.kind === K.AsteriskToken;
/** `n` with the parentheses around it: the node its parent sees. */
function inParens(n) {
  let c = n;
  while (c.parent && ts.isParenthesizedExpression(c.parent)) c = c.parent;
  return c;
}
/** The factors of a product, through parentheses: `hours * (3600 * 1000)` is hours, 3600 and 1000. */
function factorsOf(n, out = []) {
  const b = bare(n);
  if (isProduct(b)) {
    factorsOf(b.left, out);
    factorsOf(b.right, out);
  } else out.push(b);
  return out;
}
/** The whole product a number is a factor of, or the number itself. */
function productAround(n) {
  let c = n;
  for (;;) {
    const up = inParens(c);
    if (up.parent && isProduct(up.parent)) c = up.parent;
    else return c;
  }
}
/** The name a value initialises (a const, a property, a parameter's default), or null. */
function slotNameOf(n) {
  const o = inParens(n);
  const p = o.parent;
  const slot =
    p &&
    (ts.isVariableDeclaration(p) ||
      ts.isPropertyAssignment(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isParameter(p) ||
      ts.isBindingElement(p)) &&
    p.initializer === o;
  return slot ? p.name.getText() : null;
}
/** The name of the nearest declaration whose value holds `n` (`reply_delay_ms: z.number().max(600000)`), or null. */
function holderNameOf(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isParameter(p))
      return p.name.getText();
    if (ts.isBlock(p) || ts.isSourceFile(p) || ts.isFunctionLike(p)) return null;
  }
  return null;
}
/** A timer's delay, AbortSignal.timeout's argument, or a `timeout:` option handed to a call: a length of time by place. */
function isTimerSlot(n) {
  const o = inParens(n);
  const p = o.parent;
  if (!p) return false;
  if (ts.isCallExpression(p)) {
    const c = p.expression;
    const name = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : "";
    if ((name === "setTimeout" || name === "setInterval") && p.arguments[1] === o) return true;
    if (name === "timeout" && ts.isPropertyAccessExpression(c) && c.expression.getText() === "AbortSignal")
      return p.arguments[0] === o;
  }
  if (ts.isPropertyAssignment(p) && p.initializer === o && /^(timeout|timeoutMs)$/.test(p.name.getText())) {
    const holder = inParens(p.parent).parent;
    return !!holder && (ts.isCallExpression(holder) || ts.isNewExpression(holder));
  }
  return false;
}
/** A number that makes a timer's value: the value, its floor or cap (`Math.max(500, …)`), its default (`?? 400`), a branch. */
function inTimerSlot(n) {
  for (let c = n; ;) {
    if (isTimerSlot(c)) return true;
    const up = inParens(c);
    const p = up.parent;
    const passes =
      p &&
      ((ts.isConditionalExpression(p) && p.condition !== up) ||
        (ts.isBinaryExpression(p) &&
          (p.operatorToken.kind === K.QuestionQuestionToken || p.operatorToken.kind === K.BarBarToken)) ||
        (ts.isCallExpression(p) && p.arguments.includes(up) && /^Math\.(min|max)$/.test(p.expression.getText())));
    if (!passes) return false;
    c = p;
  }
}
/** A value in milliseconds: Date.now(), x.getTime(), performance.now(), or a name that says so (`now`, `sentAt`, `budgetMs`). */
function inMs(e) {
  const b = bare(e);
  if (ts.isCallExpression(b)) {
    if (/^(Date\.(now|parse|UTC)|performance\.now|now)$/.test(b.expression.getText())) return true;
    return ts.isPropertyAccessExpression(b.expression) && /^(getTime|now)$/.test(b.expression.name.text);
  }
  if (ts.isIdentifier(b) || ts.isPropertyAccessExpression(b)) {
    return /^now(Ms)?$|[a-z0-9](At|Ms)$|AtMs$|_(at|ms)$|_MS$/.test(ts.isIdentifier(b) ? b.text : b.name.text);
  }
  if (ts.isBinaryExpression(b) && (b.operatorToken.kind === K.MinusToken || b.operatorToken.kind === K.PlusToken))
    return inMs(b.left) || inMs(b.right);
  return false;
}

/** Why the product (or lone number) `top` is an unnamed length of time, or null when it is not one. */
function durationOf(top) {
  const factors = factorsOf(top);
  const numbers = factors.filter((f) => ts.isNumericLiteral(f));
  if (numbers.length === 0) return null;
  const values = numbers.map(numberOf);
  const v = values.reduce((a, b) => a * b, 1);
  if (v === 0) return null;
  const allNumbers = numbers.length === factors.length;
  if (allNumbers && inTimerSlot(top)) return "a timer's delay";
  if (v >= 60_000 && v % 60_000 === 0) {
    // A name that says another unit wins: RADIUS_MAX_M = 60_000 is metres, not a minute.
    const slot = allNumbers ? slotNameOf(top) : null;
    if (slot !== null && saysOtherUnit(slot)) return null;
    // Then the spelling, whatever the name: time's own factors, or a unit's own value.
    const spelled =
      (values.includes(1000) && values.some((x) => x === 60 || x === 3600 || x === 24 || x === 86_400)) ||
      (numbers.length > 1 && values.some((x) => UNIT_MS.has(x)));
    if (spelled) return "a unit spelled by hand";
    if (numbers.length === 1 && UNIT_MS.has(v)) return "a unit's value";
    // Then a bare whole number of minutes (300_000): as the value of a name that says no other unit, a time, so
    // dropping `_MS` from the name hides nothing; inside an expression, only when the name holding it says so.
    if (slot !== null) return `the value of ${slot}`;
    const holder = holderNameOf(top);
    return holder && SAYS_MS.test(holder) ? `a length of time in ${holder}` : null;
  }
  if (allNumbers && v >= 100) {
    const o = inParens(top);
    const p = o.parent;
    if (p && ts.isBinaryExpression(p) && OFFSET_OPS.has(p.operatorToken.kind) && inMs(p.left === o ? p.right : p.left))
      return "an offset from a time";
  }
  return null;
}

/**
 * The lengths of time in one file written as bare numbers, where contracts' shared/time.ts (MIN_MS, HOUR_MS,
 * DAY_MS, WEEK_MS) or a named constant should say what they are: `{ line, text, why }`, one per number or product
 * of numbers. A number is a length of time when its place or its spelling says so:
 *
 *   - a timer's delay: setTimeout's and setInterval's, AbortSignal.timeout's, a `timeout:` option handed to a call,
 *     or a floor, cap, default or branch of one (`Math.max(500, …)`, `?? 400`); a zero is not a delay;
 *   - a whole number of minutes in milliseconds, spelled by hand, judged in this order. A name that says another
 *     unit wins: `RADIUS_MAX_M = 60_000` is metres, `TAB_TOTAL_CHARS = 600_000` characters, `ASK_TOKENS_DAY`
 *     tokens. Then the spelling, wherever it stands and whatever the name: time's own factors
 *     (`LEASE = 5 * 60 * 1000`, `[5 * 60_000]`, `hours * 3600 * 1000`) or a unit's own value (`WINDOW = 60_000`,
 *     `days * 86_400_000`, `/ 60000`). Then a bare whole number of minutes (`300_000`), which is the value of any
 *     other name (`TIMEOUT = 300_000`, `ttlMs: 300_000`), so dropping the unit from a name hides nothing, and
 *     inside an expression counts only when the name holding it says milliseconds
 *     (`reply_delay_ms: z.number().max(600000)`);
 *   - a number of at least 100 added to, taken from or compared with a value in milliseconds (`now + 50_000`).
 *
 * Not counted, on purpose: seconds (`24 * 60 * 60`, a max-age), which stay in their unit; `* 1000` and `/ 1000`,
 * which change the unit and are not a length; a named constant that is not a whole minute (`RETRY_MS = 800`), which is
 * already named; and a call's argument whose parameter is a timeout, which the tree cannot see without types.
 */
export function durationsIn(sf) {
  const out = [];
  const seen = new Set();
  const visit = (n) => {
    if (ts.isNumericLiteral(n)) {
      const top = productAround(n);
      if (!seen.has(top)) {
        seen.add(top);
        const why = durationOf(top);
        if (why)
          out.push({ line: sf.getLineAndCharacterOfPosition(top.getStart(sf)).line + 1, text: top.getText(sf), why });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
