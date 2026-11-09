/**
 * The table's state lives in one place (decision 0083, §14 rule 1): a list's sort, columns, widths, order, filters and
 * selection are table-core's slices, in the kit's atoms (kit/table/state.ts), or they are not built. So no module of
 * People, of Leads or of the kit's table keeps one of them in React state of its own: a `useState` or `useReducer` whose
 * name says sort, column, width, order, filter, chip or selection. Read from the syntax tree, never the text, as the
 * measures read it (_ast.mjs). The named exceptions beside the table — the row height and a page's own keys (kit atoms),
 * the claim that all that match are picked (`allMatching`), the cursor, a phone's Select mode and its sheet's step —
 * say none of those words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { parse, repoFiles } from "../_ast.mjs";

const TREES = [
  "apps/dashboard/src/surfaces/people",
  "apps/dashboard/src/surfaces/leads",
  "apps/dashboard/src/surfaces/kit/table",
];
/**
 * A person's page is a record, not a list: its History's filter is a tab of the record's (the kit's SubTabs), over a
 * timeline no table draws.
 */
const NOT_A_LIST = /^apps\/dashboard\/src\/surfaces\/people\/person\//;
const TABLE_WORDS = /sort|column|width|order|filter|chip|selection/i;
const STATE_HOOKS = new Set(["useState", "useReducer"]);

/** The names a module gives the state it keeps: `const [name, setName] = useState(...)`, or a reducer's. */
function stateNamesIn(sf) {
  const names = [];
  const calleeName = (e) => (ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null);
  const visit = (n) => {
    if (
      ts.isVariableDeclaration(n) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      STATE_HOOKS.has(calleeName(n.initializer.expression) ?? "")
    ) {
      if (ts.isArrayBindingPattern(n.name)) {
        const first = n.name.elements[0];
        if (first && ts.isBindingElement(first) && ts.isIdentifier(first.name)) names.push(first.name.text);
      } else if (ts.isIdentifier(n.name)) names.push(n.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

test("no module of People, Leads or the kit's table keeps a sort, a column, a width, an order, a filter or a selection of its own", () => {
  const files = repoFiles(TREES).filter((f) => !NOT_A_LIST.test(f));
  assert.ok(files.length > 50, `the trees are read: ${files.length} modules`);
  const offenders = files.flatMap((f) =>
    stateNamesIn(parse(f))
      .filter((name) => TABLE_WORDS.test(name))
      .map((name) => `${f}: ${name}`),
  );
  assert.deepEqual(offenders, [], "each is a slice of the table's state (kit/table/state.ts), never a second copy");
});

test("the rule finds what it is for: a planted sort, a planted chip and a planted selection are each named", () => {
  const planted = ts.createSourceFile(
    "planted.tsx",
    `const [sortBy, setSortBy] = useState("name");
     const [fitChip, setFitChip] = React.useState(null);
     const [selection, move] = useReducer(step, []);
     const [selectMode, setSelectMode] = useState(false);
     const [allMatching, setAllMatching] = useState(false);`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  assert.deepEqual(
    stateNamesIn(planted).filter((n) => TABLE_WORDS.test(n)),
    ["sortBy", "fitChip", "selection"],
    "and the page's own exceptions are not",
  );
});
