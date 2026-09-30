/**
 * The Live page (apps/dashboard/src/surfaces/live, TSX since decision 0015), rendered without a browser, with a call on
 * the line.
 *
 * Nothing in lint or the build runs a page; a page that throws at render is found by the first owner who opens it. So
 * the page is drawn here the way reports-page.test.mjs draws Reports: the real component tree over the legacy stub React
 * (_legacy-react.mjs), its view model handed over the seam (setSurfaceValue), and the call verbs run for real over a
 * fetch this test holds, so what a click reaches is the request the route would take. What is proved is what a click
 * reaches, and what the transcript says about who spoke.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { toLiveVM, frameWhisper, frameHandOver } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, byTestId, textOf } from "../../_legacy-react.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const NOW = Date.now();
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const CALL = "call_abc123def456";
const LINE = "+13055550199";

const call = (over = {}) => ({
  id: "c-live",
  retell_call_id: CALL,
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
    { role: "injected", content: frameWhisper("offer the 3pm slot") },
    { role: "user", content: "Can I speak to someone?" },
    { role: "injected", content: frameHandOver() },
  ],
  recording: null,
  conversation_id: "cv1",
  contact_id: "k1",
  message_id: null,
  created_at: iso(90_000),
  updated_at: iso(2_000),
  contact: { display_name: "Rosa", wa_profile_name: null, phone_e164: "+16465550123" },
  ...over,
});
const channels = [
  { id: "ch1", kind: "voice", number_e164: "+13055550100", status: "active", created_at: iso(86_400_000), config: {} },
];

/* ---- the page itself, drawn without a browser ---- */
const flashed = [];
const sent = [];
installLegacyReact({ __DEMO_MODE: false, CHANLY: { nav: () => {} }, setInterval: () => 1, clearInterval() {} });
const S = "../../../../../apps/dashboard/src";
// The end is confirmed through the shared Confirm, and a control asks the role gate: the shell's JSX (data-bits.jsx), drawn for real.
await import(`${S}/legacy/components/data-bits.jsx`);
// data-bits also publishes the shell's toast hook; this harness keeps its own flash.
globalThis.usePPToast = () => [null, (m) => flashed.push(m)];
const { LivePage } = await import(`${S}/surfaces/live/live-page.tsx`);
const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);

// The call verbs are the bridge's (inbox-verbs.ts), imported by the page: they run for real, over the client, and this is
// the wire. The client's answer is the route's body under data (client/api.ts). A flat fake hid that the toast read r.line.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const path = new URL(url, "https://app.chanlytics.com").pathname;
  sent.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : null });
  const data = path.endsWith("/hand-over")
    ? { ok: true, decision_id: "d2", line: LINE }
    : { ok: true, decision_id: "d1" };
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});
/** The calls a verb was sent for, by the route's own id (the row's), in order. */
const idsSentTo = (verb) =>
  sent.filter((r) => r.method === "POST" && r.path.endsWith(`/${verb}`)).map((r) => r.path.split("/").at(-2));

const live = (calls) => toLiveVM(calls, channels, ZONE, new Date(NOW));
const withLive = (calls) => {
  setSurfaceValue("live", live(calls));
  fresh();
};
const withFacts = (facts) =>
  setSurfaceValue("settings", facts === undefined ? undefined : { facts: { facts, conflicts: [] } });
withFacts({ handoff_number: { value: LINE } });
const mount = (props = {}) => again(() => LivePage(props));
/** The toast's words: the flash carries a React element, so its strings are gathered the same way. */
const said = (m) => textOf(m.msg);

test("with a call on the line the page offers the two controls, and the hand-over names the line it rings", () => {
  withLive([call()]);
  const tree = mount();
  assert.ok(byTestId(tree, "live-controls"), "REGRESSION: the controls are on the panel for a live call");
  const hand = byTestId(tree, "live-hand-over");
  assert.ok(hand && !hand.props.disabled, "a workspace with a line can pass the call");
  assert.ok(hand.props.title.includes(LINE), "the button says what it rings");
  assert.ok(byTestId(tree, "live-end"), "and the end is offered, unarmed");
  assert.equal(byTestId(tree, "live-end-yes"), null, "nothing ends on one click");
  assert.ok(byTestId(tree, "live-whisper"), "the whisper is still there beside them");
});

test("the transcript says who spoke: the owner's whisper as the owner's, the platform's hand-over as the platform's, and never a frame", () => {
  withLive([call()]);
  const tree = mount();
  const whisper = all(tree, (n) => n.props?.["data-testid"] === "live-whisper-line");
  const platform = all(tree, (n) => n.props?.["data-testid"] === "live-platform-line");
  assert.equal(whisper.length, 1);
  assert.equal(platform.length, 1);
  assert.ok(textOf(whisper[0]).includes("offer the 3pm slot"));
  assert.ok(textOf(platform[0]).includes("Chanlytics told the receptionist"));
  assert.ok(textOf(platform[0]).includes("The business owner is picking up this call themselves."));
  assert.ok(
    !textOf(platform[0]).includes("transfer_to_staff"),
    "the instruction stays between the platform and the agent",
  );
});

test("ending is armed first, and the second click reaches the bridge with the call and tells the owner once", async () => {
  withLive([call()]);
  let tree = mount();
  byTestId(tree, "live-end").props.onClick();
  assert.deepEqual(idsSentTo("end"), [], "nothing ends on the first click");
  tree = mount();
  const yes = byTestId(tree, "live-end-yes");
  assert.ok(yes, "armed: the question with its Yes");
  await yes.props.onClick();
  assert.deepEqual(
    idsSentTo("end"),
    ["c-live"],
    "the row's id, as the route takes it; the provider's call id is the route's to look up",
  );
  assert.equal(sent.filter((r) => r.path.includes(CALL)).length, 0, "the provider's call id never leaves the browser");
  assert.ok(
    flashed.some((m) => said(m).includes("Call ended")),
    "the owner is told",
  );
  tree = mount();
  assert.equal(byTestId(tree, "live-end-yes"), null, "disarmed after the act");
});

test("the hand-over reaches the bridge with the call, and the owner is told which line will ring", async () => {
  withLive([call()]);
  const before = flashed.length;
  const tree = mount();
  await byTestId(tree, "live-hand-over").props.onClick();
  assert.deepEqual(idsSentTo("hand-over"), ["c-live"], "the row's id, as the route takes it");
  const told = flashed.slice(before).map(said);
  assert.equal(told.length, 1);
  assert.ok(told[0].includes("pass the call to") && told[0].includes(LINE), told[0]);
});

test("a workspace with no line is told the fix on the button itself, and the button does nothing", async () => {
  withLive([call()]);
  withFacts({});
  try {
    const tree = mount();
    const hand = byTestId(tree, "live-hand-over");
    assert.equal(hand.props.disabled, true);
    assert.ok(hand.props.title.includes("Settings"), hand.props.title);
  } finally {
    withFacts({ handoff_number: { value: LINE } });
  }
});

test("a call that has ended offers no control, only its summary and the way to the transcript", () => {
  withLive([
    call({
      status: "ended",
      ended_at: iso(1_000),
      duration_ms: 89_000,
      disconnection_reason: "manual_stopped",
      summary: "Asked for a person.",
    }),
  ]);
  const tree = mount();
  assert.equal(byTestId(tree, "live-controls"), null, "nothing to end or pass");
  assert.equal(byTestId(tree, "live-whisper"), null, "nobody to whisper to");
  const summary = byTestId(tree, "live-summary");
  assert.ok(summary, "the ended call's card");
  assert.ok(textOf(summary).includes("Ended from the dashboard"), "the provider's stop, in the owner's words");
});
