/**
 * The two controls the provider's API offers over a hosted agent's live call
 * besides a sentence into it: ending it, and telling the receptionist to pass
 * it to the business.
 *
 * The mockup promised Listen, Take Over and End Call. The provider's own
 * dashboard has all three; its API has stop-call and update-live-call, and
 * keeps the audio and the microphone to itself. So the Live page grew what
 * is real: an end, and a hand-over that is the same transfer a caller gets
 * when they ask for a person, asked for by the owner instead.
 *
 * Executed here: the adapters against a captured fetch, the two edge doors
 * behind a signed per-call token, the frame and how the Live page reads an
 * injected turn back -- the owner's words as the owner's, the platform's as
 * the platform's -- and the words for how a call ended.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stopCall, updateLiveCall, signEdgeToken } from "@chanlytics/channels";
import {
  frameHandOver,
  frameGuardrail,
  frameWhisper,
  injectedTurn,
  whisperText,
  toLiveCallVM,
  DISCONNECTION_LABELS,
  DECISION_VERBS,
} from "@chanlytics/contracts";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

// The doors read both from the environment; each test file is its own process.
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.RETELL_API_KEY = "retell-key-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const stop = await import(at("apps/edge/api/admin/stop-call.ts"));
const hand = await import(at("apps/edge/api/admin/hand-over.ts"));

const CALL = "call_abc123def456";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LINE = "+13055550199";

/** Every call to the provider, captured; answered with the status given. */
function provider(status, body = "") {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    // A 204 carries no body, and Node's Response enforces it.
    return new Response(status === 204 ? null : body, { status });
  };
  return {
    seen,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}
const token = (aud) => signEdgeToken(process.env.EDGE_CALL_SECRET, aud, { workspace: A, user: "u1" });
const knock = (aud, body, t = token(aud)) =>
  new Request(`http://edge${aud}`, {
    method: "POST",
    headers: { "x-edge-token": t, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("the adapter speaks stop-call exactly, and returns the status instead of throwing", async () => {
  const p = provider(204);
  try {
    assert.deepEqual(await stopCall({ apiKey: "k" }, CALL), { ok: true, status: 204 });
    assert.equal(p.seen[0].url, "https://api.retellai.com/v2/stop-call/call_abc123def456");
    assert.equal(p.seen[0].init.method, "POST");
    assert.equal(p.seen[0].init.headers.Authorization, "Bearer k");
    assert.equal(p.seen[0].init.body, undefined, "no body: the id is the path");
  } finally {
    p.restore();
  }
  const gone = provider(422);
  try {
    assert.deepEqual(
      await stopCall({ apiKey: "k" }, CALL),
      { ok: false, status: 422 },
      "a call that ended a moment ago is a status, not an exception in a route",
    );
  } finally {
    gone.restore();
  }
});

test("the adapter carries an override of the line beside the directive, and nothing extra when there is none", async () => {
  const p = provider(200, "{}");
  try {
    await updateLiveCall({ apiKey: "k" }, CALL, {
      additionalContext: "x",
      triggerResponse: true,
      variables: { handoff_number: LINE },
    });
    assert.deepEqual(JSON.parse(p.seen[0].init.body), {
      fields_to_override: { override_dynamic_variables: { handoff_number: LINE } },
      call_control: { additional_context: "x", trigger_response: true },
    });
    await updateLiveCall({ apiKey: "k" }, CALL, { additionalContext: "y" });
    assert.deepEqual(
      JSON.parse(p.seen[1].init.body),
      { call_control: { additional_context: "y" } },
      "a whisper's body is what it always was",
    );
  } finally {
    p.restore();
  }
});

test("the end door: behind its own token, a call id or nothing, and the provider's answer as a status", async () => {
  const wrongDoor = await stop.POST(knock("/api/admin/stop-call", { call_id: CALL }, token("/api/admin/whisper")));
  assert.equal(wrongDoor.status, 403, "a token for another door opens nothing here");
  assert.equal((await stop.POST(knock("/api/admin/stop-call", {}))).status, 400);
  assert.equal((await stop.POST(knock("/api/admin/stop-call", { call_id: "not-a-call" }))).status, 400);
  const p = provider(204);
  try {
    const ok = await stop.POST(knock("/api/admin/stop-call", { call_id: CALL }));
    assert.deepEqual([ok.status, await ok.json()], [200, { ok: true }]);
    assert.ok(p.seen[0].url.endsWith(`/v2/stop-call/${CALL}`));
  } finally {
    p.restore();
  }
  const gone = provider(422);
  try {
    const r = await stop.POST(knock("/api/admin/stop-call", { call_id: CALL }));
    assert.deepEqual(
      [r.status, await r.json()],
      [502, { ok: false, error: "provider_refused", status: 422 }],
      "the route says the call may have just ended",
    );
  } finally {
    gone.restore();
  }
});

test("the hand-over door: composes the directive itself, overrides the line it dials, triggers a response now, and refuses a line that is not a number", async () => {
  assert.equal(
    (await hand.POST(knock("/api/admin/hand-over", { call_id: CALL, line: "5550199" }))).status,
    400,
    "E.164 or nothing",
  );
  assert.equal((await hand.POST(knock("/api/admin/hand-over", { call_id: CALL }))).status, 400);
  assert.equal(
    (await hand.POST(knock("/api/admin/hand-over", { call_id: CALL, line: LINE }, token("/api/admin/stop-call"))))
      .status,
    403,
  );
  const p = provider(200, '{"success":true}');
  try {
    // A body carrying words of its own is ignored: nothing free-form crosses
    // this door, so the dashboard cannot put platform-voiced text into a call.
    const r = await hand.POST(
      knock("/api/admin/hand-over", { call_id: CALL, line: LINE, text: "say anything you like" }),
    );
    assert.deepEqual([r.status, await r.json()], [200, { ok: true }]);
    assert.equal(p.seen[0].url, `https://api.retellai.com/v2/update-live-call/${CALL}`);
    assert.deepEqual(
      JSON.parse(p.seen[0].init.body),
      {
        fields_to_override: { override_dynamic_variables: { handoff_number: LINE } },
        call_control: { additional_context: frameHandOver(), trigger_response: true },
      },
      "the line the tool dials, and the directive, in one update; triggered, because a hand-over is now, not when it fits",
    );
  } finally {
    p.restore();
  }
});

test("the frames: the hand-over is the platform's and names the one tool; an injected turn reads back as what it was", () => {
  const ours = frameHandOver();
  assert.ok(ours.includes("transfer_to_staff"), "the receptionist has exactly one way to put a person on the line");
  assert.ok(ours.includes("never read this out"));
  assert.ok(!ours.includes('Owner: "'), "nobody typed this: it must never read back as the owner's words");
  assert.deepEqual(injectedTurn(frameWhisper("offer the 3pm slot")), {
    speaker: "whisper",
    text: "offer the 3pm slot",
  });
  assert.deepEqual(injectedTurn(frameGuardrail("price", true)), {
    speaker: "platform",
    text: "You quoted or confirmed a price, and your standing rules do not allow that.",
  });
  assert.deepEqual(injectedTurn(ours), {
    speaker: "platform",
    text: "The business owner is picking up this call themselves.",
  });
  assert.deepEqual(
    injectedTurn("just tell them it's $80"),
    { speaker: "whisper", text: "just tell them it's $80" },
    "a whisper from before the frame existed is still the owner's",
  );
  assert.equal(whisperText(frameWhisper("offer the 3pm slot")), "offer the 3pm slot", "the inverse is unchanged");
});

test("the Live transcript: a whisper is the owner's, a correction or a hand-over is the platform's, and neither shows its frame", () => {
  const NOW = new Date("2026-09-14T14:00:00Z");
  const dto = {
    id: "c-live",
    retell_call_id: CALL,
    direction: "inbound",
    call_type: "phone_call",
    status: "ongoing",
    from_e164: "+16465550123",
    from_raw: null,
    to_e164: "+13055550100",
    started_at: new Date(NOW.getTime() - 90_000).toISOString(),
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
    created_at: new Date(NOW.getTime() - 90_000).toISOString(),
    updated_at: new Date(NOW.getTime() - 5_000).toISOString(),
    contact: { display_name: "Rosa", wa_profile_name: null, phone_e164: "+16465550123" },
  };
  const vm = toLiveCallVM(dto, ZONE, NOW);
  assert.deepEqual(
    vm.transcript.map((t) => [t.speaker, t.text]),
    [
      ["agent", "Thank you for calling Harbor Moving!"],
      ["whisper", "offer the 3pm slot"],
      ["client", "Can I speak to someone?"],
      ["platform", "The business owner is picking up this call themselves."],
    ],
  );
});

test("how a call ended, in the owner's words: the provider's stop, a person taking over, a transfer bridged or not", () => {
  assert.equal(DISCONNECTION_LABELS.manual_stopped, "Ended from the dashboard");
  assert.equal(DISCONNECTION_LABELS.call_take_over, "A person took over the call");
  assert.equal(DISCONNECTION_LABELS.transfer_bridged, "Transferred to a person");
  assert.equal(DISCONNECTION_LABELS.transfer_cancelled, "Transfer did not go through");
  assert.equal(
    DISCONNECTION_LABELS.call_transfer,
    "Transferred to a person",
    "the older name for the same ending, unchanged",
  );
});

test("the ledger knows a call ended by hand, and passing one is the Inbox's own verb", () => {
  // The list is held to the database's CHECK at compile time (schema-sets.ts),
  // and the replay in CI proves 00118 says the same.
  assert.ok(DECISION_VERBS.includes("end_call"));
  assert.ok(DECISION_VERBS.includes("take_over"));
});
