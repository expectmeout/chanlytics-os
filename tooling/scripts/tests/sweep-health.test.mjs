/**
 * When to shout about a broken sweep, and what to say.
 *
 * The decision is pure and lives in apps/edge/lib/sweep-health.ts for the same
 * reason chooseAddressing does in notify.ts: it either floods the only alarm
 * channel this system has or silences it, and a decision buried inside a fetch
 * cannot be tested.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ROOT, readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chooseSweepAlerts, describeSweepTrouble, ALERT_SUPPRESSION_MS } = await import(
  pathToFileURL(path.join(here, "../../../apps/edge/lib/sweep-health.ts")).href
);

const row = (over) => ({
  sweep: "deadman",
  healthy: false,
  detail: 'the edge answered 401: {"ok":false,"error":"unauthorized"}',
  last_request_at: new Date().toISOString(),
  status_code: 401,
  scheduled: true,
  alerted_at: null,
  ...over,
});

test("a sweep failing for the first time is alerted immediately", () => {
  const p = chooseSweepAlerts([row({ alerted_at: null })], Date.now());
  assert.deepEqual(p.alert.map((r) => r.sweep), ["deadman"]);
  assert.deepEqual(p.broken, ["deadman"]);
  assert.deepEqual(p.healthy, []);
  assert.deepEqual(p.recovered, []);
});

test("a delivered alert buys exactly six hours of quiet, then speaks again", () => {
  // Collapse this to zero and it is 48 mails a day, which is how the alarm
  // channel gets filtered into a folder and the NEXT real alert is missed.
  // Collapse it to infinity and it is one mail ever, then silence while the
  // sweep stays broken.
  const now = Date.now();
  assert.equal(
    chooseSweepAlerts([row({ alerted_at: new Date(now - (ALERT_SUPPRESSION_MS - 60_000)).toISOString() })], now).alert.length,
    0,
  );
  assert.equal(
    chooseSweepAlerts([row({ alerted_at: new Date(now - (ALERT_SUPPRESSION_MS + 60_000)).toISOString() })], now).alert.length,
    1,
  );
  assert.equal(ALERT_SUPPRESSION_MS, 6 * 60 * 60 * 1000);
});

test("suppression is per sweep, so a second failure is not hidden behind the first", () => {
  const now = Date.now();
  const p = chooseSweepAlerts(
    [
      row({ sweep: "deadman", alerted_at: new Date(now - 10 * 60_000).toISOString() }),
      row({ sweep: "calls", alerted_at: null }),
    ],
    now,
  );
  assert.deepEqual(p.alert.map((r) => r.sweep), ["calls"]);
  // The log and the response body stay truthful while the mail is narrowed.
  assert.deepEqual(p.broken, ["deadman", "calls"]);
});

test("an unreadable stamp never buys silence", () => {
  // A NaN comparison reads as "recently alerted" and would quietly disable the
  // one channel that reports the outage.
  assert.deepEqual(
    chooseSweepAlerts([row({ alerted_at: "not a date" })], Date.now()).alert.map((r) => r.sweep),
    ["deadman"],
  );
});

test("recovery is reported, and every healthy sweep has its stamp cleared", () => {
  const p = chooseSweepAlerts(
    [
      row({ sweep: "calls", healthy: true, detail: null, alerted_at: new Date(Date.now() - 3600_000).toISOString() }),
      row({ sweep: "deadman", healthy: true, detail: null, alerted_at: null }),
    ],
    Date.now(),
  );
  assert.deepEqual(p.recovered, ["calls"]);
  // .healthy is what the edge hands to sweep_mark_alerted's p_healthy, which
  // does the clearing — without it a recovered sweep keeps a stamp and its
  // NEXT failure is suppressed by a window earned during the previous one.
  assert.deepEqual(p.healthy, ["calls", "deadman"]);
  assert.deepEqual(p.alert, []);
  assert.deepEqual(p.broken, []);
});

test("the alert says what broke and what it costs, and carries no customer data", () => {
  const body = describeSweepTrouble([
    row({ sweep: "calls", detail: 'the edge answered 503: {"ok":false,"error":"no_provider_credentials"}' }),
    row({ sweep: "deadman" }),
    row({ sweep: "health", detail: "the cron job sweep-health is disabled" }),
  ]);
  assert.match(body, /503/);
  assert.match(body, /no_provider_credentials/);
  assert.match(body, /stays 'ongoing' forever/);
  // This goes to the PLATFORM mailbox, which belongs to no tenant.
  assert.doesNotMatch(body, /\+\d{7,}/);
  assert.doesNotMatch(body, /conversation_id|phone_e164|escalation/);
});

test("a platform fault is addressed to the platform, never to a tenant", () => {
  const health = readCode("apps/edge/api/cron/health.ts");
  assert.match(health, /tenantId: null/);
  assert.match(health, /isEnvDefault: true/);
  // Looking a tenant up here would default to tenant #1's owner when the
  // lookup fails — the cross-tenant disclosure notify.ts exists to prevent.
  assert.doesNotMatch(health, /loadTenantNotifications/);
});

test("the health route always answers 200, even while reporting a broken sweep", () => {
  // Its own reply is recorded by pg_net and judged by /api/diag, so a non-2xx
  // used to report someone else's failure would make the watchdog report
  // ITSELF broken, and it could never report recovery.
  const health = readCode("apps/edge/api/cron/health.ts");
  assert.match(
    health,
    /return json\(200, \{ ok: true, healthy: plan\.broken\.length === 0, broken: plan\.broken \}\);/,
  );
  const returns = [...health.matchAll(/return json\((\d{3}),/g)].map((m) => Number(m[1]));
  assert.equal(
    returns.at(-1),
    200,
    "the last return in the handler must be the 200 — a non-2xx here is recorded by pg_net and read as the health check failing",
  );
});

/**
 * Statements only, with `--` comment lines removed.
 *
 * The forbidden-pattern assertion below was tripped by the COMMENT in the
 * migration explaining why that pattern is forbidden — the same trap
 * auth-gate.test.mjs documents, where the only way to make the guard pass is
 * to delete the rationale. Strip the comments instead. Whole-line only: this
 * migration has no trailing `--` after code, and a naive strip would eat a
 * legitimate `--` inside a dollar-quoted body.
 */
function sqlStatements(file) {
  return readRaw(file)
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
}

test("the CHECK is written in the form the house tooling can read", () => {
  // The LAST migration to define it, not the first. Reading 00026 alone would
  // keep passing while a later migration widened the set to something this
  // never sees — the same first-vs-last trap enums-vs-checks.test.mjs was
  // caught by twice. 00083 added 'jobs'; 00086 added the four hourly sweeps
  // that mutate state and were watched by nothing.
  const dir = path.join(ROOT, "supabase/migrations");
  const defs = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => /check \(sweep in \(/.test(fs.readFileSync(path.join(dir, f), "utf8")));
  assert.ok(defs.length >= 1, "something defines the constraint");
  const sql = sqlStatements(`supabase/migrations/${defs.at(-1)}`);
  // 00097 added 'lines': the sweep that resumes a provisioning saga the lambda's
  // 60-second ceiling killed mid-run. Watched from its first tick, like the rest.
  assert.match(sql, /check \(sweep in \('calls', 'deadman', 'health', 'jobs', 'registration', 'calendar', 'google', 'playbooks', 'lines'\)\)/);
  assert.doesNotMatch(sql, /= any \(array\[/);
});

test("the health check is never scheduled onto the grid it is judging", () => {
  // '*/30' fires at :00 and :30, both deadman ticks under '*/10'. Every health
  // run would then judge a request seconds old, exempt it under the two-minute
  // grace, and report healthy forever. A one-character regression that reads
  // as tidier and disables the entire lane.
  const sql = readRaw("supabase/migrations/00026_sweep_health.sql");
  assert.match(sql, /cron\.schedule\('sweep-health', '13,43 \* \* \* \*'/);
  assert.doesNotMatch(sql, /cron\.schedule\('sweep-health', '\*\/(5|10|15|30)/);
});

test("the idle call-reconcile path clears a stale note before returning", () => {
  // Without this, one transient Vault failure sets the note, the v_pending = 0
  // early return steps over the row on every subsequent tick — and with zero
  // ongoing calls that is EVERY tick — so the platform mailbox gets four mails
  // a day forever, curable only by hand-editing production.
  const sql = readRaw("supabase/migrations/00026_sweep_health.sql");
  const calls = sql.slice(
    sql.indexOf("function public.trigger_call_reconcile"),
    sql.indexOf("function public.trigger_sweep_health"),
  );
  const guard = calls.indexOf("if v_pending = 0 then");
  const clear = calls.indexOf("update public.sweep_status set note = null where sweep = 'calls'");
  assert.ok(guard > -1, "the idle guard must still exist");
  assert.ok(
    clear > guard && clear < calls.indexOf("return null;", guard),
    "the idle path must clear a stale note before it returns",
  );
});
