/**
 * How long and how wide a module is, and how hard a function is to follow, measured from the syntax tree: the numbers check:debt holds (SIZE_RATCHETS) and the limits sizes.test.mjs holds
 * outright (decision 0107). Lines are code lines: a comment explains a module, it does not make it longer to reason about.
 */
import ts from "typescript";
import { repoFiles, parse } from "../../_ast.mjs";

/** A module past this many code lines is split by what it holds. ESLint's `max-lines` defaults to 300 and calls 100 to 500 typical. */
export const MODULE_CODE_LIMIT = 500;
/** A module that exports more than this is several things. */
export const MODULE_EXPORT_LIMIT = 30;
/** A door verifies, parses and answers. */
export const DOOR_CODE_LIMIT = 100;
/** Sonar flags a function at 15; this holds the ones far past that, so a number can only fall. */
export const COGNITIVE_LIMIT = 25;

/** What may stay long or wide, and why. An entry that no longer needs to be here fails. */
export const LEFT_WHOLE = {
  "apps/edge/lib/shared/log-events.ts": "the closed list of log events, one table an alert greps",
  "packages/contracts/src/shared/enums.ts": "every closed set, declared once on one page",
  "packages/core/src/deliver/deliver.ts": "the one send door, read as one",
};

const NOT = /\.d\.ts$|\.generated\.|database\.types\.ts$|\.type-test\.|(^|\/)test\/|\.test\./;
const BACKEND_TREES = [
  "packages/contracts/src",
  "packages/core/src",
  "packages/db/src",
  "packages/channels/src",
  "packages/jobs/src",
  "packages/log/src",
  "apps/edge/lib",
  "apps/edge/api",
  "apps/dashboard/src/server",
  "apps/dashboard/app/api",
];
const BROWSER_TREES = [
  "apps/dashboard/src/surfaces",
  "apps/dashboard/src/bridge",
  "apps/dashboard/src/client",
  "apps/dashboard/src/auth",
  "apps/dashboard/src/yes",
  "apps/dashboard/src/lib",
];
const inTrees = (trees) => repoFiles(trees).filter((f) => /\.tsx?$/.test(f) && !NOT.test(f));
export const backendModules = () => inTrees(BACKEND_TREES);
export const browserModules = () => inTrees(BROWSER_TREES);
export const doorModules = () =>
  repoFiles(["apps/dashboard/app/api", "apps/edge/api"]).filter((f) => /\.ts$/.test(f) && !NOT.test(f));

/** The lines a tree's tokens stand on, its comments left out. */
export function codeLinesIn(sf) {
  const lines = new Set();
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line;
  const walk = (n) => {
    if (n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode) return;
    if (n.getChildCount(sf) === 0) {
      if (n.kind === ts.SyntaxKind.EndOfFileToken) return;
      for (let l = lineOf(n.getStart(sf)); l <= lineOf(n.end); l += 1) lines.add(l);
      return;
    }
    n.getChildren(sf).forEach(walk);
  };
  walk(sf);
  return lines.size;
}

/** The names a module declares and exports itself: what it hands on from elsewhere is its barrel's business. */
export function exportsIn(sf) {
  let n = 0;
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      if (!st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause))
        n += st.exportClause.elements.length;
      continue;
    }
    const mods = ts.canHaveModifiers(st) ? (ts.getModifiers(st) ?? []) : [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (ts.isVariableStatement(st)) n += st.declarationList.declarations.length;
    else n += 1;
  }
  return n;
}

const isFunctionLike = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isArrowFunction(n) ||
  ts.isFunctionExpression(n) ||
  ts.isConstructorDeclaration(n) ||
  ts.isGetAccessor(n) ||
  ts.isSetAccessor(n);

/**
 * Cognitive complexity (Campbell, Sonar): a branch costs more the deeper it sits, an `else if` costs no extra for being in the chain, and a run of one logical operator costs one.
 * A function inside another is one level in: reading it costs its reader here.
 */
export function cognitiveOf(fn) {
  let total = 0;
  const visit = (n, nesting) => {
    let next = nesting;
    if (n !== fn && isFunctionLike(n)) next = nesting + 1;
    else if (ts.isIfStatement(n)) {
      const elseIf = ts.isIfStatement(n.parent) && n.parent.elseStatement === n;
      total += elseIf ? 1 : 1 + nesting;
      if (n.elseStatement && !ts.isIfStatement(n.elseStatement)) total += 1;
      next = nesting + 1;
    } else if (
      ts.isForStatement(n) ||
      ts.isForInStatement(n) ||
      ts.isForOfStatement(n) ||
      ts.isWhileStatement(n) ||
      ts.isDoStatement(n) ||
      ts.isSwitchStatement(n) ||
      ts.isCatchClause(n) ||
      ts.isConditionalExpression(n)
    ) {
      total += 1 + nesting;
      next = nesting + 1;
    } else if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken ||
        op === ts.SyntaxKind.BarBarToken ||
        op === ts.SyntaxKind.QuestionQuestionToken
      ) {
        const sameAbove = ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === op;
        if (!sameAbove) total += 1;
      }
    }
    ts.forEachChild(n, (c) => visit(c, next));
  };
  if (fn.body) ts.forEachChild(fn.body, (c) => visit(c, 0));
  return total;
}

const nameOf = (fn) => {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  const p = fn.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)))
    return p.name.text;
  return "(anonymous)";
};
/** Each function of a syntax tree past the limit: `{ name, cognitive }`. */
export function hardFunctionsIn(sf, limit = COGNITIVE_LIMIT) {
  const out = [];
  const walk = (n) => {
    if (isFunctionLike(n) && n.body) {
      const cognitive = cognitiveOf(n);
      if (cognitive > limit) out.push({ name: nameOf(n), cognitive });
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
  return out;
}

const perFile = (files, measure) =>
  Object.fromEntries(files.map((f) => [f, measure(parse(f))]).filter(([, n]) => n > 0));

/** The doors past their limit. */
export const longDoors = () =>
  perFile(doorModules(), (sf) => {
    const n = codeLinesIn(sf);
    return n > DOOR_CODE_LIMIT ? n : 0;
  });
const over = (limit, read) => (sf) => {
  const n = read(sf);
  return n > limit ? n : 0;
};

export const SIZE_RATCHETS = [
  {
    name: "modules over 500 code lines",
    file: "long-modules.json",
    measure: () => perFile([...backendModules(), ...browserModules()], over(MODULE_CODE_LIMIT, codeLinesIn)),
    advice:
      "Split it by what it holds: parts that lean one way, each named for its part, in a folder of the module's name. Empty in the backend by a test, but for LEFT_WHOLE (decision 0107).",
  },
  {
    name: "modules that export over 30 names",
    file: "wide-modules.json",
    measure: () => perFile([...backendModules(), ...browserModules()], over(MODULE_EXPORT_LIMIT, exportsIn)),
    advice:
      "A module that exports this much is several things: split it by what its names are about, so an importer says which it means.",
  },
  {
    name: "functions past a cognitive complexity of 25",
    file: "cognitive-complexity.json",
    measure: () => {
      const out = {};
      for (const f of [...backendModules(), ...browserModules()])
        for (const { name, cognitive } of hardFunctionsIn(parse(f)))
          out[`${f}::${name}`] = Math.max(out[`${f}::${name}`] ?? 0, cognitive);
      return out;
    },
    advice:
      "Deep nesting costs a reader most: return early, or give a branch its own named function. Branches alone are the function limits' to count.",
  },
];
