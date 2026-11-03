/**
 * Every read of a surface goes through the runner (legacy-bridge/surface-runner.ts refreshSurfaces), which is where its
 * status, its snapshot, the moment it was read from (noteRead, readAfter) and a 401's sign-out are kept. A page that
 * called an override's `apply` itself, or `activateOverride`, skipped all of them: the verbs once did, and a reload painted a
 * snoozed thread back into Needs you; the first run's look at a call did until the page-open PRD (3 Nov 2026, L1).
 *
 * Read from the syntax tree of the dashboard's browser code: a call of `<x>Override.apply(…)` or of `activateOverride(…)`
 * anywhere but the seam's own two modules is one around the runner.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { parse, repoFiles } from "../../_ast.mjs";

/** The seam's own: the runner, and the module that says what an override is and activates it. */
const SEAM = new Set([
  "apps/dashboard/src/legacy-bridge/surface-runner.ts",
  "apps/dashboard/src/legacy-bridge/surface-data.ts",
]);

/** Each call in `sf` that reads a surface around the runner, as `file:line what`. */
function aroundTheRunner(file) {
  const sf = parse(file);
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const applied =
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "apply" &&
        ts.isIdentifier(callee.expression) &&
        /Override$/.test(callee.expression.text);
      const activated = ts.isIdentifier(callee) && callee.text === "activateOverride";
      if (applied || activated) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        found.push(`${file}:${line} ${callee.getText(sf)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

test("no page reads a surface around the runner: no override's apply, no activateOverride, outside the seam", () => {
  const files = repoFiles(["apps/dashboard/src"]).filter((f) => !SEAM.has(f));
  assert.ok(files.length > 500, "the dashboard's browser code was read");
  const around = files.flatMap(aroundTheRunner);
  assert.deepEqual(around, [], "read through refreshSurfaces, so the status, the snapshot and the sign-out follow");
});

test("the rule sees what it is held to: a call of an override's apply in a module is one around the runner", () => {
  assert.ok(
    aroundTheRunner("apps/dashboard/src/legacy-bridge/surface-runner.ts").length > 0,
    "the runner's own are seen",
  );
});
