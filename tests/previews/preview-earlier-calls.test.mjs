/**
 * A lead's preview after the review of 18 November 2026 (decision 0079's amendment): the calls it ended are read for
 * the page, so a visit after one still shows it (packages/db listEndedRehearsalCalls, the page's read in
 * apps/dashboard/src/server/public/preview-page.ts); and a call in the browser says how loud its voice is to a page
 * that asks, and reads no audio for one that does not (apps/dashboard/src/bridge/rehearse/call.ts). Over a database in
 * memory and a call client of the test's own: nothing is dialled. Made-up businesses only.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

const { listEndedRehearsalCalls } = await importSrc("packages/db/src/repositories/facts/rehearsals.ts");
const { findPreviewPage } = await importSrc("apps/dashboard/src/server/public/preview-page.ts");
const { startCall, setCallClient, voiceLevelOf } = await importSrc("apps/dashboard/src/bridge/rehearse/call.ts");

const OURS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOKEN = "TokenTokenTokenToken01";

/** A spoken rehearsal of the preview's workspace, made `minute` minutes into an hour, ended or still running. */
const call = (id, minute, seconds, over = {}) => ({
  id,
  tenant_id: WS,
  kind: "call",
  seconds,
  ended_at: seconds === null ? null : `2026-11-18T10:${String(minute + 1).padStart(2, "0")}:00Z`,
  created_at: `2026-11-18T10:${String(minute).padStart(2, "0")}:00Z`,
  ...over,
});

test("the calls a preview ended: its newest, oldest first, each by how long it spoke; never one still running, unspoken, only listened to, typed, or another workspace's", async () => {
  const rehearsals = [
    call("r1", 1, 42),
    call("r2", 2, 95, { end_reason: "user_hangup" }),
    call("r3", 3, 0),
    call("r4", 4, 61, { end_reason: null }),
    call("r5", 5, 18),
    call("r6", 6, null),
    // Their greeting heard with no microphone (contracts REHEARSAL_LISTEN): a spoken rehearsal nobody called.
    call("heard", 9, 8, { end_reason: "listened" }),
    call("typed", 7, 30, { kind: "typed" }),
    call("theirs", 8, 77, { tenant_id: OTHER }),
  ];
  const db = fakeDb({ rehearsals });
  assert.deepEqual(await listEndedRehearsalCalls(db, WS, 3), [
    { id: "r2", seconds: 95 },
    { id: "r4", seconds: 61 },
    { id: "r5", seconds: 18 },
  ]);
  assert.deepEqual(await listEndedRehearsalCalls(db, OTHER, 3), [{ id: "theirs", seconds: 77 }]);
  assert.deepEqual(await listEndedRehearsalCalls(fakeDb({ rehearsals: [] }), WS, 3), []);
});

test("the page's read carries them, three at most, and a preview with no workspace carries none", async () => {
  const preview = {
    id: "p1",
    tenant_id: OURS,
    lead_id: "l1",
    preview_tenant_id: WS,
    token: TOKEN,
    state: "ready",
    ends_at: "2026-12-01T00:00:00Z",
    asked_count: 2,
    opened_count: 1,
    call_seconds: 216,
    call_count: 4,
    turns: [],
    not_right: [],
  };
  const tables = {
    lead_previews: [preview],
    tenants: [{ id: WS, name: "Fixture Barbers", slug: "fixture-barbers", logo_path: null, accent: null }],
    rehearsals: [call("r1", 1, 42), call("r2", 2, 95), call("r4", 4, 61), call("r5", 5, 18)],
  };
  const read = await findPreviewPage(TOKEN, fakeDb(tables));
  assert.equal(read.facts.business, "Fixture Barbers");
  assert.deepEqual(read.facts.calls, [
    { id: "r2", seconds: 95 },
    { id: "r4", seconds: 61 },
    { id: "r5", seconds: 18 },
  ]);
  const unbuilt = await findPreviewPage(
    TOKEN,
    fakeDb({ ...tables, lead_previews: [{ ...preview, preview_tenant_id: null, state: "building" }] }),
  );
  assert.deepEqual(unbuilt.facts.calls, []);
});

test("how loud a voice is: nothing for silence, the top for a loud one, between for a speaking one", () => {
  assert.equal(voiceLevelOf(new Float32Array(0)), 0);
  assert.equal(voiceLevelOf(new Float32Array(480)), 0);
  assert.equal(voiceLevelOf(new Float32Array(480).fill(0.9)), 1);
  const speaking = voiceLevelOf(new Float32Array(480).fill(0.1));
  assert.ok(speaking > 0.3 && speaking < 0.5, String(speaking));
  // The sign of a sample is its phase, never its loudness.
  assert.equal(voiceLevelOf(new Float32Array(480).fill(-0.1)), speaking);
});

/** A call client of the test's own: it keeps what a call was made with, and makes none. */
function fakeClient() {
  const made = [];
  class RetellClient {
    createWebCall(options) {
      made.push(options);
      return { mute() {}, unmute() {}, end: async () => {} };
    }
  }
  setCallClient(async () => ({ RetellClient }));
  return made;
}
after(() => setCallClient(null));
const quiet = { onStarted() {}, onStatus() {}, onEnd() {}, onError() {} };
const refused = async () => ({ ok: false, message: "never asked" });

test("a page that draws the voice is told how loud it is; one that does not asks the call for no audio", async () => {
  const made = fakeClient();
  const levels = [];
  await startCall(refused, { ...quiet, onLevel: (level) => levels.push(level) });
  assert.deepEqual(made[0].audio, { emitRawAudioSamples: true });
  made[0].hooks.onAudio(new Float32Array(480).fill(0.9));
  made[0].hooks.onAudio(new Float32Array(480));
  assert.deepEqual(levels, [1, 0]);

  await startCall(refused, quiet);
  assert.equal("audio" in made[1], false, "reading the voice costs the browser work: asked for only where it is drawn");
  assert.equal("onAudio" in made[1].hooks, false);
});
