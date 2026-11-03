/**
 * What a call row keeps, and the two claims it carries (00519, decision 0092), proved on a real Postgres:
 *   - scrub_call_raw keeps an allowlist of the provider's payload: never the facts and memory the call was briefed
 *     with, the SIP headers, the telephony ids, the transcripts or the recording links; a payload that is not an
 *     object keeps nothing;
 *   - a delivery that carries no payload (a live turn) leaves the row's as it was;
 *   - a spoken price's correction is claimed once (claimGuardCorrection);
 *   - a notice claimed and not told is the sweep's to finish (callsOwedANotice) until it is told (markCallNoticeTold).
 *
 * Local only: it writes calls, and refuses a database that is not on this machine.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  callsOwedANotice,
  claimCallNotification,
  claimGuardCorrection,
  ingestCall,
  markCallNoticeTold,
} from "@chanlytics/db";
import { normalizeCall } from "@chanlytics/channels";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes calls"
      : false;

const stamp = Date.now();
const AGENT = `agent_keeps_${stamp}`;
let db;
let tenant;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t = await db
    .from("tenants")
    .insert({ slug: `keeps-${stamp}`, name: "Keeps" })
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

const ended = (callId, extra = {}) => ({
  call_id: callId,
  agent_id: AGENT,
  direction: "inbound",
  from_number: "+16465550123",
  to_number: "+13055550100",
  call_status: "ended",
  start_timestamp: Date.now() - 60_000,
  end_timestamp: Date.now() - 1_000,
  duration_ms: 59_000,
  ...extra,
});

test("the payload keeps the allowlist alone, and a payload that is no object keeps nothing", { skip }, async () => {
  const { data, error } = await db.rpc("scrub_call_raw", {
    p_raw: {
      agent_id: "agent_x",
      call_cost: { combined_cost: 12 },
      call_analysis: { call_summary: "s" },
      retell_llm_dynamic_variables: { caller_context: "what they said" },
      custom_sip_headers: { "X-Diverted-From": "+13055550199" },
      telephony_identifier: { twilio_call_sid: "CA1" },
      transcript: "Agent: hi",
      transcript_object: [],
      transcript_with_tool_calls: [],
      tool_calls: [],
      recording_url: "https://cdn.example.com/a.wav",
      public_log_url: "https://cdn.example.com/log",
    },
  });
  assert.equal(error, null, error?.message);
  assert.deepEqual(Object.keys(data).sort(), ["agent_id", "call_analysis", "call_cost"]);
  const odd = await db.rpc("scrub_call_raw", { p_raw: [1, 2] });
  assert.deepEqual(odd.data, {});
});

test("a delivery with no payload leaves the row's; one with a payload keeps it scrubbed", { skip }, async () => {
  const id = `call_keeps_${stamp}`;
  const first = ended(id, { retell_llm_dynamic_variables: { business_facts: "facts" }, agent_version: 4 });
  await ingestCall(db, tenant, normalizeCall(first), first);
  const again = ended(id);
  await ingestCall(db, tenant, normalizeCall(again), undefined);
  const { data, error } = await db
    .from("calls")
    .select("raw")
    .eq("tenant_id", tenant)
    .eq("retell_call_id", id)
    .single();
  assert.equal(error, null, error?.message);
  assert.equal(data.raw.agent_version, 4, "kept as it was");
  assert.equal("retell_llm_dynamic_variables" in data.raw, false, "never the briefing");
});

test("a correction is claimed once, and a notice claimed and not told is owed until it is told", { skip }, async () => {
  const id = `call_claims_${stamp}`;
  const c = ended(id);
  const res = await ingestCall(db, tenant, normalizeCall(c), c);
  assert.equal(await claimGuardCorrection(db, tenant, res.call_id), true);
  assert.equal(await claimGuardCorrection(db, tenant, res.call_id), false, "a second instance corrects nothing");

  assert.equal(await claimCallNotification(db, tenant, res.call_id), true);
  const owed = await callsOwedANotice(db, { nowMs: Date.now() + 1_000, fromMs: 0, toMs: 60_000, limit: 50 });
  assert.ok(
    owed.some((r) => r.id === res.call_id),
    "claimed and not told: the sweep's",
  );
  await markCallNoticeTold(db, tenant, res.call_id);
  const after = await callsOwedANotice(db, { nowMs: Date.now() + 1_000, fromMs: 0, toMs: 60_000, limit: 50 });
  assert.equal(
    after.some((r) => r.id === res.call_id),
    false,
    "told: owed no more",
  );
});
