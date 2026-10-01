/**
 * The Live page (apps/dashboard/src/surfaces/live, TSX since decision 0015) after the first real call.
 *
 * The owner phoned the line, saw the call appear, and saw nothing else: the
 * waiting state said "nothing has been said yet" while the greeting was
 * playing (the provider sends words after the FIRST exchange, not for the
 * greeting), and the whisper box sat below a spacer that pushed it under the
 * fold. Realtime itself was proved fine on the deployed page (a no-op update
 * repainted it in five seconds), so the fixes are placement, wording, and a
 * re-read every eight seconds while a call is live as insurance against a
 * channel that drops silently.
 *
 * Proved by drawing the page on the legacy stub React (_legacy-react.mjs) over its view model, with the clock's
 * intervals held by this test, and the re-read run through the bridge's own runner over a fetch this test holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toLiveVM } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, classes, textOf } from "../../_legacy-react.mjs";

const ZONE = "America/New_York";
const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

const call = (over = {}) => ({
  id: "c-live",
  retell_call_id: "call_abc123def456",
  direction: "inbound",
  call_type: "phone_call",
  status: "ongoing",
  from_e164: "+16465550123",
  from_raw: null,
  to_e164: "+13055550100",
  started_at: iso(90_000),
  ended_at: null,
  duration_ms: null,
  disconnection_reason: null,
  sentiment: null,
  call_successful: null,
  in_voicemail: null,
  summary: null,
  wanted: null,
  outcome: null,
  follow_up: null,
  caller_name: null,
  transcript_object: [
    { role: "agent", content: "Thank you for calling Harbor Moving!" },
    { role: "user", content: "Hi, is anyone free on Thursday?" },
  ],
  recording: null,
  conversation_id: "cv1",
  contact_id: "k1",
  message_id: null,
  created_at: iso(90_000),
  updated_at: iso(2_000),
  contact: { display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+16465550123" },
  ...over,
});
const channels = [
  { id: "ch1", kind: "voice", number_e164: "+13055550100", status: "active", created_at: iso(86_400_000), config: {} },
];

// The page's clock is a window interval, only while a call is up: held here, so a test fires it and reads whether it is still running.
const intervals = [];
installLegacyReact({
  __DEMO_MODE: false,
  __WORKSPACES: [{ id: "w1", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "w1",
  CHANLY: { nav() {} },
  setInterval: (fn, ms) => {
    intervals.push({ fn, ms, running: true });
    return intervals.length;
  },
  clearInterval: (id) => {
    if (intervals[id - 1]) intervals[id - 1].running = false;
  },
});
const S = "../../../../../apps/dashboard/src";
// What the shell still owns and the page draws by name (the role gate on the whisper): data-bits.jsx.
await import(`${S}/legacy/components/data-bits.jsx`);
globalThis.usePPToast = () => [null, () => {}];
const { LivePage } = await import(`${S}/surfaces/live/live-page.tsx`);
const { setSurfaceValue, surfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { startSurfaces } = await import(`${S}/legacy-bridge/surface-runner.ts`);

const live = (calls) => toLiveVM(calls, channels, ZONE, new Date(NOW));
const withLive = (calls) => {
  setSurfaceValue("live", live(calls));
  fresh();
  intervals.length = 0;
};
const mount = () => again(() => LivePage({}));
const spacers = (tree) => all(tree, (n) => classes(n).includes("lm-spacer"));

test("the waiting state says the greeting is playing and words follow the first exchange", () => {
  withLive([call({ transcript_object: [] })]);
  const tree = mount();
  const waiting = find(tree, (n) => classes(n).includes("lm-waiting"));
  assert.ok(waiting, "a call with no turns yet is drawn as waiting");
  assert.ok(
    textOf(waiting).includes("It opens with the greeting; the phone provider sends the words after the first exchange"),
  );
  assert.ok(
    !textOf(tree).includes("Nothing has been said yet"),
    "REGRESSION: told the owner nothing had been said while the greeting played",
  );
});

test("the whisper box sits directly under the transcript or the waiting state, above the spacer", () => {
  withLive([call({ transcript_object: [] })]);
  const tree = mount();
  const order = all(tree, (n) => n.props?.["data-testid"] === "live-whisper" || classes(n).includes("lm-spacer")).map(
    (n) => (n.props["data-testid"] === "live-whisper" ? "whisper" : "spacer"),
  );
  assert.deepEqual(order, ["whisper", "spacer"], "the spacer comes AFTER the whisper");
  assert.equal(
    spacers(find(tree, (n) => classes(n).includes("lm-waiting"))).length,
    0,
    "no spacer inside the waiting state pushing the box below the fold",
  );
  // One spacer in a panel that needs one, and none where the transcript grows to fill it.
  assert.equal(spacers(tree).length, 1);
  withLive([call()]);
  assert.equal(spacers(mount()).length, 0, "a transcript fills the panel on its own");
  withLive([call({ status: "ended", ended_at: iso(1_000), duration_ms: 89_000, summary: "Asked for a person." })]);
  assert.equal(spacers(mount()).length, 1, "and an ended call keeps its foot at the bottom with the one");
});

test("while a call is live the page re-reads every 8 s beside the realtime channel", async (t) => {
  // The bridge's own runner, over a fetch this test holds: what the page asks to be read again is what the runner reads.
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(url, "https://app.chanlytics.com").pathname;
    asked.push(path);
    const data = path === "/api/v1/calls" ? { calls: [call({ id: "c-read" })] } : { channels };
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const stop = startSurfaces([], () => () => {});
  t.after(() => {
    stop();
    globalThis.fetch = realFetch;
  });
  const until = async (done) => {
    for (let i = 0; i < 400 && !done(); i++) await new Promise((r) => setTimeout(r, 5));
    assert.ok(done(), "timed out waiting for the re-read to land");
  };

  withLive([call()]);
  const held = surfaceValue("live");
  mount();
  const eight = intervals.filter((i) => i.running && i.ms === 8000);
  assert.equal(eight.length, 1, "one re-read timer, every eight seconds");
  assert.deepEqual(asked, [], "nothing is read until it fires");
  eight[0].fn();
  await until(() => surfaceValue("live") !== held);
  assert.ok(asked.includes("/api/v1/calls"), "it reads the calls again");
  assert.deepEqual(
    surfaceValue("live").now.map((c) => c.callId),
    ["c-read"],
    "and what it reads is what the page draws next",
  );

  // Only while a call is up: none on the line, none started; the last one ending stops it.
  withLive([]);
  mount();
  assert.equal(intervals.filter((i) => i.running).length, 0, "nobody on the line: no clock, no re-read");
  withLive([call()]);
  mount();
  const running = intervals.filter((i) => i.running);
  assert.deepEqual(
    running.map((i) => i.ms).sort((a, b) => a - b),
    [1000, 8000],
    "the clock, and the re-read",
  );
  setSurfaceValue("live", live([call({ status: "ended", ended_at: iso(1_000), duration_ms: 89_000 })]));
  mount();
  assert.equal(
    intervals.filter((i) => i.running).length,
    0,
    "the call ended: both timers are cleared with it, not left running",
  );
  assert.ok(byTestId(mount(), "live-real"), "and the page still draws the call that ended");
  // The control the owner reads the wait by names itself where it sits, directly under the transcript.
  withLive([call()]);
  assert.match(textOf(mount()), /Whisper to the receptionist/, "the control says what it is where it is");
});
