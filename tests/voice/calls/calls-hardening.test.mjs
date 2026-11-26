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
import { ANALYSIS_GRACE_MS, liveStillUp, stateOf, toLiveCallVM, toLiveVM } from "@chanlytics/contracts";
import { claimCallNotification, ingestCall } from "@chanlytics/db/voice";
import { todayCallRows } from "../../../packages/contracts/src/today/rows.ts";
import { fakeDb } from "../../_fake-db.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";
import { changesOf } from "../../_live-feed.mjs";
import { installStubReact, fresh, again, byTestId, find, textOf } from "../../_stub-react.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const here = path.dirname(fileURLToPath(import.meta.url));
const { wantsRefresh, subscribesToRealtime, DEFAULT_REFRESH_TABLES } = await import(
  pathToFileURL(path.join(here, "../../../apps/dashboard/src/bridge/surface-realtime.ts")).href
);

// Live's surface, where it lives since decision 0015 (surfaces/live/surface.ts).
const { liveOverride } = await import("../../../apps/dashboard/src/surfaces/live/surface.ts");

// What 00034 hardened, run rather than read (pinned as its text until 26 Nov 2026):
// - the calls clock asks the edge for a call still ongoing half an hour on, and for one that ended without its thread's
//   line once the grace is up, never before (ops/sweep-registry.db.test.mjs);
// - usage is metered once under concurrency, the call-level lock taken first, and the payload keeps its analysis and only
//   the allowlist, no provider URL (voice/rows/a-call-is-one-row-in-every-order.db.test.mjs);
// - the call's thread is written only when its times move, and a delivery that moves nothing still yields the thread
//   (the same suite).

test("the post-call email and memory note happen once: a claim on the row, counted", async () => {
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const calls = [{ id: "k1", tenant_id: T, retell_call_id: "call_1", status: "ended", notified_at: null }];
  const db = fakeDb({ calls });
  assert.equal(await claimCallNotification(db, T, "k1"), true, "the first delivery claims it");
  assert.ok(calls[0].notified_at, "and the row says when");
  assert.equal(await claimCallNotification(db, T, "k1"), false, "a redelivery finds it claimed");
  assert.equal(
    await claimCallNotification(fakeDb({ calls }), "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "k1"),
    false,
    "nor another workspace",
  );
});

test("no provider URL reaches a row the browser can read: the ingest hands the door a pending copy, never the URL", async () => {
  const asked = [];
  const db = fakeDb(
    {},
    {},
    {
      ingest_call: (a) => (
        asked.push(a),
        { call_id: "k1", is_new: true, recording_state: "pending", contact_id: null, conversation_id: null }
      ),
    },
  );
  const none = Object.fromEntries(
    [
      "agentId",
      "callType",
      "fromE164",
      "fromRaw",
      "toE164",
      "startedAtIso",
      "endedAtIso",
      "durationMs",
      "disconnectionReason",
      "sentiment",
      "callSuccessful",
      "inVoicemail",
      "summary",
      "transcript",
      "transcriptObject",
      "publicLogUrl",
      "cost",
      "latency",
      "analysis",
    ].map((k) => [k, null]),
  );
  await ingestCall(db, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
    ...none,
    retellCallId: "call_1",
    direction: "inbound",
    status: "ended",
    recordingUrl: "https://provider.example/recording.wav?token=SECRET",
  });
  assert.deepEqual(asked[0].p_recording, { fetch_state: "pending" });
  assert.ok(
    !JSON.stringify(asked[0]).includes("provider.example/recording"),
    "the URL is nowhere in what the door is handed",
  );
  // The copy's own row, stored with no provider URL on it, and a retry that asks the provider for a fresh URL by call id,
  // both run in cron/doors-b/.
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
  assert.deepEqual(
    liveOverride.refreshOnTables,
    ["calls"],
    "Live listens to the calls; the line's own row, its number and switch, is the channels read's, which Live follows (R6)",
  );
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

// The trigger wakes the edge for calls that have simply run too long (ops/sweep-registry.db.test.mjs); the sweep's half
// -- a call still producing turns but forty minutes old is asked about, and the Live page's "being checked" is made true
// -- runs in cron/doors-b/. The storage upload is bounded too: a slow bucket ends the copy "storage upload timed out", run
// in cron/doors-b/the-door-and-call-recordings.test.mjs, where the wire answers each CDN refusal as well.

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
  installStubReact({ CHANLY: { nav() {} }, setInterval: () => 1, clearInterval() {} });
  const S = "../../../apps/dashboard/src";
  (await import(`${S}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
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
  assert.match(textOf(talking), /Live transcript/, "turns stream now");
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
  // The tab applies the heartbeat rule too: the Live tab pulses for a call on the line, and not for a phantom the page
  // has dropped (drawn, where surface-tabs.tsx's text was read until 26 Nov 2026).
  const { SurfaceTabs } = await import(`${S}/surfaces/frame/surface-tabs.tsx`);
  bridgeHolds({ parts: { chrome: { stateOf, liveStillUp } } });
  const pulses = (over, readAt = at) => {
    setSurfaceValue("live", toLiveVM([{ ...base, ...over }], [], ZONE, readAt));
    fresh();
    const tree = again(() => SurfaceTabs({ page: "live", param: null, views: null, onNavigate() {} }));
    return find(tree, (n) => Array.isArray(n.props?.tabs)).props.tabs.find((t) => t.id === "live").live;
  };
  assert.equal(pulses({ ...onTheLine, transcript_object: turns }), true, "a call on the line");
  assert.equal(
    pulses({ started_at: before(3_600_000), updated_at: before(20 * 60_000) }),
    false,
    "and not a phantom nobody has heard from",
  );
  // Between refreshes: a call the last read had on the line, unheard from since for longer than the heartbeat.
  const lastRead = new Date(at.getTime() - 30 * 60_000);
  const then = (ms) => new Date(lastRead.getTime() - ms).toISOString();
  assert.equal(
    pulses({ started_at: then(120_000), updated_at: then(2_000), transcript_object: turns }, lastRead),
    false,
    "nor a call the last read had on the line that has gone quiet since",
  );
});

test("one grace for an analysis: Live and Today wait the same ten minutes", () => {
  // Today's call row says a write-up is on its way exactly while Live does (pinned as rows.ts's import until 26 Nov 2026).
  const NOW = new Date("2026-09-04T18:14:00.000Z");
  const endedAgo = (ms) => ({
    id: "k",
    retell_call_id: "r-k",
    direction: "inbound",
    status: "ended",
    started_at: new Date(NOW.getTime() - ms - 60_000).toISOString(),
    ended_at: new Date(NOW.getTime() - ms).toISOString(),
    updated_at: new Date(NOW.getTime() - ms).toISOString(),
    duration_ms: 60_000,
    summary: null,
    from_e164: "+17865550181",
    contact: null,
  });
  const note = (ms) => todayCallRows({ callsInWindow: [endedAgo(ms)], tz: ZONE, now: NOW })[0]?.note;
  assert.equal(
    note(ANALYSIS_GRACE_MS - 1000),
    "Summary on its way",
    "while Live waits for the write-up, so does Today",
  );
  assert.equal(note(ANALYSIS_GRACE_MS + 1000), "No summary", "and a second after Live gives up, Today does too");
});
