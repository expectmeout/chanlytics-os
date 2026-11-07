/**
 * A call is one row, whatever order its deliveries arrive in and however often (decision 0092), proved on a real
 * Postgres: ingest_call under the four events Retell sends -- call_started, transcript_updated, call_ended,
 * call_analyzed -- in all twenty-four orders, each delivered twice, as the webhook hands them (the provider's payload
 * only as the call ends and is analysed). Every order ends the same: one row, ended, its analysis kept, its whole
 * transcript, its seconds metered once, and of the payload only the allowlist (scrub_call_raw, 00530). Two deliveries at
 * once meter it once (the advisory lock).
 *
 * Local only: it writes calls, and refuses a database that is not on this machine.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { ingestCall } from "@chanlytics/db/voice";
import { normalizeCall } from "@chanlytics/channels/voice";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes calls"
      : false;

const stamp = Date.now();
const AGENT = `agent_order_${stamp}`;
const ALLOWED = new Set([
  "agent_id",
  "agent_name",
  "agent_version",
  "call_id",
  "call_type",
  "call_status",
  "direction",
  "disconnection_reason",
  "start_timestamp",
  "end_timestamp",
  "duration_ms",
  "call_cost",
  "latency",
  "llm_token_usage",
  "call_analysis",
  "metadata",
  "data_storage_setting",
  "opt_in_signed_url",
]);
let db;
let tenant;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db
    .from("tenants")
    .insert({ slug: `order-${stamp}`, name: "Order" })
    .select("id")
    .single();
  assert.equal(t.error, null, t.error?.message);
  tenant = t.data.id;
  const c = await db.from("tenant_channels").insert({ tenant_id: tenant, kind: "voice", external_id: AGENT });
  assert.equal(c.error, null, c.error?.message);
});

after(async () => {
  if (skip || !tenant) return;
  await db.from("calls").delete().eq("tenant_id", tenant);
  await db.from("events").delete().eq("tenant_id", tenant);
});

const T0 = Date.now() - 120_000;
const TURNS = [
  { role: "agent", content: "Thanks for calling." },
  { role: "user", content: "Are you open Saturday?" },
];

/** The four deliveries of one call, as Retell sends them, with what a briefing and a SIP header would carry. */
function deliveries(callId) {
  const base = {
    call_id: callId,
    agent_id: AGENT,
    direction: "inbound",
    from_number: "+16465550123",
    to_number: "+13055550100",
    start_timestamp: T0,
    retell_llm_dynamic_variables: { business_facts: "the facts", caller_context: "what they said last week" },
    custom_sip_headers: { "X-Diverted-From": "+13055550199" },
  };
  return {
    call_started: { ...base, call_status: "ongoing" },
    transcript_updated: { ...base, call_status: "ongoing", transcript_object: TURNS.slice(0, 1) },
    call_ended: {
      ...base,
      call_status: "ended",
      end_timestamp: T0 + 60_000,
      duration_ms: 60_000,
      disconnection_reason: "user_hangup",
      transcript_object: TURNS,
      transcript: "Agent: Thanks for calling.\nUser: Are you open Saturday?",
    },
    call_analyzed: {
      ...base,
      call_status: "ended",
      end_timestamp: T0 + 60_000,
      duration_ms: 60_000,
      disconnection_reason: "user_hangup",
      transcript_object: TURNS,
      call_analysis: {
        call_summary: "Asked about Saturday.",
        custom_analysis_data: { caller_wanted: "Saturday", outcome: "answered" },
      },
    },
  };
}

/** One delivery, as the webhook ingests it: the payload only as the call ends and is analysed. */
function ingest(event, call) {
  const keeps = event === "call_ended" || event === "call_analyzed";
  return ingestCall(db, tenant, normalizeCall(call), keeps ? call : undefined);
}

function* orders(xs) {
  if (xs.length <= 1) {
    yield xs;
    return;
  }
  for (let i = 0; i < xs.length; i++)
    for (const rest of orders([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [xs[i], ...rest];
}

async function rowOf(callId) {
  const r = await db
    .from("calls")
    .select("id, status, duration_ms, outcome, transcript_object, raw")
    .eq("tenant_id", tenant)
    .eq("retell_call_id", callId);
  assert.equal(r.error, null, r.error?.message);
  return r.data;
}

async function metered(callRowId) {
  const r = await db.from("events").select("id").eq("kind", "usage.voice_seconds").eq("subject_id", callRowId);
  assert.equal(r.error, null, r.error?.message);
  return r.data.length;
}

test(
  "every order of the four deliveries, each twice, leaves one row, ended, analysed, whole, metered once, the payload cut",
  { skip },
  async () => {
    let n = 0;
    for (const order of orders(["call_started", "transcript_updated", "call_ended", "call_analyzed"])) {
      const callId = `call_order_${stamp}_${n++}`;
      const d = deliveries(callId);
      for (const event of order) {
        await ingest(event, d[event]);
        await ingest(event, d[event]);
      }
      const rows = await rowOf(callId);
      const why = order.join(" > ");
      assert.equal(rows.length, 1, `one row: ${why}`);
      const [row] = rows;
      assert.equal(row.status, "ended", why);
      assert.equal(row.duration_ms, 60_000, why);
      assert.equal(row.outcome, "answered", `the analysis stays: ${why}`);
      assert.equal(row.transcript_object?.length, 2, `the whole transcript: ${why}`);
      assert.equal(await metered(row.id), 1, `metered once: ${why}`);
      for (const k of Object.keys(row.raw)) assert.ok(ALLOWED.has(k), `${k} kept in the payload: ${why}`);
      assert.ok("call_analysis" in row.raw, `the payload keeps the analysis: ${why}`);
    }
  },
);

test("two deliveries of one call's end at once meter it once", { skip }, async () => {
  const callId = `call_at_once_${stamp}`;
  const d = deliveries(callId);
  await ingest("call_started", d.call_started);
  await Promise.all([ingest("call_ended", d.call_ended), ingest("call_ended", d.call_ended)]);
  const [row] = await rowOf(callId);
  assert.equal(await metered(row.id), 1);
});
