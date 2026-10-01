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
import { toLiveCallVM, toLiveVM } from "@chanlytics/contracts";
import { readCode, readRaw } from "../../_source.mjs";
import { changesOf } from "../../_live-feed.mjs";
import { installLegacyReact, fresh, again, byTestId, textOf } from "../../_legacy-react.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const here = path.dirname(fileURLToPath(import.meta.url));
const { wantsRefresh, subscribesToRealtime, DEFAULT_REFRESH_TABLES } = await import(
  pathToFileURL(path.join(here, "../../../../../apps/dashboard/src/legacy-bridge/surface-realtime.ts")).href
);

// Live's surface, where it lives since decision 0015 (surfaces/live/surface.ts).
const { liveOverride } = await import("../../../../../apps/dashboard/src/surfaces/live/surface.ts");

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
  assert.deepEqual(liveOverride.refreshOnTables, ["calls"], "Live listens to calls alone");
  assert.equal(subscribesToRealtime(liveOverride), true);
  assert.deepEqual(
    [wantsRefresh(liveOverride, "calls"), wantsRefresh(liveOverride, "messages")],
    [true, false],
    "and a call's turn repaints it, while the messages the default surfaces follow do not",
  );
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

test("Live says only what is true about a silent 'ongoing' row", async () => {
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
  // The page (surfaces/live, TSX since decision 0015), drawn on the legacy stub React over each state a call can be in as it
  // is drawn: the words are the ones it says, not the ones its source holds.
  installLegacyReact({ __DEMO_MODE: false, CHANLY: { nav() {} }, setInterval: () => 1, clearInterval() {} });
  const S = "../../../../../apps/dashboard/src";
  await import(`${S}/legacy/components/data-bits.jsx`);
  globalThis.usePPToast = () => [null, () => {}];
  const { LivePage } = await import(`${S}/surfaces/live/live-page.tsx`);
  const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
  const at = new Date();
  const before = (ms) => new Date(at.getTime() - ms).toISOString();
  const draw = (over) => {
    setSurfaceValue("live", toLiveVM([{ ...base, ...over }], [], ZONE, at));
    fresh();
    return again(() => LivePage({}));
  };
  const turns = [
    { role: "agent", content: "Thank you for calling!" },
    { role: "user", content: "Is anyone free on Thursday?" },
  ];
  const onTheLine = { started_at: before(120_000), updated_at: before(2_000) };
  const quiet = draw({ ...onTheLine, updated_at: before(6 * 60_000), transcript_object: turns });
  assert.ok(
    textOf(byTestId(quiet, "live-checking")).includes("checked with the phone provider within five minutes"),
    "a live call nobody has heard from says what is being done about it, and by whom",
  );
  const talking = draw({ ...onTheLine, transcript_object: turns });
  assert.match(textOf(talking), /Transcript · as the phone provider sends it/, "turns stream now");
  assert.ok(textOf(talking).includes("Is anyone free on Thursday?"), "and are drawn as they come");
  const seen = [
    quiet,
    talking,
    draw({ ...onTheLine, transcript_object: null }),
    draw({ started_at: before(3_600_000), updated_at: before(20 * 60_000) }),
    draw({ status: "ended", ended_at: before(30_000), duration_ms: 90_000, updated_at: before(30_000) }),
  ].map(textOf);
  for (const words of seen)
    assert.ok(!words.includes("The transcript arrives when the call ends"), "REGRESSION: turns stream now");
  const tabs = readRaw("apps/dashboard/src/legacy/components/surface-tabs.jsx");
  assert.ok(tabs.includes("window.__LIVE.heartbeatMs"), "the tab applies the heartbeat rule too");
  const today = readCode("packages/contracts/src/today/today-rows.ts");
  assert.ok(today.includes('import { ANALYSIS_GRACE_MS } from "../voice/live"'), "one grace constant");
});
