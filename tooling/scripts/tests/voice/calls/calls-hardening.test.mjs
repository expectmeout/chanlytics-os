/**
 * The call pipeline under retries, replays and volume.
 *
 * Review findings F6, F7, F9, F10, F13, F25, F41, F43: the thread note frozen
 * at "No summary available.", the post-call email sent once per delivery,
 * usage metered twice under concurrency, the unsigned recording URL reaching
 * every member's browser over realtime, six surfaces repainting on every
 * transcript turn, Live copy claiming checks the sweep never made, a 200 that
 * forfeited the provider's retries, and a 404 treated as final.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { toLiveCallVM } from "@chanlytics/contracts";
import { readCode, readRaw } from "../../_source.mjs";
import { changesOf } from "../../_live-feed.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const here = path.dirname(fileURLToPath(import.meta.url));
const { wantsRefresh, subscribesToRealtime, DEFAULT_REFRESH_TABLES } = await import(
  pathToFileURL(path.join(here, "../../../../../apps/dashboard/src/legacy-bridge/surface-realtime.ts")).href
);

const sql = readRaw("supabase/migrations/00034_call_pipeline_hardening.sql");

test("the trigger wakes the edge for calls never analysed", () => {
  // Message bodies are immutable (P3): a note written on call_ended stayed
  // "No summary available." forever. The webhook's half -- the note waits for
  // the summary -- runs in retell-webhook-door.test.mjs; the sweep's -- the
  // line written after the grace period for a call the provider never
  // analysed -- runs in cron-doors-b.test.mjs. This is the trigger's.
  assert.ok(sql.includes("and message_id is null"), "the trigger wakes the edge for them");
});

test("the post-call email and memory note happen once: a claim on the row", () => {
  assert.ok(sql.includes("add column if not exists notified_at timestamptz"));
  const claim = readCode("packages/db/src/repositories/calls.ts");
  assert.ok(claim.includes('.is("notified_at", null)'));
  assert.ok(claim.includes('.select("id")'), "the claim counts rows — RLS is silent on a forbidden UPDATE");
});

test("usage is metered once under concurrency, and the audit copy keeps its analysis", () => {
  // The call-level lock is taken BEFORE the prior-state read.
  const lock = sql.indexOf("'|call|' || p_retell_call_id");
  const read = sql.indexOf("select true, duration_ms into v_had_row, v_prev_duration");
  assert.ok(lock > 0 && read > lock, "REGRESSION: the read preceded the lock");
  assert.ok(sql.includes("e.kind = 'usage.voice_seconds'"), "and a second usage row is refused outright");
  assert.ok(sql.includes("when (calls.raw ? 'call_analysis') and not (excluded.raw ? 'call_analysis') then calls.raw"));
});

test("no provider URL reaches a row the browser can read", () => {
  assert.ok(sql.includes("- 'recording_url' - 'recording_multi_channel_url' - 'public_log_url'"));
  assert.ok(sql.includes("recording = recording - 'provider_url'"), "existing rows are scrubbed");
  const repo = readCode("packages/db/src/repositories/calls.ts");
  assert.ok(!repo.includes("provider_url: n.recordingUrl"), "ingest no longer writes it");
  // The copy's own row, stored with no provider URL on it, and a retry that
  // asks the provider for a fresh URL by call id both run in cron-doors-b.test.mjs.
});

test("a conversation row moves only when its timestamps move", () => {
  assert.ok(sql.includes("where conversations.last_message_at is distinct from greatest("));
  assert.ok(sql.includes("if v_conversation_id is null then"), "a skipped upsert still yields the id");
});

test("realtime events are routed by table: a transcript turn repaints Live, not five surfaces", async () => {
  assert.deepEqual([...DEFAULT_REFRESH_TABLES], ["messages", "conversations", "escalations"]);
  const legacy = { refreshOnMessageInserts: true };
  assert.equal(wantsRefresh(legacy, "messages"), true);
  assert.equal(wantsRefresh(legacy, "calls"), false, "the surfaces that never asked do not repaint per turn");
  const live = { refreshOnTables: ["calls"] };
  assert.equal(wantsRefresh(live, "calls"), true);
  assert.equal(wantsRefresh(live, "messages"), false);
  assert.equal(subscribesToRealtime({}), false);
  assert.equal(subscribesToRealtime(live), true);
  const seam = readCode("apps/dashboard/src/legacy-bridge/surfaces/live.ts");
  assert.ok(seam.includes('refreshOnTables: ["calls"]'), "Live listens to calls alone");
  // The live feed hands the runner a turn's notice as the calls table's UPDATE (packages/db realtime.ts); the runner
  // routes it by table (shell/surfaces/surface-boot.test.mjs runs that).
  const [turn] = await changesOf({ event: "UPDATE", payload: { table: "calls", op: "UPDATE", statuses: ["ongoing"] } });
  assert.deepEqual([turn.table, turn.event], ["calls", "UPDATE"], "the table and the event reach the callback");
  assert.deepEqual([wantsRefresh(live, turn.table, turn), wantsRefresh(legacy, turn.table, turn)], [true, false]);
});

test("the trigger wakes the edge for calls that have simply run too long", () => {
  // The sweep's half -- a call still producing turns but forty minutes old is
  // asked about, and the Live page's "being checked" is made true -- runs in
  // cron-doors-b.test.mjs. This is the trigger's.
  assert.ok(sql.includes("or started_at < now() - interval '30 minutes'"), "the trigger wakes the edge for them");
});

test("the storage upload is bounded too", () => {
  // A CDN's 401, 403 or 410 as final, and its 404 as a try to repeat, run in
  // cron-doors-b.test.mjs, where the wire answers each.
  const lib = readCode("apps/edge/lib/voice/call-recording.ts");
  assert.ok(lib.includes('"storage upload"'), "the upload is bounded too");
});

test("Live says only what is true about a silent 'ongoing' row", () => {
  const NOW = new Date("2026-09-04T18:14:00.000Z");
  const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
  const base = {
    id: "p",
    retell_call_id: "r-p",
    direction: "inbound",
    call_type: "phone_call",
    from_e164: "+17865550181",
    from_raw: "+17865550181",
    to_e164: null,
    started_at: ago(3_600_000),
    ended_at: null,
    updated_at: ago(20 * 60_000),
    duration_ms: null,
    disconnection_reason: null,
    sentiment: null,
    call_successful: null,
    in_voicemail: null,
    summary: null,
    transcript_object: null,
    recording: null,
    conversation_id: null,
    contact_id: null,
    message_id: null,
    contact: null,
    status: "ongoing",
  };
  const phantom = toLiveCallVM(base, ZONE, NOW);
  assert.equal(phantom.live, false);
  assert.equal(phantom.stale, true, "neither live nor ended");
  assert.equal(toLiveCallVM({ ...base, status: "ended", duration_ms: 1000 }, ZONE, NOW).stale, false);
  // "No word from the provider" is the one pill's word for a stale call now: run in state-pill.test.mjs.
  const page = readRaw("apps/dashboard/src/legacy/pages/live-monitor.jsx");
  assert.ok(page.includes("checked with the phone provider within five minutes"));
  assert.ok(!page.includes("The transcript arrives when the call ends"), "turns stream now");
  const tabs = readRaw("apps/dashboard/src/legacy/components/surface-tabs.jsx");
  assert.ok(tabs.includes("window.__LIVE.heartbeatMs"), "the tab applies the heartbeat rule too");
  const today = readCode("packages/contracts/src/today/today-rows.ts");
  assert.ok(today.includes('import { ANALYSIS_GRACE_MS } from "../voice/live"'), "one grace constant");
});
