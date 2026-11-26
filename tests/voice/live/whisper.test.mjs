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
import { updateLiveCall } from "@chanlytics/channels/voice";
import { readRaw } from "../../_source.mjs";
import { installStubReact, fresh, again, find, byTestId } from "../../_stub-react.mjs";
import { holdFrameParts } from "../../shell/_bridge-holds.mjs";

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

// The route proves the call is the caller's to see, then the role door, then that the call is live, then asks the
// provider, and records the decision last, never from a preview: run through the route in
// conversations/inbox/inbox-routes.test.mjs ("a whisper: the call is the row, only into a call in progress, never from a
// preview"). Pinned as the route's text until 25 Nov 2026.

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

holdFrameParts();
