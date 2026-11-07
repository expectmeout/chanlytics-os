/**
 * Where the code tells the type checker what it cannot see, read from the syntax trees (decision 0112): each assertion
 * that gives a value a type of the writer's choosing, and the numbers check:debt holds of them (TYPE_RATCHETS).
 * what-the-checker-is-told.test.mjs keeps each measure honest on a source written for it.
 *
 * The casts measure (`_measures.mjs`) holds the three the compiler cannot check at all: `as unknown as`, `as never` and
 * `x!`. This holds the rest, `x as T` and `<T>x`, which the compiler checks only so far: it refuses a type that cannot
 * be the value's, and takes any other on trust. Layer 7 found them at twice the rate of the eight codebases it was
 * held to, and more than a quarter of them on outside data nothing parsed (decision 0112 has the reading).
 */
import ts from "typescript";
import { parse, repoFiles } from "../_ast.mjs";

const NOT = /\.d\.ts$|\.generated\.|\.type-test\.|\.test\.|(^|\/)test\//;
const modules = (trees) => repoFiles(trees).filter((f) => /\.tsx?$/.test(f) && !NOT.test(f));

const isAssertion = (n) => ts.isAsExpression(n) || ts.isTypeAssertionExpression(n);
const unwrapped = (n) => {
  let at = n;
  while (ts.isParenthesizedExpression(at)) at = at.expression;
  return at;
};
const isConst = (type) =>
  ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === "const";

/**
 * A module's assertions that name a type of their own: `x as T` and `<T>x`. Not counted: `as const`, which keeps a
 * literal's own type; `as unknown`, which forgets one and asserts nothing; and the casts measure's three, `as never`
 * and both halves of `x as unknown as T`. `satisfies` is a check, not an assertion.
 */
export function assertionsIn(sf) {
  let n = 0;
  const visit = (m) => {
    if (isAssertion(m)) {
      const kind = m.type.kind;
      const inner = unwrapped(m.expression);
      const laundered = isAssertion(inner) && inner.type.kind === ts.SyntaxKind.UnknownKeyword;
      if (
        !isConst(m.type) &&
        kind !== ts.SyntaxKind.UnknownKeyword &&
        kind !== ts.SyntaxKind.NeverKeyword &&
        !laundered
      )
        n++;
    }
    ts.forEachChild(m, visit);
  };
  visit(sf);
  return n;
}

const byFile = (files, measure) =>
  Object.fromEntries(
    files
      .map((f) => [f, measure(parse(f))])
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );

export const TYPE_RATCHETS = [
  {
    name: "assertions: a value told its type",
    file: "assertions.json",
    measure: () => byFile(modules(["apps", "packages"]), assertionsIn),
    advice:
      "Let the checker see the type instead of telling it: annotate the declaration (`const ids: string[] = []`), " +
      "check a table with `satisfies`, narrow with a guard (contracts' isOneOf for a closed set, recordOrEmpty for an " +
      "object), and parse what comes from outside with its schema. An assertion that must stay says why in a comment.",
  },
];
