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
 * offers it only on a live call, behind the same gate the server enforces.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DECISION_VERBS, DECISION_SUBJECTS } from "@chanlytics/contracts";
import { updateLiveCall } from "@chanlytics/channels";
import { readCode, readRaw } from "../../_source.mjs";

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

test("the page offers it only on a live call, behind the gate the server enforces", () => {
  const page = readRaw("apps/dashboard/src/legacy/pages/live-monitor.jsx");
  assert.ok(page.includes("{c.live && <LrWhisper c={c} />}"));
  assert.ok(page.includes('data-testid="live-whisper"'));
  assert.ok(page.includes('{...window.gate("approve")}'), "the same door: operator or owner");
  assert.ok(
    page.includes("window.__whisperCall(c.callId, t, false)"),
    "no nudge to speak: a whisper is used when it fits",
  );
  const verbs = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  assert.ok(verbs.includes("export async function whisperCall(callId: string, text: string, trigger = false)"));
  assert.ok(verbs.includes("window.__whisperCall = whisperCall;"));
});
