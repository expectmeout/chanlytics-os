/**
 * The public health door, judged against a fake database: 200 only when
 * every registered clock is healthy and nothing due is waiting; 503 names
 * the unhealthy clocks and nothing else; a health function that cannot be
 * read is 503 with a reason and none of the database's words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { judgeHealth, GET } = await import(pathToFileURL(path.join(ROOT, "apps/edge/api/health.ts")).href);

const db = (rows, backlog, healthError = null, backlogError = null) => ({
  rpc: async (name) => (name === "sweep_health" ? { data: rows, error: healthError } : { data: backlog, error: backlogError }),
});
const row = (sweep, healthy) => ({ sweep, healthy, detail: healthy ? null : "the cron job is disabled (secret-ish detail)", last_request_at: null, status_code: null, scheduled: true, alerted_at: null });
const NOW = new Date("2026-09-11T12:00:00.000Z");

test("every clock healthy and nothing waiting is 200", async () => {
  const a = await judgeHealth(db([row("jobs", true), row("purge_events", true), row("partitions", true)], 0), NOW);
  assert.equal(a.status, 200);
  assert.deepEqual(a.body, { ok: true, unhealthy: [], jobs_backlog: 0, checked_at: "2026-09-11T12:00:00.000Z" });
});

test("one unhealthy clock is 503, named, with its detail kept inside", async () => {
  const a = await judgeHealth(db([row("jobs", true), row("partitions", false)], 0), NOW);
  assert.equal(a.status, 503);
  assert.deepEqual(a.body.unhealthy, ["partitions"]);
  assert.ok(!JSON.stringify(a.body).includes("secret-ish"), "the detail is for the inside; the monitor gets the name");
});

test("due work nobody drains is 503 even when every clock ticks", async () => {
  const a = await judgeHealth(db([row("jobs", true)], 7), NOW);
  assert.equal(a.status, 503);
  assert.equal(a.body.ok, false);
  assert.equal(a.body.jobs_backlog, 7);
});

test("a backlog that cannot be read is not 'zero'", async () => {
  const a = await judgeHealth(db([row("jobs", true)], null, null, { message: "permission denied" }), NOW);
  assert.equal(a.status, 503, "unknown is not healthy");
  assert.equal(a.body.jobs_backlog, null);
});

test("a health function that cannot be read is 503 with a reason, and none of the database's words", async () => {
  const a = await judgeHealth(db(null, 0, { message: "permission denied for schema cron (secret-ish)" }), NOW);
  assert.equal(a.status, 503);
  assert.equal(a.body.reason, "health_unreadable");
  assert.ok(!JSON.stringify(a.body).includes("secret-ish"));
});

test("the door itself: no database is 503 no_database; with one, the judgement is served through the real client, and a second knock inside ten seconds is answered from the cache", async () => {
  // Executed, not read: the handler, the edge's own Postgres client and the
  // cache, with only the wire replaced. PostgREST's two calls are answered as
  // PostgREST answers them.
  // No credentials, no client: what the door answers on a deployment whose
  // Supabase env is not set. (It used to withhold PG_WRITES, which no longer
  // decides anything — the client is keyed on the credentials alone.)
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dark = await GET();
  assert.equal(dark.status, 503);
  assert.equal((await dark.json()).reason, "no_database");

  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (u.endsWith("/rest/v1/rpc/sweep_health")) return json([row("jobs", true), row("partitions", false)]);
    if (u.endsWith("/rest/v1/rpc/jobs_backlog")) return json(0);
    throw new Error(`the health door asked the database something it never did before: ${u}`);
  };
  process.env.PG_WRITES = "on";
  process.env.SUPABASE_URL = "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const first = await GET();
    assert.equal(first.status, 503);
    assert.equal(first.headers.get("cache-control"), "no-store");
    assert.equal(first.headers.get("content-type"), "application/json");
    const body = await first.json();
    assert.deepEqual(body.unhealthy, ["partitions"]);
    assert.equal(body.jobs_backlog, 0);
    assert.equal(body.ok, false);
    assert.ok(!JSON.stringify(body).includes("secret-ish"));
    assert.deepEqual(calls.map((u) => u.slice(u.lastIndexOf("/") + 1)).sort(), ["jobs_backlog", "sweep_health"]);

    const again = await GET();
    assert.equal(again.status, 503);
    assert.deepEqual(await again.json(), body);
    assert.equal(calls.length, 2, "cached: a noisy pinger is not a load on the database");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.PG_WRITES;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});
