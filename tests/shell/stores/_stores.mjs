/**
 * What the dashboard's browser code keeps outside a component, found in the syntax tree: a module's own variables that
 * can change (`storesIn`). The rule that reads them is every-store-says-whose-it-is.test.mjs, with the list each must be
 * in (tab-stores.json).
 *
 * A store is, at a module's top level:
 *   - any `let`;
 *   - a `const` made as an empty `new Map()`, `Set`, `WeakMap`, `WeakSet` or `Array`, or as one with something in it, or
 *     as an array or an object written out, where the module itself goes on to change it (an assignment into it, `++`,
 *     `delete`, a call of `set`, `add`, `push` and their kind, `Object.assign`, `Reflect.set`). A table written out once
 *     and only read is no store, and neither is one whose type says it is never written (`ReadonlySet<…>`);
 *   - a `const` made by one of the tab's store makers (STORE_MAKERS), whose variables are inside the maker.
 *
 * What it cannot see, said so nobody takes the list for more than it is: a store inside a function a module calls once
 * (a closure of its own making, unless its maker is named in STORE_MAKERS), a class's static field, and a table one
 * module writes out and another changes. None stands in the browser's code today.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import ts from "typescript";
import { parse, repoFiles } from "../../_ast.mjs";

/** The dashboard's own tree, which every path in the lists is said from. */
export const DASHBOARD = "apps/dashboard/";

/** The makers of a store that is one workspace's by construction: each answers under the workspace the address names. */
export const STORE_MAKERS = ["readCache", "heldViews"];

/**
 * The browser's code: the dashboard's sources and pages, less what only a server runs (its server tree and its routes),
 * what a script writes, and the type tests, which hold no value.
 */
export const browserFiles = () =>
  repoFiles([`${DASHBOARD}src`, `${DASHBOARD}app`]).filter(
    (file) =>
      /\.tsx?$/.test(file) &&
      !/\.type-test\.ts$/.test(file) &&
      !file.startsWith(`${DASHBOARD}src/server/`) &&
      !file.startsWith(`${DASHBOARD}app/api/`),
  );

const CONTAINERS = new Set(["Map", "Set", "WeakMap", "WeakSet", "Array"]);
const CHANGING_CALLS = new Set([
  "set",
  "add",
  "delete",
  "clear",
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "fill",
  "reverse",
  "copyWithin",
]);
const CHANGED_THROUGH = new Set(["Object.assign", "Reflect.set", "Reflect.deleteProperty"]);

/** An expression less what says nothing at run time: `x as T`, `x satisfies T`, `(x)`, `x!`. */
function bare(node) {
  let at = node;
  while (
    at &&
    (ts.isAsExpression(at) ||
      ts.isSatisfiesExpression(at) ||
      ts.isParenthesizedExpression(at) ||
      ts.isNonNullExpression(at))
  )
    at = at.expression;
  return at;
}

/** The name an expression starts from, through its properties and indexes: `store` of `store.rows[0]`. */
function rootName(node) {
  let at = bare(node);
  while (ts.isPropertyAccessExpression(at) || ts.isElementAccessExpression(at)) at = bare(at.expression);
  return ts.isIdentifier(at) ? at.text : null;
}

const isStepping = (node) =>
  (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
  (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken);

const isAssignment = (node) =>
  ts.isBinaryExpression(node) &&
  node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
  node.operatorToken.kind <= ts.SyntaxKind.LastAssignment;

/** The name a statement changes, where it changes one: by assignment, a step, a delete or a changing call. */
function changedBy(node, sf) {
  if (isAssignment(node)) return rootName(node.left);
  if (isStepping(node)) return rootName(node.operand);
  if (ts.isDeleteExpression(node)) return rootName(node.expression);
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  if (CHANGING_CALLS.has(node.expression.name.text)) return rootName(node.expression.expression);
  const [first] = node.arguments;
  return first && CHANGED_THROUGH.has(node.expression.getText(sf)) ? rootName(first) : null;
}

/** Every name the module changes, anywhere in it. */
function changedNames(sf) {
  const names = new Set();
  const visit = (node) => {
    const name = changedBy(node, sf);
    if (name) names.add(name);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** What a `const` is made as, where that can be a store: its kind, and whether it is one only if the module changes it. */
function madeAs(declaration, sf) {
  const made = bare(declaration.initializer);
  if (!made) return null;
  if (ts.isCallExpression(made) && ts.isIdentifier(made.expression) && STORE_MAKERS.includes(made.expression.text))
    return { kind: `${made.expression.text}()`, onlyIfChanged: false };
  // A type that says it is never written holds what it was made with.
  if (/^(Readonly|readonly\b)/.test(declaration.type?.getText(sf) ?? "")) return null;
  if (ts.isNewExpression(made) && ts.isIdentifier(made.expression) && CONTAINERS.has(made.expression.text))
    return { kind: `new ${made.expression.text}`, onlyIfChanged: (made.arguments?.length ?? 0) > 0 };
  if (ts.isArrayLiteralExpression(made)) return { kind: "[…]", onlyIfChanged: true };
  if (ts.isObjectLiteralExpression(made)) return { kind: "{…}", onlyIfChanged: true };
  return null;
}

/** The stores a module declares at its top level: each by its name, with what it is made as and its line. */
export function storesIn(sf) {
  const changed = changedNames(sf);
  const out = [];
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const isLet = (statement.declarationList.flags & ts.NodeFlags.Let) !== 0;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const name = declaration.name.text;
      const made = isLet ? { kind: "let", onlyIfChanged: false } : madeAs(declaration, sf);
      if (!made || (made.onlyIfChanged && !changed.has(name))) continue;
      out.push({ name, kind: made.kind, line: sf.getLineAndCharacterOfPosition(declaration.getStart(sf)).line + 1 });
    }
  }
  return out;
}

/** Every store of the browser's code, by its file (said from the dashboard's own tree) and then its name. */
export function browserStores() {
  const found = {};
  for (const file of browserFiles()) {
    const stores = storesIn(parse(file));
    if (stores.length) found[file.slice(DASHBOARD.length)] = stores;
  }
  return found;
}
