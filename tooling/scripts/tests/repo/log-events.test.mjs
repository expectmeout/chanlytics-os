/**
 * The platform's log names are two closed sets, the way the activity log's are EVENT_KINDS (event-kinds.test.mjs):
 * every name a line carries is declared, and every declared name is carried. The edge's, LOG_EVENTS
 * (apps/edge/lib/log-events.ts), holds the edge and the packages that run on it (core, jobs, channels, and db through
 * its port); the dashboard's server, DASHBOARD_LOG_EVENTS (apps/dashboard/src/server/log.ts), its own `log` lines.
 *
 * Each app's logger takes its set's names, so tsc refuses a name outside the set wherever the logger is typed. This
 * holds what the types cannot: the packages' lines (their loggers take a string), a name that is not a literal, and a
 * declared name nothing logs. And one spelling of the workspace on a line: `tenant_id`, never `tenant` (74 edge lines
 * and 40 of the dashboard's said that on 29 September) or `tenantId`.
 *
 * A line is `x.info|warn|error(name, …)` on any receiver but `console`, measured on the syntax tree, never the text.
 * In these trees every such call is a log line; a method of that name on something else would be read as one, and
 * is renamed or taught here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { repoFiles, parse } from "../_ast.mjs";
import { LOG_EVENTS } from "../../../../apps/edge/lib/log-events.ts";
import { DASHBOARD_LOG_EVENTS } from "../../../../apps/dashboard/src/server/log.ts";

const SET = "apps/edge/lib/log-events.ts";
/** The edge, and the packages whose lines go out through the one logger on it. */
const TREES = ["apps/edge", "packages/core/src", "packages/jobs/src", "packages/db/src", "packages/channels/src"];
/** The dashboard's server and its routes: their lines are `log.info|warn|error`, the one logger's dashboard name. */
const DASHBOARD_TREES = ["apps/dashboard/src/server", "apps/dashboard/app"];
const DASHBOARD_SET = "apps/dashboard/src/server/log.ts";
const LEVELS = new Set(["info", "warn", "error"]);

/**
 * The lines that name their event with a value, by file, as the value is written. Each value is typed `LogEvent`,
 * so tsc holds it to the set, and its literals are spelled where that type is. A new one is a literal instead, or
 * a value typed `LogEvent` and named here.
 */
const FORWARDED = {
  "apps/edge/api/admin/billing.ts": ["log.event"], // billingLogOf (billing-ops.ts)
  "apps/edge/api/admin/google.ts": ["log.event", "log.event"], // connectAnswer, draftAnswer (google-ops.ts)
  "apps/edge/api/apify-webhook.ts": ["verdict.log", "verdict.log", "verdict.log"], // planApifyIngress
  "apps/edge/api/inbound-sms.ts": ["verdict.log", "verdict.log"], // planSmsIngress
  "apps/edge/api/resend-webhook.ts": ["verdict.log", "verdict.log"], // planResendEvent
  "apps/edge/api/retell-webhook.ts": ["s.event"], // planCallEvent's log step (call-event.ts)
  "apps/edge/lib/reach-out/check.ts": ["event"], // the check sweep's error(...)
  "apps/edge/lib/reach-out/sender.ts": ["event"], // the claim's failed(...)
  // The one computed name: pgSafe's step is a PgStep, so the family is a union tsc checks against the set.
  "apps/edge/lib/whatsapp/persist.ts": ["`pg_${label}_failed`"],
};

/**
 * The dashboard's lines that name their event with a value, by file, as the value is written. Each value is typed
 * `DashboardLogEvent`, so tsc holds it to DASHBOARD_LOG_EVENTS, and its literals are spelled where that type is. A new
 * one is a literal instead, or a value typed `DashboardLogEvent` and named here.
 */
const FORWARDED_DASHBOARD = {
  "apps/dashboard/src/server/ask/loop.ts": ["DROP_EVENTS[drop]"], // the drop a refusal made the turn give up (refusals.ts)
};

/** The names a first argument can take: a string literal, or a conditional whose branches all are; else null. */
function literalNames(e) {
  if (!e) return null;
  if (ts.isStringLiteralLike(e)) return [e.text];
  if (ts.isParenthesizedExpression(e)) return literalNames(e.expression);
  if (ts.isConditionalExpression(e)) {
    const a = literalNames(e.whenTrue);
    const b = literalNames(e.whenFalse);
    return a && b ? [...a, ...b] : null;
  }
  return null;
}

const isConsole = (e) => ts.isIdentifier(e) && e.text === "console";

/** One pass over the trees: every log line, every string spelled, and the steps pgSafe is called with. */
function measure() {
  const lines = [];
  const spelled = new Set();
  const pgSteps = new Set();
  for (const file of repoFiles(TREES, { keep: /\.(ts|tsx)$/ })) {
    if (file === SET) continue;
    const sf = parse(file);
    const visit = (n) => {
      if (ts.isStringLiteralLike(n)) spelled.add(n.text);
      if (ts.isCallExpression(n)) {
        const callee = n.expression;
        if (ts.isPropertyAccessExpression(callee) && LEVELS.has(callee.name.text) && !isConsole(callee.expression)) {
          const arg = n.arguments[0];
          lines.push({
            file,
            line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
            names: literalNames(arg),
            text: arg ? arg.getText(sf) : "(none)",
          });
        }
        if (
          ts.isIdentifier(callee) &&
          callee.text === "pgSafe" &&
          n.arguments[0] &&
          ts.isStringLiteralLike(n.arguments[0])
        )
          pgSteps.add(n.arguments[0].text);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { lines, spelled, pgFamily: [...pgSteps].map((s) => `pg_${s}_failed`) };
}

const { lines, spelled, pgFamily } = measure();
const declared = new Set(LOG_EVENTS);

test("the set names each event once, in order", () => {
  assert.deepEqual(
    [...LOG_EVENTS],
    [...declared].sort(),
    "sorted and unique: two changes adding a name each touch different lines",
  );
});

test("every line names an event in LOG_EVENTS, with a literal", () => {
  assert.ok(lines.length >= 300, `the lint saw ${lines.length} lines; the edge writes more than that`);
  const undeclared = [];
  for (const l of lines)
    for (const name of l.names ?? []) if (!declared.has(name)) undeclared.push(`${name} <- ${l.file}:${l.line}`);
  for (const name of pgFamily) if (!declared.has(name)) undeclared.push(`${name} <- pgSafe`);
  assert.deepEqual(
    undeclared,
    [],
    "logged but not in LOG_EVENTS: add it (the name is the contract alerting greps for)",
  );

  const forwarded = {};
  for (const l of lines.filter((x) => !x.names)) (forwarded[l.file] ??= []).push(l.text);
  assert.deepEqual(
    forwarded,
    FORWARDED,
    "a line whose name is not a literal: write the literal, or type the value LogEvent and name it in FORWARDED",
  );
});

test("every name in LOG_EVENTS is logged somewhere", () => {
  // A forwarded name is spelled where its value's type is (a verdict's `log`, an op's `event`), not at the line.
  const logged = new Set([...spelled, ...pgFamily]);
  const dead = LOG_EVENTS.filter((name) => !logged.has(name));
  assert.deepEqual(dead, [], "declared but nothing logs it: delete it, or teach this test the shape that does");
});

/** The dashboard's lines: `log.<level>(name, …)`, every name spelled (a forwarded name where its value is), and the set's own file left out. */
function measureDashboard() {
  const lines = [];
  const spelled = new Set();
  for (const file of repoFiles(DASHBOARD_TREES, { keep: /\.(ts|tsx)$/ })) {
    if (file === DASHBOARD_SET) continue;
    const sf = parse(file);
    const visit = (n) => {
      if (ts.isStringLiteralLike(n)) spelled.add(n.text);
      if (ts.isCallExpression(n)) {
        const callee = n.expression;
        if (
          ts.isPropertyAccessExpression(callee) &&
          LEVELS.has(callee.name.text) &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === "log"
        ) {
          const arg = n.arguments[0];
          lines.push({
            file,
            line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
            names: literalNames(arg),
            text: arg ? arg.getText(sf) : "(none)",
          });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { lines, spelled };
}

test("the dashboard's set: sorted and unique, every line's name in it as a literal, every name in it logged", () => {
  const dash = measureDashboard();
  const set = new Set(DASHBOARD_LOG_EVENTS);
  assert.deepEqual([...DASHBOARD_LOG_EVENTS], [...set].sort(), "sorted and unique");
  assert.ok(dash.lines.length >= 90, `the lint saw ${dash.lines.length} lines; the dashboard writes more than that`);
  const undeclared = [];
  const forwarded = {};
  for (const l of dash.lines) {
    if (!l.names) (forwarded[l.file] ??= []).push(l.text);
    for (const name of l.names ?? []) if (!set.has(name)) undeclared.push(`${name} <- ${l.file}:${l.line}`);
  }
  assert.deepEqual(undeclared, [], "logged but not in DASHBOARD_LOG_EVENTS: add it");
  assert.deepEqual(
    forwarded,
    FORWARDED_DASHBOARD,
    "a dashboard line names its event with a literal, or with a value typed DashboardLogEvent that FORWARDED_DASHBOARD names",
  );
  const dead = DASHBOARD_LOG_EVENTS.filter((name) => !dash.spelled.has(name));
  assert.deepEqual(dead, [], "declared but nothing logs it: delete it");
});

test("a line names its workspace one way: tenant_id, in its fields and in a logger's bound context", () => {
  const WRONG = new Set(["tenant", "tenantId"]);
  const offences = [];
  for (const file of repoFiles([...TREES, ...DASHBOARD_TREES], { keep: /\.(ts|tsx)$/ })) {
    const sf = parse(file);
    const visit = (n) => {
      if (ts.isCallExpression(n)) {
        const c = n.expression;
        const isLine = ts.isPropertyAccessExpression(c) && LEVELS.has(c.name.text) && !isConsole(c.expression);
        const isContext =
          (ts.isIdentifier(c) && c.text === "logger") || (ts.isPropertyAccessExpression(c) && c.name.text === "child");
        if (isLine || isContext)
          for (const a of n.arguments)
            if (ts.isObjectLiteralExpression(a))
              for (const p of a.properties)
                if (p.name && ts.isIdentifier(p.name) && WRONG.has(p.name.text))
                  offences.push(`${file}:${sf.getLineAndCharacterOfPosition(p.getStart(sf)).line + 1} ${p.name.text}`);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  assert.deepEqual(offences, [], "the workspace on a log line is tenant_id: rename the field");
});
