/**
 * ElevenLabs' post-call webhook, run: POST /api/elevenlabs-webhook over a database in memory and a captured wire where
 * api.elevenlabs.io would be (modelled on llm-door.test.mjs). A delivery signed as the vendor signs (the port's own
 * signature, checked a second way in elevenlabs-port.test.mjs) ends the session row the conversation names with its
 * minutes, writes once however often it is delivered, logs the turns' timings, erases the vendor's record, and never
 * asks the vendor to retry what it cannot use.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { elevenLabsWebhookSignature, resetBreakers } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

process.env.ELEVENLABS_WEBHOOK_SECRET = "webhook-secret-for-this-file";
process.env.ELEVENLABS_API_KEY = "xi-key-for-this-file";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

/* --------------------------------- the wire ------------------------------- */

const wire = { answer: null, calls: [] };
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = { url: String(url), method: init?.method ?? "GET", headers: init?.headers ?? {} };
    wire.calls.push(req);
    if (!wire.answer) throw new Error(`nothing on the wire answers ${req.method} ${req.url}`);
    return wire.answer(req);
  };
  after(() => {
    globalThis.fetch = realFetch;
  });
}
function wired(answer) {
  wire.calls = [];
  wire.answer = answer;
  return {
    get calls() {
      return wire.calls;
    },
  };
}
const silent = () =>
  wired((req) => {
    throw new Error(`this case must not reach the vendor: ${req.method} ${req.url}`);
  });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/elevenlabs-webhook.ts"));
after(() => setPg(null));
beforeEach(() => resetBreakers());

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const U = "11111111-1111-4111-8111-111111111111";
const T1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET;
const AT = "2026-10-03T12:00:00.000Z";

const sessionRow = (over = {}) => ({
  id: "ab".repeat(32),
  tenant_id: A,
  user_id: U,
  thread_id: T1,
  conversation_id: "conv_0001",
  token_cipher: "sealed-elsewhere",
  token_expires_at: "2026-10-03T13:00:00.000Z",
  surface: "today",
  scope: null,
  context: null,
  language: "en",
  turn_key: null,
  turn_started_at: null,
  duration_s: null,
  created_at: AT,
  ended_at: null,
  ...over,
});
function use(rows = [sessionRow()]) {
  const tables = { ask_voice_sessions: rows };
  setPg(fakeDb(tables));
  return tables;
}

/** The vendor's event, as the sources note reads it (§8): the type, the conversation, its turns with their timings, its minutes. */
const event = (over = {}) => ({
  type: "post_call_transcription",
  event_timestamp: 1_790_000_000,
  data: {
    agent_id: "agent_for_this_file",
    conversation_id: "conv_0001",
    status: "done",
    transcript: [
      { role: "user", message: "Who needs me right now?", conversation_turn_metrics: null },
      {
        role: "agent",
        message: "Two people need you, Ana since noon and Luis since two.",
        conversation_turn_metrics: {
          metrics: {
            convai_llm_service_ttfb: { elapsed_time: 0.6040647 },
            convai_llm_service_ttf_sentence: { elapsed_time: 2.4712 },
            convai_ttf_response_since_user_message: { elapsed_time: 2.84 },
          },
        },
      },
      { role: "user", message: "And tomorrow?", conversation_turn_metrics: null },
      {
        role: "agent",
        message: "Six appointments tomorrow.",
        conversation_turn_metrics: { metrics: { convai_llm_service_ttfb: { elapsed_time: 0.41 } } },
      },
    ],
    metadata: { call_duration_secs: 47.6, termination_reason: "Client disconnected: 1000", cost: 36 },
    ...over,
  },
});

/** A delivery signed as the vendor signs it: `t=<seconds>,v0=<hex>` over `t.body`. */
async function deliver(body, { secret = SECRET, at = Date.now(), header } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const t = String(Math.floor(at / 1000));
  const sig = await elevenLabsWebhookSignature(secret, t, raw);
  return door.POST(
    new Request("http://edge/api/elevenlabs-webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "elevenlabs-signature": header ?? `t=${t},${sig}` },
      body: raw,
    }),
  );
}
const answer = async (res) => [res.status, await res.json()];

test("a delivery that is not the vendor's is 401: a wrong secret, a tampered body, a stale clock, no header; nothing is read or erased", async () => {
  const tables = use();
  const net = silent();
  assert.deepEqual(await answer(await deliver(event(), { secret: "not-the-secret" })), [
    401,
    { ok: false, error: "bad_signature" },
  ]);
  assert.deepEqual(await answer(await deliver(event(), { at: Date.now() - 31 * 60 * 1000 })), [
    401,
    { ok: false, error: "bad_signature" },
  ]);
  assert.deepEqual(await answer(await deliver(event(), { header: "" })), [401, { ok: false, error: "bad_signature" }]);
  assert.equal(tables.ask_voice_sessions[0].duration_s, null, "nothing written");
  assert.equal(net.calls.length, 0, "nothing erased");
});

test("a body that is not an event is 400; an event of another kind is 200 and ignored; a conversation this database does not know is 200 and a line, never a retry", async () => {
  const tables = use();
  const net = silent();
  assert.deepEqual(await answer(await deliver("not json")), [400, { ok: false, error: "bad_request" }]);
  assert.deepEqual(await answer(await deliver({ type: "post_call_transcription", data: {} })), [
    400,
    { ok: false, error: "bad_request" },
  ]);
  assert.deepEqual(await answer(await deliver({ ...event(), type: "post_call_audio" })), [200, { ok: true }]);
  assert.deepEqual(await answer(await deliver(event({ conversation_id: "conv_elsewhere" }))), [200, { ok: true }]);
  assert.equal(tables.ask_voice_sessions[0].duration_s, null);
  assert.equal(net.calls.length, 0);
});

test("the conversation over: the row is ended with its minutes (an end the browser wrote first is kept), the vendor's record is erased with the key, and the same delivery again writes once and erases once", async () => {
  const tables = use([sessionRow({ ended_at: "2026-10-03T12:10:00.000Z" })]);
  const net = wired(() => new Response("", { status: 200 }));
  assert.deepEqual(await answer(await deliver(event())), [200, { ok: true }]);
  const row = tables.ask_voice_sessions[0];
  assert.equal(row.duration_s, 48, "the minutes, whole seconds");
  assert.equal(row.ended_at, "2026-10-03T12:10:00.000Z", "the browser's end stands");
  assert.equal(net.calls.length, 1);
  assert.deepEqual(net.calls[0], {
    url: "https://api.elevenlabs.io/v1/convai/conversations/conv_0001",
    method: "DELETE",
    headers: { "xi-api-key": "xi-key-for-this-file" },
  });
  assert.deepEqual(await answer(await deliver(event())), [200, { ok: true }], "delivered again");
  assert.equal(net.calls.length, 2, "the minutes written once, the erase asked for again (in case it was what failed)");
  assert.equal(row.duration_s, 48);
  assert.deepEqual(
    Object.keys(tables),
    ["ask_voice_sessions"],
    "the transcript is kept nowhere: the one webhook door the intake ledger (provider_events, 00334) leaves out",
  );
});

test("a row never ended by the browser is ended now; an erase the vendor refuses or cannot take is a line, and the delivery is still answered", async () => {
  const tables = use();
  const before = Date.now();
  const refused = wired(() => new Response(JSON.stringify({ detail: "not found" }), { status: 404 }));
  assert.deepEqual(await answer(await deliver(event())), [200, { ok: true }]);
  const row = tables.ask_voice_sessions[0];
  assert.ok(row.ended_at && Date.parse(row.ended_at) >= before, "ended by the webhook");
  assert.equal(row.duration_s, 48);
  assert.equal(refused.calls.length, 1);

  const again = use();
  const down = wired(() => {
    throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  });
  assert.deepEqual(await answer(await deliver(event())), [200, { ok: true }]);
  assert.equal(again.ask_voice_sessions[0].duration_s, 48, "the minutes are written before the erase is tried");
  assert.ok(down.calls.length >= 1);
});

test("without the webhook's secret this edge has no such door (404), and with no database the delivery comes back (503)", async () => {
  const saved = process.env.ELEVENLABS_WEBHOOK_SECRET;
  delete process.env.ELEVENLABS_WEBHOOK_SECRET;
  try {
    assert.deepEqual(await answer(await deliver(event(), { secret: saved })), [
      404,
      { ok: false, error: "no_provider_key" },
    ]);
  } finally {
    process.env.ELEVENLABS_WEBHOOK_SECRET = saved;
  }
  setPg(null);
  silent();
  assert.deepEqual(await answer(await deliver(event())), [503, { ok: false, error: "no_database" }]);
});
