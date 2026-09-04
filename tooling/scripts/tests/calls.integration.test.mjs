/**
 * ingest_call, against the live schema.
 *
 * The unit tests pin what the adapter and the view model do with a row; this
 * pins what the ROW does under the delivery Retell actually promises: events
 * in order but not blocking, retried up to three times. A retried
 * call_started after call_ended must change nothing — not the status, not
 * the transcript, not the heartbeat. Runs on the smoke tenant with throwaway
 * rows; skips without credentials so CI stays secret-free.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { ingestCall } from "@chanlytics/db";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY ? "no service-role credentials in env" : false;
const db = skip ? null : createClient(URL_, KEY, { auth: { persistSession: false } });

const SMOKE_SLUG = "chanlytics-smoke-test";
const PHONE = "+15550117744";
const AGENT = "agent_lifecycle_probe";
const PREFIX = `lifecycle-${Date.now()}`;

async function smokeTenantId() {
  const { data, error } = await db.from("tenants").select("id").eq("slug", SMOKE_SLUG).single();
  assert.equal(error, null, error?.message);
  return data.id;
}

async function cleanup(tenantId) {
  const { data: calls } = await db.from("calls").select("id").eq("tenant_id", tenantId).like("retell_call_id", `${PREFIX}%`);
  for (const k of calls ?? []) await db.from("events").delete().eq("subject_id", k.id);
  await db.from("calls").delete().eq("tenant_id", tenantId).like("retell_call_id", `${PREFIX}%`);
  const { data: rows } = await db.from("contacts").select("id").eq("tenant_id", tenantId).eq("phone_e164", PHONE);
  for (const c of rows ?? []) {
    const { data: conv } = await db.from("conversations").select("id").eq("contact_id", c.id);
    for (const v of conv ?? []) {
      await db.from("messages").delete().eq("conversation_id", v.id);
      await db.from("conversations").delete().eq("id", v.id);
    }
    await db.from("contact_identities").delete().eq("contact_id", c.id);
    await db.from("events").delete().eq("subject_id", c.id);
    await db.from("contacts").delete().eq("id", c.id);
  }
}

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

function call(retellCallId, over = {}) {
  return {
    retellCallId, agentId: AGENT, direction: "inbound", callType: "phone_call",
    fromE164: PHONE, fromRaw: PHONE, toE164: null, status: "ongoing",
    startedAtIso: new Date().toISOString(), endedAtIso: null, durationMs: null,
    disconnectionReason: null, sentiment: null, callSuccessful: null, inVoicemail: null,
    summary: null, transcript: null, transcriptObject: null, recordingUrl: null,
    publicLogUrl: null, cost: null, latency: null, ...over,
  };
}

async function row(tenantId, retellCallId) {
  return ok(await db.from("calls").select("id, status, duration_ms, transcript_object, recording, updated_at").eq("tenant_id", tenantId).eq("retell_call_id", retellCallId).single());
}

async function usageRows(callId) {
  return ok(await db.from("events").select("id").eq("subject_id", callId).eq("kind", "usage.voice_seconds"));
}

test("a call's status only moves forward, and a stale event is a no-op that says so", { skip }, async () => {
  const tenantId = await smokeTenantId();
  await cleanup(tenantId);
  const id = `${PREFIX}-1`;
  try {
    // call_started
    const started = await ingestCall(db, tenantId, call(id));
    assert.equal(started.is_new, true);
    assert.equal(started.skipped, false);
    assert.equal((await row(tenantId, id)).status, "ongoing");
    assert.equal((await usageRows(started.call_id)).length, 0, "no duration yet, nothing to meter");

    // a live turn
    const turn = await ingestCall(db, tenantId, call(id, { transcriptObject: [{ role: "agent", content: "hello" }] }));
    assert.equal(turn.skipped, false);
    assert.deepEqual((await row(tenantId, id)).transcript_object, [{ role: "agent", content: "hello" }]);

    // call_ended: the duration becomes known HERE, on the second event
    const ended = await ingestCall(db, tenantId, call(id, {
      status: "ended", endedAtIso: new Date().toISOString(), durationMs: 65_000,
      transcriptObject: [{ role: "agent", content: "hello" }, { role: "user", content: "hi" }],
    }));
    assert.equal(ended.is_new, false);
    assert.equal(ended.skipped, false);
    const afterEnd = await row(tenantId, id);
    assert.equal(afterEnd.status, "ended");
    assert.equal(afterEnd.duration_ms, 65_000);
    assert.equal((await usageRows(ended.call_id)).length, 1, "metered once, when the duration first arrived");

    // Retell retries call_started (it was not blocking). Nothing may move.
    const late = await ingestCall(db, tenantId, call(id, { transcriptObject: [{ role: "agent", content: "hello" }] }));
    assert.equal(late.skipped, true);
    assert.equal(late.call_id, ended.call_id);
    const afterLate = await row(tenantId, id);
    assert.equal(afterLate.status, "ended", "REGRESSION: the phantom live call");
    assert.equal(afterLate.transcript_object.length, 2, "the partial transcript did not replace the final one");
    assert.equal(afterLate.updated_at, afterEnd.updated_at, "a stale event must not restart the heartbeat");

    // A late `registered` is just as stale.
    assert.equal((await ingestCall(db, tenantId, call(id, { status: "registered" }))).skipped, true);

    // call_analyzed (same rank as ended) enriches, and does not meter twice.
    const analyzed = await ingestCall(db, tenantId, call(id, { status: "ended", durationMs: 65_000, summary: "Asked about Saturday.", sentiment: "Positive" }));
    assert.equal(analyzed.skipped, false);
    assert.equal((await usageRows(analyzed.call_id)).length, 1);
    assert.equal((await row(tenantId, id)).status, "ended");
  } finally {
    await cleanup(tenantId);
  }
});

test("a dial that never connected is stored as not_connected and counted nowhere", { skip }, async () => {
  const tenantId = await smokeTenantId();
  await cleanup(tenantId);
  try {
    // One real call, so the counts have a baseline of exactly one.
    const real = await ingestCall(db, tenantId, call(`${PREFIX}-real`, { status: "ended", durationMs: 30_000, endedAtIso: new Date().toISOString() }));
    const before = ok(await db.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: 1 }));
    const peopleBefore = ok(await db.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: real.contact_id }));
    assert.equal(peopleBefore[0].call_count, 1);

    const missed = await ingestCall(db, tenantId, call(`${PREFIX}-missed`, { status: "not_connected", disconnectionReason: "dial_failed" }));
    assert.equal(missed.is_new, true);
    assert.equal((await row(tenantId, `${PREFIX}-missed`)).status, "not_connected");

    const after = ok(await db.rpc("metrics_summary", { p_tenant_id: tenantId, p_days: 1 }));
    assert.equal(after.period.calls, before.period.calls, "Today's call count ignores the dial that never connected");
    const peopleAfter = ok(await db.rpc("people_list", { p_tenant_id: tenantId, p_contact_id: real.contact_id }));
    assert.equal(peopleAfter[0].call_count, 1, "People's call count ignores it too");
    const report = ok(await db.rpc("report_series", { p_tenant_id: tenantId, p_days: 7 }));
    const today = report.series[report.series.length - 1];
    assert.ok(today.calls >= 1, "the real call is in the report");
    // The missed dial is not: if it were, today's count would be one higher
    // than the connected calls the tenant made.
    const { count } = await db.from("calls").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).neq("status", "not_connected").gte("started_at", new Date(Date.now() - 86_400_000).toISOString());
    assert.ok(today.calls <= count, "report counts only connected calls");
  } finally {
    await cleanup(tenantId);
  }
});

test("two deliveries of the same ended call, at once, meter it once", { skip }, async () => {
  const tenantId = await smokeTenantId();
  await cleanup(tenantId);
  const id = `${PREFIX}-race`;
  try {
    await ingestCall(db, tenantId, call(id));
    // A webhook retry overlapping the reconcile sweep: both carry the duration.
    const ended = call(id, { status: "ended", endedAtIso: new Date().toISOString(), durationMs: 42_000 });
    const [a, b] = await Promise.all([ingestCall(db, tenantId, ended), ingestCall(db, tenantId, ended)]);
    assert.equal(a.call_id, b.call_id);
    assert.equal((await usageRows(a.call_id)).length, 1, "REGRESSION: the prior-duration read ran outside the lock");
  } finally {
    await cleanup(tenantId);
  }
});

test("no provider URL is stored on the row; the audit copy keeps its analysis", { skip }, async () => {
  const tenantId = await smokeTenantId();
  await cleanup(tenantId);
  const id = `${PREFIX}-scrub`;
  try {
    const rawEnded = { call_id: id, recording_url: "https://cdn.invalid/a.wav", public_log_url: "https://logs.invalid/x", call_status: "ended" };
    const res = await ingestCall(db, tenantId, call(id, { status: "ended", durationMs: 5_000, recordingUrl: "https://cdn.invalid/a.wav", publicLogUrl: "https://logs.invalid/x" }), rawEnded);
    const row = ok(await db.from("calls").select("raw, public_log_url, recording").eq("id", res.call_id).single());
    assert.equal(row.raw.recording_url, undefined);
    assert.equal(row.raw.public_log_url, undefined);
    assert.equal(row.public_log_url, null);
    assert.equal(row.recording.provider_url, undefined);
    assert.equal(row.recording.fetch_state, "pending");

    // call_analyzed, then a retried call_ended (same rank): the analysis stays.
    await ingestCall(db, tenantId, call(id, { status: "ended", durationMs: 5_000, summary: "Booked." }), { ...rawEnded, call_analysis: { call_summary: "Booked." } });
    await ingestCall(db, tenantId, call(id, { status: "ended", durationMs: 5_000 }), rawEnded);
    const after = ok(await db.from("calls").select("raw, summary").eq("id", res.call_id).single());
    assert.equal(after.summary, "Booked.");
    assert.ok(after.raw.call_analysis, "REGRESSION: a same-rank retry replaced the richer payload");
  } finally {
    await cleanup(tenantId);
  }
});

test("a recording's copy state survives re-ingest: pending keeps its attempts, failed and stored are terminal", { skip }, async () => {
  const tenantId = await smokeTenantId();
  await cleanup(tenantId);
  const id = `${PREFIX}-rec`;
  const url = "https://example.invalid/recording.wav";
  try {
    const first = await ingestCall(db, tenantId, call(id, { status: "ended", durationMs: 10_000, recordingUrl: url }));
    assert.equal(first.recording_state, "pending");

    // The webhook's copy timed out twice: the row carries the attempts.
    ok(await db.from("calls").update({ recording: { provider_url: url, fetch_state: "pending", attempts: 2, error: "timeout" } }).eq("id", first.call_id));
    const again = await ingestCall(db, tenantId, call(id, { status: "ended", durationMs: 10_000, recordingUrl: url, summary: "analyzed" }));
    assert.equal(again.recording_state, "pending");
    assert.equal(again.recording_attempts, 2, "call_analyzed must not reset the sweep's bound");

    ok(await db.from("calls").update({ recording: { provider_url: url, fetch_state: "failed", attempts: 3 } }).eq("id", first.call_id));
    const afterFail = await ingestCall(db, tenantId, call(id, { status: "ended", durationMs: 10_000, recordingUrl: url }));
    assert.equal(afterFail.recording_state, "failed", "given up is given up");
  } finally {
    await cleanup(tenantId);
  }
});
