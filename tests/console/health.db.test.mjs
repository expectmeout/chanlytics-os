/**
 * Health against the replayed stack (00469, decision 0068).
 *
 * Our own workspaces wear `ours`, false for every other, and the answer-rate check leaves them out as the pager does.
 * A failed model call keeps what the API said, its words held to 300 characters. The errors pages hit are the service
 * role's alone (no member reads or writes them), their words held to their limits, and kept thirty days by a clock the
 * health check watches. Every clock is read beside pg_cron's own record of its runs, and every part's numbers answer in
 * one read, each row keyed by whether its workspace is ours; neither is anyone's but the service role's.
 *
 * Skips without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the refusals this suite proves are a session's"
        : false;

const ok = (r) => {
  assert.equal(r.error, null, r.error?.message);
  return r.data;
};

let db;
let anon;
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const tenants = [];
const PARTS = [
  "days",
  "sends",
  "send_errors",
  "calls",
  "webhooks",
  "billing",
  "model",
  "model_by_workspace",
  "model_failures",
  "deliveries",
  "delivery_failures",
  "ask",
  "ask_traced",
  "ask_tools",
  "ask_by_workspace",
  "ask_failures",
  "ask_threads",
  "lines",
  "channels",
  "google",
  "mailboxes",
];

async function workspace(label, ours) {
  const t = ok(
    await db
      .from("tenants")
      .insert({ slug: `health-${label}-${RUN}`.slice(0, 60), name: `Health ${label}`, status: "active", ours })
      .select("id, ours")
      .single(),
  );
  tenants.push(t.id);
  return t.id;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  anon = createClient(URL_, ANON, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  await db
    .from("client_errors")
    .delete()
    .like("fingerprint", `t-${RUN.slice(-5)}%`);
  for (const id of tenants) await db.from("tenants").delete().eq("id", id);
});

test("a workspace is not ours unless marked, and the answer-rate check leaves ours out", { skip }, async () => {
  const customer = await workspace("customer", false);
  const mine = await workspace("ours", true);
  const plain = ok(
    await db
      .from("tenants")
      .insert({ slug: `health-plain-${RUN}`.slice(0, 60), name: "Health plain", status: "active" })
      .select("id, ours")
      .single(),
  );
  tenants.push(plain.id);
  assert.equal(plain.ours, false, "every workspace is a customer's until marked");
  const day = "2020-01-02";
  for (const id of [customer, mine])
    ok(await db.from("platform_metrics").insert({ tenant_id: id, day, asks: 4, answered: 0 }));
  const silent = ok(await db.rpc("platform_answer_silence", { p_day: day }));
  const ids = silent.map((r) => r.tenant_id);
  assert.ok(ids.includes(customer), "a customer answered nobody: the pager hears of it");
  assert.ok(!ids.includes(mine), "our own workspace's silence is Health's, never a page");
  await db.from("platform_metrics").delete().eq("day", day).in("tenant_id", [customer, mine]);
});

test("a failed model call keeps the API's type and words, held to 300 characters", { skip }, async () => {
  const t = await workspace("model", false);
  const row = {
    tenant_id: t,
    purpose: "ask",
    model_asked: "claude-opus-5-5",
    model: "claude-opus-5-5",
    outcome: "rejected",
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    usd: 0,
    error_type: "invalid_request_error",
  };
  ok(
    await db
      .from("ai_usage")
      .insert({ ...row, error_message: "Your credit balance is too low to access the Anthropic API." }),
  );
  const long = await db.from("ai_usage").insert({ ...row, error_message: "x".repeat(301) });
  assert.equal(long.error?.code, "23514", "a reason past 300 characters is refused");
  const parts = ok(await db.rpc("platform_health_parts", { p_days: 1 }));
  const mine = parts.model_failures.filter((f) => f.tenant_id === t);
  assert.deepEqual(
    mine.map((f) => [f.purpose, f.outcome, f.error_type, f.ours]),
    [["ask", "rejected", "invalid_request_error", false]],
  );
  await db.from("ai_usage").delete().eq("tenant_id", t);
});

test(
  "the errors pages hit are the service role's alone, their words held, kept thirty days by a clock the health check watches",
  { skip },
  async () => {
    const fp = `t-${RUN.slice(-5)}`;
    const kept = {
      fingerprint: fp,
      boundary: "os",
      page: "inbox",
      name: "TypeError",
      message: "Cannot read properties of undefined (reading 'id')",
      build: "3de53f9a1c2b",
      device: "desk",
      member_key: "member-one",
    };
    ok(await db.from("client_errors").insert(kept));
    assert.equal((await db.from("client_errors").insert({ ...kept, message: "y".repeat(301) })).error?.code, "23514");
    assert.equal((await db.from("client_errors").insert({ ...kept, name: "n".repeat(121) })).error?.code, "23514");
    const read = await anon.from("client_errors").select("id").eq("fingerprint", fp);
    assert.deepEqual(read.data ?? [], [], "nobody signed out or in reads them");
    const wrote = await anon.from("client_errors").insert({ ...kept, fingerprint: `${fp}-anon` });
    assert.ok(wrote.error, "nor writes one");
    const clocks = ok(await db.rpc("platform_clocks", { p_days: 7 }));
    const purge = clocks.find((c) => c.sweep === "purge_client_errors");
    assert.ok(purge, "the purge is a clock the health check judges");
    assert.equal(purge.jobname, "purge-client-errors");
    assert.equal(purge.schedule, "33 4 * * *");
    assert.equal(purge.judged_by, "run");
  },
);

test(
  "every clock beside pg_cron's runs, and every part in one read, for the service role and nobody else",
  { skip },
  async () => {
    const clocks = ok(await db.rpc("platform_clocks", { p_days: 7 }));
    assert.ok(clocks.length >= 30, `the registry's clocks, each with its schedule: ${clocks.length}`);
    for (const c of clocks) {
      assert.equal(typeof c.sweep, "string");
      assert.ok(Number.isInteger(c.runs) && Number.isInteger(c.failed), c.sweep);
    }
    const parts = ok(await db.rpc("platform_health_parts", { p_days: 30 }));
    assert.deepEqual(Object.keys(parts).sort(), [...PARTS].sort());
    assert.equal(parts.days, 30);
    for (const k of PARTS.filter((p) => p !== "days")) assert.ok(Array.isArray(parts[k]), k);
    assert.ok(
      parts.ask.some((r) => r.ours === null) || parts.ask.length === 0,
      "Ask's row for every workspace is keyed by no side",
    );
    for (const fn of ["platform_clocks", "platform_health_parts"]) {
      const r = await anon.rpc(fn, { p_days: 7 });
      assert.ok(r.error, `${fn} is refused to a session`);
    }
  },
);
