/**
 * A call's topic and language land in calls.analysis with no migration (the Reports lenses spec, K2): ingest_call keeps
 * the provider's custom analysis whole, beside the four answers it files as columns, and a retried call_ended that
 * carries none must not blank them. Runs against the database `supabase start` builds on this machine, never production.
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
let tenantId;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  tenantId = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-topic-${stamp}`, name: "Harbor Topic" })
      .select("id")
      .single(),
  ).id;
});

after(async () => {
  if (skip) return;
  if (tenantId) {
    await db.from("events").delete().eq("tenant_id", tenantId);
    await db.from("tenants").delete().eq("id", tenantId);
  }
});

/** An ended call as the webhook ingests it; `analysis` rides as the door's last argument when there is one. */
const ingest = (analysis) =>
  db.rpc("ingest_call", {
    p_tenant_id: tenantId,
    p_retell_call_id: `topic_${stamp}`,
    p_agent_id: null,
    p_from_e164: "+15550139301",
    p_from_raw: "+15550139301",
    p_to_e164: null,
    p_direction: "inbound",
    p_call_type: "phone_call",
    p_status: "ended",
    p_started_at: new Date().toISOString(),
    p_ended_at: new Date().toISOString(),
    p_duration_ms: 42_000,
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
    ...(analysis ? { p_analysis: analysis } : {}),
  });

test(
  "topic and language land in calls.analysis beside the columns, and a retried end that carries none keeps them",
  { skip },
  async () => {
    const analysis = {
      caller_wanted: "Asked what a gel refill costs.",
      outcome: "answered",
      follow_up: "",
      caller_name: "",
      topic: "pricing",
      language: "es",
    };
    const first = ok(await ingest(analysis));
    const row = async () =>
      ok(await db.from("calls").select("analysis, wanted, outcome").eq("id", first.call_id).single());
    let call = await row();
    assert.equal(call.analysis.topic, "pricing");
    assert.equal(call.analysis.language, "es");
    assert.deepEqual(
      [call.wanted, call.outcome],
      ["Asked what a gel refill costs.", "answered"],
      "the columns are filed as before",
    );
    ok(await ingest(null));
    call = await row();
    assert.deepEqual(
      [call.analysis.topic, call.analysis.language],
      ["pricing", "es"],
      "a retry with no analysis blanks nothing",
    );
  },
);
