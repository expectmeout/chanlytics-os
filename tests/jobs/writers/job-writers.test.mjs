/**
 * A job written after its fact says what catches the work if the write is lost (layer 10, decision 0115): JOB_WRITERS holds
 * every TypeScript writer, read from the syntax tree here, so a new one arrives with its answer and a moved one takes its row.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { repoFiles, parse } from "../../_ast.mjs";
import { JOB_KINDS } from "../../../packages/contracts/src/shared/enums.ts";
import { CLOCKS } from "../../clocks/_clocks.mjs";
import { JOB_WRITERS } from "./_job-writers.mjs";

const TREES = ["apps/edge", "apps/dashboard/src", "apps/dashboard/app", "packages/core/src", "packages/jobs/src"];
const WRITES = new Set(["scheduleJob", "scheduleJobOnce", "schedule", "scheduleOnce"]);
const kinds = new Set(JOB_KINDS);

/** The kind a call names: a literal argument, or an object's `kind`; `*` for a variable; null when it names none. */
function kindNamed(call) {
  const [first, second] = call.arguments;
  for (const arg of [first, second]) if (arg && ts.isStringLiteralLike(arg) && kinds.has(arg.text)) return arg.text;
  for (const arg of call.arguments) {
    if (!ts.isObjectLiteralExpression(arg)) continue;
    for (const p of arg.properties) {
      if (p.name?.getText() !== "kind") continue;
      return ts.isPropertyAssignment(p) && ts.isStringLiteralLike(p.initializer) ? p.initializer.text : "*";
    }
  }
  // What a helper builds (provisionJob): read at the helper's own row, by its writer.
  return call.arguments.some((arg) => ts.isCallExpression(arg)) && call.arguments.length === 2 ? "*?" : null;
}

function writers() {
  const found = new Set();
  for (const file of repoFiles(TREES, { keep: /\.(ts|tsx)$/ })) {
    const sf = parse(file);
    const visit = (n) => {
      if (ts.isCallExpression(n)) {
        const callee = ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : n.expression.getText(sf);
        if (WRITES.has(callee)) {
          const named = kindNamed(n);
          const kind = named === "*?" ? (callee.startsWith("scheduleJob") ? "*" : null) : named;
          // A bare scheduleJob with no kind in sight is a pass-through we must read; a port with none names its kind at its adapter.
          if (kind) found.add(`${file}|${kind}`);
          else if (callee.startsWith("scheduleJob")) found.add(`${file}|*`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return found;
}

test("every writer of a job is on the list, and every row is a writer", () => {
  const found = writers();
  assert.ok(found.size >= 30, `read ${found.size} writers; the code holds more than that`);
  assert.deepEqual(
    [...found].filter((w) => !Object.hasOwn(JOB_WRITERS, w)).sort(),
    [],
    "a new job writer: say what catches the work if this write is lost (tests/jobs/_job-writers.mjs), or write it with its fact in SQL",
  );
  assert.deepEqual(
    Object.keys(JOB_WRITERS)
      .filter((w) => !found.has(w))
      .sort(),
    [],
    "a row with no writer: delete it",
  );
});

test("each row says one thing, and a clock it names is a registered clock", () => {
  for (const [writer, row] of Object.entries(JOB_WRITERS)) {
    const said = ["clock", "provider", "ledger", "person", "lost", "passes"].filter((k) => row[k]);
    assert.equal(said.length, 1, `${writer}: one answer, not ${said.join(", ")}`);
    if (row.clock) {
      assert.ok(Object.hasOwn(CLOCKS, row.clock), `${writer}: ${row.clock} is not a clock`);
      assert.ok(row.why, `${writer}: says what the clock does about it`);
    }
  }
});

test("what nothing catches is few, and small: each kind on the list costs a person nothing they asked for", () => {
  // Raising this is a decision: a customer's reply, a booking or a send may never be `lost`.
  const lost = Object.entries(JOB_WRITERS)
    .filter(([, row]) => row.lost)
    .map(([writer]) => writer.split("|")[1])
    .sort();
  assert.deepEqual(lost, ["erasure_finish", "push_receipts", "push_send", "website_read"]);
});
