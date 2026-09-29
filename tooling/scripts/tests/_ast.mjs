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
 * thing (the lesson the source-scan ratchet learned on its first CI run), less
 * what is not our source: built and generated files, and `apps/<app>/public/`, the
 * files the browser loads as they are (the vendored MapLibre bundle, the service
 * worker), which Prettier leaves alone for the same reason. It is dropped here,
 * once, so no measure counts it.
 *
 * Definitions, so a number here can be re-derived by hand:
 *   lines     from a function's first token to its closing brace, inclusive
 *   branches  cyclomatic complexity as ESLint's `complexity` counts it: one, plus
 *             one per if, loop, case, catch, ternary, `&&`, `||`, `??`, `&&=`,
 *             `||=`, `??=`, `?.`, and default (a parameter's, a destructured
 *             name's)
 *   depth     the nesting ESLint's `max-depth` counts: if, switch, try and loops;
 *             an `if` that is an `else` adds none, so an else-if chain is flat
 * A nested function, and a class's static block, is a function of its own: its
 * branches and depth are not its container's, as they are not to ESLint, so when
 * a tree's baseline empties and the rules go on, they find what this found. A
 * class field's initializer counts toward no function (ESLint measures it apart,
 * and nothing here writes one that is complex). Checked against ESLint itself in
 * repo/measures.test.mjs.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./_source.mjs";

export const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;
const NOT_SOURCE =
  /(^|\/)(dist|node_modules|\.next)\/|^apps\/[^/]+\/public\/|\.generated\.ts$|database\.types\.ts$|\.d\.ts$/;

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

/**
 * A function in ESLint's sense: a code path of its own, whose branches and depth are
 * its own and not its container's. A class's static block is one too (ESLint's
 * `complexity` and `max-depth` both start over in it).
 */
const isFunction = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isConstructorDeclaration(n) ||
  ts.isGetAccessor(n) ||
  ts.isSetAccessor(n) ||
  ts.isClassStaticBlockDeclaration(n);

/** A class field's initializer: its own code path to ESLint, so no function's branches, and not a function here. */
const isFieldInitializer = (n) => n.parent && ts.isPropertyDeclaration(n.parent) && n.parent.initializer === n;

/** What ESLint's `complexity` adds one for: these statements and clauses (a `case`, never `default`)... */
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
/** ...each `&&`, `||` and `??`, and each logical assignment, which short-circuits as they do... */
const SHORT_CIRCUIT = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);
/** ESLint `max-depth`: the statements that nest; an `if` that is another's `else` does not. */
const NESTS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.TryStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.WithStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
]);
const isElseIf = (n) => ts.isIfStatement(n) && ts.isIfStatement(n.parent) && n.parent.elseStatement === n;

/** Whether an array or object literal is written to, as a destructuring target (`[a = 1] = xs`), and not read. */
function isDestructured(n) {
  const p = n.parent;
  if (ts.isParenthesizedExpression(p) || ts.isArrayLiteralExpression(p) || ts.isSpreadElement(p))
    return isDestructured(p);
  if (ts.isPropertyAssignment(p) || ts.isSpreadAssignment(p)) return isDestructured(p.parent);
  // The left of `=` is written, wherever the `=` stands (`[a] = xs`, and the `[a]` of `[[a] = []] = xs`).
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) return p.left === n;
  if (ts.isForOfStatement(p) || ts.isForInStatement(p)) return p.initializer === n;
  return false;
}

/**
 * ESLint's AssignmentPattern, a default that runs only when a value is missing: a
 * parameter's, a destructured binding's (`const { a = 1 } = o`), and a destructuring
 * assignment's (`({ a = 1 } = o)`, `[a = 1] = xs`).
 */
function isDefault(n) {
  if (ts.isParameter(n) || ts.isBindingElement(n)) return n.initializer !== undefined;
  if (ts.isShorthandPropertyAssignment(n)) return n.objectAssignmentInitializer !== undefined;
  if (!ts.isBinaryExpression(n) || n.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
  const p = n.parent;
  if (ts.isArrayLiteralExpression(p)) return isDestructured(p);
  return ts.isPropertyAssignment(p) && p.initializer === n && isDestructured(p.parent);
}

/** ...and each `?.` and each default. */
function addsBranch(n) {
  if (BRANCHES.has(n.kind) || isDefault(n)) return true;
  if (ts.isBinaryExpression(n)) return SHORT_CIRCUIT.has(n.operatorToken.kind);
  // `a?.b`, `a?.[k]` and `f?.()`: each `?.` is a branch; the links after it are not.
  if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n) || ts.isCallExpression(n)) {
    return n.questionDotToken !== undefined;
  }
  return false;
}

/** One function's branches and depth: its parameters and body, stopping at every function inside it. */
function measureOf(fn) {
  let branches = 1;
  let depth = 0;
  const walk = (n, d) => {
    if (isFunction(n) || isFieldInitializer(n)) return;
    if (addsBranch(n)) branches++;
    if (NESTS.has(n.kind) && !isElseIf(n)) depth = Math.max(depth, ++d);
    ts.forEachChild(n, (c) => walk(c, d));
  };
  ts.forEachChild(fn, (c) => walk(c, 0));
  return { branches, depth };
}

/** A function's own name, or null for one that has none (a callback, a handler, an IIFE). */
function nameOf(n) {
  if (ts.isClassStaticBlockDeclaration(n)) return "(static)";
  if (n.name && ts.isIdentifier(n.name)) return n.name.text;
  if (ts.isConstructorDeclaration(n)) return "constructor";
  const p = n.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
  return null;
}

/**
 * Where a function with no name is written: what it is handed to (`useEffect(fn)`,
 * `Promise(fn)`, `onClick={fn}`), under the named function around it
 * (`PeopleReal/useEffect(fn)`). A callback is numbered among those alone, so one
 * added elsewhere in the file does not rename it.
 */
function placeOf(n) {
  const p = n.parent;
  let place = "(anonymous)";
  if (p && (ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression !== n) {
    const callee = p.expression;
    const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
    place = `${name || "(call)"}(fn)`;
  } else if (p && ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) {
    place = `${p.parent.name.getText()}={fn}`;
  }
  for (let a = p; a; a = a.parent) {
    const owner = isFunction(a) ? nameOf(a) : null;
    if (owner) return `${owner}/${place}`;
  }
  return place;
}

/**
 * Every function with a body in one file: `{ key, name, line, lines, branches, depth }`.
 * `key` is `<name>#<n>`, the n-th function of that name in the file in source order —
 * stable across edits above it, which a line number is not. A function with no name
 * is named by its place (`placeOf`).
 */
export function functionsIn(sf) {
  const out = [];
  const seen = new Map();
  const visit = (node) => {
    if (isFunction(node) && node.body) {
      const name = nameOf(node) ?? placeOf(node);
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
      const end = sf.getLineAndCharacterOfPosition(node.end).line;
      out.push({ key: `${name}#${n}`, name, line: start + 1, lines: end - start + 1, ...measureOf(node) });
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

/** An expression under its parentheses, casts, `satisfies` and `!` (`(window as any)`, `<T>window` and `window!` are
 * `window`); nothing stays nothing. The window measures and the durations measure read through it alike. */
function bare(e) {
  while (
    e &&
    (ts.isParenthesizedExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isTypeAssertionExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isSatisfiesExpression(e))
  ) {
    e = e.expression;
  }
  return e;
}

/** The node a declaration's name is visible in: a `var`'s function, a `let`'s or `const`'s block or loop, a catch clause. */
function scopeOf(decl) {
  const list = decl.parent;
  if (ts.isCatchClause(list)) return list;
  if (ts.isVariableDeclarationList(list) && !(list.flags & ts.NodeFlags.BlockScoped)) {
    let n = list.parent;
    while (n && !ts.isFunctionLike(n) && !ts.isSourceFile(n)) n = n.parent;
    return n;
  }
  return ts.isVariableStatement(list.parent) ? list.parent.parent : list.parent;
}

/**
 * A test for "this expression is the window" in one file: `window` or `globalThis`
 * under any cast, or a name bound to one (`const w = window as unknown as {…}`).
 * A name is resolved to its nearest declaration, so a `w` that is a parameter or
 * some other value in another function is not the window because one `w` is.
 */
function windowTest(sf) {
  const declared = new Map(); // scope node → Map(name → initializer or null)
  const bind = (name, scope, init) => {
    if (ts.isIdentifier(name)) {
      if (!declared.has(scope)) declared.set(scope, new Map());
      declared.get(scope).set(name.text, init ?? null);
    } else {
      for (const el of name.elements) if (!ts.isOmittedExpression(el)) bind(el.name, scope, null);
    }
  };
  const collect = (n) => {
    if (ts.isVariableDeclaration(n)) bind(n.name, scopeOf(n), n.initializer);
    else if (ts.isParameter(n)) bind(n.name, n.parent, null);
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const isWindow = (e, hops = 0) => {
    e = bare(e);
    if (!ts.isIdentifier(e) || hops > 8) return false;
    for (let s = e.parent; s; s = s.parent) {
      const names = declared.get(s);
      if (names?.has(e.text)) {
        const init = names.get(e.text);
        return init !== null && init !== e && isWindow(init, hops + 1);
      }
    }
    return e.text === "window" || e.text === "globalThis";
  };
  return isWindow;
}

/**
 * How one file uses the window: the `__names` it reads or writes, and the sites that
 * publish something on it (`Object.assign(window, {…})` and `window.x = …`). A cast
 * hides none of it: `(window as any).__x`, `(<T>window).__x`, `const w = window as T;
 * w.__x` and `const { __x } = window as T` all read `__x`.
 */
export function windowUse(sf) {
  const isWindow = windowTest(sf);
  const names = new Set();
  let publishers = 0;
  const quoted = (e) => ts.isStringLiteral(e) && e.text.startsWith("__");
  const visit = (n) => {
    if (ts.isPropertyAccessExpression(n) && n.name.text.startsWith("__") && isWindow(n.expression)) {
      names.add(n.name.text);
    }
    if (ts.isElementAccessExpression(n) && quoted(n.argumentExpression) && isWindow(n.expression)) {
      names.add(n.argumentExpression.text);
    }
    if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer && isWindow(n.initializer)) {
      for (const el of n.name.elements) {
        const key = el.propertyName ?? el.name;
        if ((ts.isIdentifier(key) && key.text.startsWith("__")) || quoted(key)) names.add(key.text);
      }
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

/** Names declared at top level in `limit` or more of these files, each with the number of files. */
export function copiesAmong(sourceFiles, limit) {
  const files = new Map();
  for (const sf of sourceFiles) {
    for (const n of new Set(topLevelNames(sf))) files.set(n, (files.get(n) ?? 0) + 1);
  }
  return Object.fromEntries([...files].filter(([, count]) => count >= limit));
}

const isCast = (n) => ts.isAsExpression(n) || ts.isTypeAssertionExpression(n);

/**
 * `x as unknown as T`: the number of times a value is laundered through `unknown`,
 * however it is written: `(x as unknown) as T`, `<T><unknown>x` and `<T>(<unknown>x)` too.
 */
export function unknownCasts(sf) {
  let n = 0;
  const visit = (m) => {
    if (isCast(m) && m.type.kind === ts.SyntaxKind.UnknownKeyword) {
      let outer = m.parent;
      while (outer && ts.isParenthesizedExpression(outer)) outer = outer.parent;
      if (outer && isCast(outer)) n++;
    }
    ts.forEachChild(m, visit);
  };
  visit(sf);
  return n;
}

/** A cast to `unknown`, parentheses and all: the inner half of `x as unknown as T`. */
const isUnknownCast = (n) => {
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  return isCast(n) && n.type.kind === ts.SyntaxKind.UnknownKeyword;
};

/**
 * `x as never`: a value told it is nothing, so the compiler stops checking where it goes (the keys of an RPC's
 * arguments, a column's type), however it is written, `<never>x` too. The outer half of `x as unknown as never` is
 * laundering through unknown, counted there and not here.
 */
export function neverCasts(sf) {
  let n = 0;
  const visit = (m) => {
    if (isCast(m) && m.type.kind === ts.SyntaxKind.NeverKeyword && !isUnknownCast(m.expression)) n++;
    ts.forEachChild(m, visit);
  };
  visit(sf);
  return n;
}

/** `x!`: a value the compiler is told is neither null nor undefined, and takes on trust. `let x!: T` is not one. */
export function nonNullAssertions(sf) {
  let n = 0;
  const visit = (m) => {
    if (ts.isNonNullExpression(m)) n++;
    ts.forEachChild(m, visit);
  };
  visit(sf);
  return n;
}

/**
 * The casts `baselines/casts.json` holds, by family, for one module: `{ unknownAs, never, nonNull }`, a family the
 * module has none of left out, so a module with none is no entry.
 */
export function castsIn(sf) {
  const counts = { unknownAs: unknownCasts(sf), never: neverCasts(sf), nonNull: nonNullAssertions(sf) };
  return Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
}

/**
 * The `style` props a module's markup carries: `style={{ … }}` or `style={value}`, on an element or a component. A
 * prop is a value no look can reach (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, rule 1); a class that
 * reads tokens can. A `style` key in an object, or a string that says `style=`, is not one.
 */
export function inlineStyles(sf) {
  let n = 0;
  const visit = (m) => {
    if (ts.isJsxAttribute(m) && ts.isIdentifier(m.name) && m.name.text === "style") n++;
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
