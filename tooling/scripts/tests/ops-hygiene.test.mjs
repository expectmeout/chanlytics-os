/**
 * Two pieces of operational hygiene from the Tier 1 ledger.
 *
 * The webhook evidence rows (webhook.auth, webhook.delivery) are written per
 * call turn and were never purged; the e2e suite only ran when somebody
 * remembered to run it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readRaw } from "./_source.mjs";

test("the events purge drops only the two evidence kinds, past 30 days, on a minute no sweep uses", () => {
  const sql = readRaw("supabase/migrations/00038_events_purge.sql");
  assert.ok(sql.includes("create or replace function public.purge_events(p_keep interval default '30 days')"));
  assert.ok(sql.includes("where kind in ('webhook.auth', 'webhook.delivery')"), "the record kinds are never touched");
  assert.ok(sql.includes("and created_at < now() - p_keep;"));
  assert.ok(sql.includes("security definer"));
  assert.ok(sql.includes("set search_path = public"));
  assert.ok(sql.includes("revoke execute on function public.purge_events(interval) from public, anon, authenticated;"));
  assert.ok(sql.includes("select cron.unschedule('purge-events') where exists (select 1 from cron.job where jobname = 'purge-events');"), "re-runnable");
  const m = sql.match(/cron\.schedule\('purge-events', '(\d+) (\d+) \* \* \*'/);
  assert.ok(m, "scheduled daily");
  const minute = Number(m[1]);
  assert.ok(minute % 5 !== 0, "must not share a minute with call-reconcile (*/5), deadman (*/10) or sweep-health (:13/:43)");
  assert.ok(minute !== 13 && minute !== 43);
});

test("the nightly e2e job exists, runs against production, and is honest about what needs secrets", () => {
  const y = readRaw(".github/workflows/nightly-e2e.yml");
  assert.ok(y.includes('cron: "0 9 * * *"'));
  assert.ok(y.includes("workflow_dispatch:"));
  assert.ok(y.includes("E2E_BASE_URL: https://chanlytics-os.vercel.app"));
  assert.ok(y.includes("run: pnpm e2e:install") && y.includes("run: pnpm e2e"));
  for (const s of ["E2E_SUPABASE_URL", "E2E_SUPABASE_ANON_KEY", "E2E_SERVICE_ROLE_KEY", "E2E_USER_EMAIL"]) {
    assert.ok(y.includes(`secrets.${s}`), s);
  }
  assert.ok(y.includes("the owner's decision"), "the rule about live secrets in CI is stated, not silently broken");
  assert.ok(y.includes("if: failure()") && y.includes("retention-days: 7"), "a report can carry a real workspace's data");
  assert.ok(y.includes("permissions:\n  contents: read"));
});
