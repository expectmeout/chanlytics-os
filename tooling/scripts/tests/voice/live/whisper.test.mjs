/**
 * The whisper: a sentence only the receptionist hears, worked into its next
 * answer — the first real control the Live page grew over a hosted agent's
 * call. The mockup promised Listen, Take Over and End Call; the provider's
 * API offers an end and a hand-over (call-controls.test.mjs) and keeps the
 * audio and the microphone to its own dashboard.
 *
 * These pin: the ledger knows the verb and the subject (and the database
 * agrees); the adapter speaks the provider's exact contract; the edge takes
 * the words without logging them; the route proves visibility, then the
 * role door, then the provider, and records the decision LAST; the page
 * offers it only on a live call, behind the same gate the server enforces
 * (the Live page, apps/dashboard/src/surfaces/live, TSX since decision 0015, drawn on the legacy stub React).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DECISION_VERBS, DECISION_SUBJECTS, toLiveVM } from "@chanlytics/contracts";
import { updateLiveCall } from "@chanlytics/channels";
import { readCode, readRaw } from "../../_source.mjs";
import { installLegacyReact, fresh, again, find, byTestId, textOf } from "../../_legacy-react.mjs";

test("the ledger knows a whisper on a call, and the database agrees", () => {
  assert.ok(DECISION_VERBS.includes("whisper"));
  assert.ok(DECISION_SUBJECTS.includes("call"));
  const sql = readRaw("supabase/migrations/00036_whisper_verb.sql");
  assert.match(sql, /decisions_verb_check[\s\S]*'erase', 'whisper'/);
  assert.match(sql, /decisions_subject_type_check[\s\S]*'contact', 'call'/);
});

test("the adapter speaks update-live-call exactly, and returns the status instead of throwing", async () => {
  const realFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), init };
    return new Response("{}", { status: 404 });
  };
  try {
    const r = await updateLiveCall({ apiKey: "k" }, "call_abc123def456", {
      additionalContext: "Marisa can see them at 4:30.",
      triggerResponse: true,
    });
    assert.deepEqual(r, { ok: false, status: 404 }, "a call that just ended is a status, not an exception in a route");
    assert.equal(captured.url, "https://api.retellai.com/v2/update-live-call/call_abc123def456");
    assert.equal(captured.init.method, "PATCH");
    assert.equal(captured.init.headers.Authorization, "Bearer k");
    assert.deepEqual(JSON.parse(captured.init.body), {
      call_control: { additional_context: "Marisa can see them at 4:30.", trigger_response: true },
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

// The edge door -- the knock, the words to the provider framed, their length
// in the log and never them -- is run in whisper-door.test.mjs.

test("the route proves visibility, then the role door, then the provider — and records the decision last", () => {
  const route = readCode("apps/dashboard/app/api/v1/calls/[id]/whisper/route.ts");
  const rls = route.indexOf("scope: callScope,");
  const door = route.indexOf('role: "operator",');
  const ongoing = route.indexOf('call.status !== "ongoing"');
  const provider = route.indexOf("await whisperLiveCall(");
  const ledger = route.indexOf('recordDecision(ctx, call.tenant_id, "call", call.id, "whisper"');
  for (const [name, at] of [
    ["rls", rls],
    ["door", door],
    ["ongoing", ongoing],
    ["provider", provider],
    ["ledger", ledger],
  ])
    assert.ok(at > 0, `${name} missing`);
  assert.ok(
    rls < door && door < ongoing && ongoing < provider && provider < ledger,
    "REGRESSION: the order is the safety",
  );
  assert.ok(
    route.includes("There is nobody on the line to whisper to") ||
      route.includes("there is nobody on the line to whisper to"),
  );
  const service = readCode("apps/dashboard/src/server/conversations/live-call.ts");
  const fn = service.slice(service.indexOf("export async function whisperLiveCall"));
  assert.ok(fn.includes("!deployment.providersLive"), "a preview must not speak into a real customer's call");
  assert.ok(fn.includes('"/api/admin/whisper"'));
});

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
  transcript_object: [{ role: "agent", content: "Thank you for calling Harbor Moving!" }],
  recording: null,
  conversation_id: "cv1",
  contact_id: "k1",
  message_id: null,
  created_at: iso(90_000),
  updated_at: iso(2_000),
  contact: { display_name: "Rosa Díaz", wa_profile_name: null, phone_e164: "+16465550123" },
  ...over,
});

test("the page offers it only on a live call, behind the gate the server enforces", async () => {
  installLegacyReact({ __DEMO_MODE: false, CHANLY: { nav() {} }, setInterval: () => 1, clearInterval() {} });
  const S = "../../../../../apps/dashboard/src";
  // The role gate the buttons ask (data-bits.jsx), drawn for real; the toast is this harness's own.
  await import(`${S}/legacy/components/data-bits.jsx`);
  globalThis.usePPToast = () => [null, () => {}];
  const { LivePage } = await import(`${S}/surfaces/live/live-page.tsx`);
  const { setSurfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
  const { whisperCall } = await import(`${S}/legacy-bridge/inbox-verbs.ts`);
  // The whisper is the bridge's verb, imported by the page and run for real over the client: this is the wire.
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const path = new URL(url, "https://app.chanlytics.com").pathname;
    sent.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ ok: true, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const mount = () => again(() => LivePage({}));
  const withCalls = (calls) => {
    setSurfaceValue("live", toLiveVM(calls, [], ZONE, new Date(NOW)));
    fresh();
  };
  const sendButton = (tree) =>
    find(byTestId(tree, "live-whisper"), (n) => n.type === "button" && textOf(n).trim() === "Whisper");
  const type = (tree, words) =>
    find(byTestId(tree, "live-whisper"), (n) => n.type === "input").props.onChange({ target: { value: words } });
  try {
    // Only on a live call: an ended one has nobody to whisper to.
    withCalls([call()]);
    assert.ok(byTestId(mount(), "live-whisper"), "a call on the line offers the whisper");
    withCalls([call({ status: "ended", ended_at: iso(1_000), duration_ms: 89_000, summary: "Asked for a person." })]);
    assert.equal(byTestId(mount(), "live-whisper"), null, "a call that ended offers none");

    // Behind the same door the server enforces (operator or owner: the `approve` gate): where the role may not, the
    // control stays, says so, and sends nothing.
    withCalls([call()]);
    globalThis.ST_STORE = { can: (action) => action !== "approve" };
    try {
      let tree = mount();
      type(tree, "offer the 3pm slot");
      tree = mount();
      const gated = sendButton(tree);
      assert.equal(gated.props["aria-disabled"], true, "the whisper asks the approve gate, and this role is refused");
      assert.ok(gated.props["data-gated"] !== undefined);
      await gated.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: {} });
      assert.deepEqual(sent, [], "and pressing it sends nothing");
      globalThis.ST_STORE = { can: () => true };
      tree = mount();
      assert.equal(sendButton(tree).props["aria-disabled"], undefined, "a role that may approve is not gated");
    } finally {
      delete globalThis.ST_STORE;
    }

    // No nudge to speak: a whisper is used when it fits, which may be a later turn.
    fresh();
    let tree = mount();
    type(tree, "offer the 3pm slot");
    await sendButton(mount()).props.onClick();
    assert.deepEqual(
      sent,
      [{ method: "POST", path: "/api/v1/calls/c-live/whisper", body: { text: "offer the 3pm slot", trigger: false } }],
      "no nudge to speak: a whisper is used when it fits",
    );

    // The verb the page takes takes the nudge off unless it is asked for.
    sent.length = 0;
    await whisperCall("c-live", "hello");
    await whisperCall("c-live", "now", true);
    assert.deepEqual(
      sent.map((r) => r.body),
      [
        { text: "hello", trigger: false },
        { text: "now", trigger: true },
      ],
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
