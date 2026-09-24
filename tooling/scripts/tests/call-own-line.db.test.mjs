/**
 * A call is filed under its own workspace's line (00164), proved on a real Postgres. ingest_call finds a call's
 * channel by the agent id it carries, and only among the lines of the workspace the call belongs to: an agent id from
 * another workspace leaves the call's channel empty instead of putting that workspace's line on it.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes calls"
      : false;

const stamp = Date.now();
let db;
/** Two workspaces with a voice line each: the call's own, and another. */
const ws = {};
before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  for (const name of ["own", "other"]) {
    const t = await db
      .from("tenants")
      .insert({ slug: `own-line-${name}-${stamp}`, name: `Own line ${name}` })
      .select("id")
      .single();
    assert.equal(t.error, null, t.error?.message);
    const agent = `agent_ownline_${name}_${stamp}`;
    const c = await db
      .from("tenant_channels")
      .insert({ tenant_id: t.data.id, kind: "voice", external_id: agent })
      .select("id")
      .single();
    assert.equal(c.error, null, c.error?.message);
    ws[name] = { tenant: t.data.id, channel: c.data.id, agent };
  }
});
after(async () => {
  if (skip) return;
  // The own workspace first: before 00164 its call could point at the other's line, which would hold that line.
  for (const name of ["own", "other"]) {
    if (!ws[name]) continue;
    await db.from("events").delete().eq("tenant_id", ws[name].tenant);
    await db.from("tenants").delete().eq("id", ws[name].tenant);
  }
});

/** An ended call as the webhook ingests it, for `tenant`, carrying `agent`. */
async function ingest(tenant, agent, call) {
  const at = new Date().toISOString();
  const r = await db.rpc("ingest_call", {
    p_tenant_id: tenant,
    p_retell_call_id: `${call}_${stamp}`,
    p_agent_id: agent,
    p_from_e164: "+19175550137",
    p_from_raw: "+19175550137",
    p_to_e164: null,
    p_direction: "inbound",
    p_call_type: "phone_call",
    p_status: "ended",
    p_started_at: at,
    p_ended_at: at,
    p_duration_ms: null,
    p_disconnection: null,
    p_sentiment: null,
    p_successful: null,
    p_in_voicemail: false,
    p_summary: null,
    p_transcript: null,
    p_transcript_obj: null,
    p_recording: null,
    p_public_log_url: null,
    p_cost: {},
    p_latency: {},
    p_raw: {},
  });
  assert.equal(r.error, null, r.error?.message);
  const row = await db.from("calls").select("tenant_id, channel_id").eq("id", r.data.call_id).single();
  assert.equal(row.error, null, row.error?.message);
  return row.data;
}

test("a call carrying its own workspace's agent id is filed under that workspace's line", { skip }, async () => {
  const call = await ingest(ws.own.tenant, ws.own.agent, "call_ownline_mine");
  assert.equal(call.tenant_id, ws.own.tenant);
  assert.equal(call.channel_id, ws.own.channel);
});

test(
  "a call carrying another workspace's agent id is filed under no line, never that workspace's",
  { skip },
  async () => {
    const call = await ingest(ws.own.tenant, ws.other.agent, "call_ownline_theirs");
    assert.equal(call.tenant_id, ws.own.tenant);
    assert.notEqual(call.channel_id, ws.other.channel, "the other workspace's line was put on this workspace's call");
    assert.equal(call.channel_id, null);
  },
);
