/**
 * The speech door, run: POST /api/admin/voice/speech (door E, the one-way speech) over a database in memory and a
 * captured wire where api.elevenlabs.io would be (modelled on voice-session-door.test.mjs). The dashboard's speech
 * route has verified the member and folded the words; this edge spends the key once, for the vendor's stream of the
 * words in Ask's voice, and hands it on as it arrives. The key is in the environment only so the door gets past its
 * own check; it travels no further than a captured header.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken, resetBreakers } from "@chanlytics/channels";
import { ASK_VOICE_ID, ASK_VOICE_MODEL } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.ELEVENLABS_API_KEY = "xi-key-for-this-file";
for (const k of ["DIAG_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

/* --------------------------------- the wire ------------------------------- */

const wire = { answer: null, calls: [] };
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: init?.body ?? null,
    };
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
const silent = (why = "this case must not reach the vendor") =>
  wired((req) => {
    throw new Error(`${why}: ${req.method} ${req.url}`);
  });
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/admin/voice/speech.ts"));

beforeEach(() => resetBreakers());

const AUD = "/api/admin/voice/speech";
const T = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = "11111111-1111-4111-8111-111111111111";

/* ------------------------------- the knock -------------------------------- */

const token = (o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, {
    workspace: "workspace" in o ? o.workspace : T(1),
    user: "user" in o ? o.user : U,
    ...(o.body === undefined ? {} : { body: o.body }),
  });
const knock = (ws, body, headers) => {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: {
        ...(headers ?? { "x-edge-token": token({ workspace: ws, body: raw }) }),
        "content-type": "application/json",
      },
      body: raw,
    }),
  );
};
const answer = async (res) => [res.status, await res.json()];

async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/* -------------------------------- the world ------------------------------- */

/** Two workspaces, active and billed, so the voice may speak for them; a case that pauses one says so. */
function use(tables = {}) {
  const ids = [T(1), T(2)];
  tables.tenants ??= ids.map((id) => ({ id, status: "active", left_empty_at: null }));
  tables.billing_accounts ??= ids.map((tenant_id) => ({ tenant_id, mode: "stripe", status: "active" }));
  const db = fakeDb(tables);
  setPg(db);
  return db;
}
const ask = (over = {}) => ({ tenant_id: T(1), user_id: U, text: "Two people need you.", purpose: "brief", ...over });

/* --------------------------------- the door ------------------------------- */

test("the door: no credential, a token for another door and a token bound to other words are 403; the vendor hears none of it", async () => {
  use();
  const net = silent();
  assert.deepEqual(await answer(await knock(T(1), ask(), {})), [403, { ok: false }]);
  assert.deepEqual(
    await answer(await knock(T(1), ask(), { "x-edge-token": token({ aud: "/api/admin/voice/session" }) })),
    [403, { ok: false, error: "token_audience" }],
  );
  assert.deepEqual(
    await answer(
      await knock(T(1), ask(), { "x-edge-token": token({ body: JSON.stringify(ask({ text: "Other words." })) }) }),
    ),
    [403, { ok: false, error: "token_body" }],
  );
  assert.equal(net.calls.length, 0);
});

test("without the key on this edge the door says so before the body is looked at: 503 no_provider_key", async () => {
  use();
  const net = silent();
  await withEnv({ ELEVENLABS_API_KEY: undefined }, async () => {
    assert.deepEqual(await answer(await knock(T(1), "not even json", {})), [403, { ok: false }], "the knock first");
    assert.deepEqual(await answer(await knock(T(1), ask())), [503, { ok: false, error: "no_provider_key" }]);
  });
  assert.equal(net.calls.length, 0);
});

test("the words are bounded here too: none is 400, past the cap is 413 too_large, a purpose that is neither is read as an answer; the vendor is not asked for a refusal", async () => {
  use();
  const net = silent();
  assert.deepEqual(await answer(await knock(T(1), ask({ text: "   " }))), [
    400,
    { ok: false, error: "bad_request", detail: "text required" },
  ]);
  const [status, body] = await answer(await knock(T(1), ask({ text: "x".repeat(1501) })));
  assert.equal(status, 413);
  assert.equal(body.error, "too_large");
  assert.equal(net.calls.length, 0);
});

test("a paused workspace spends nothing: 402 payment_required in the words the Line knows; the vendor not asked", async () => {
  use({ tenants: [{ id: T(2), status: "paused", left_empty_at: null }] });
  const net = silent("a paused workspace costs no clip");
  assert.deepEqual(await answer(await knock(T(2), ask({ tenant_id: T(2) }))), [
    402,
    {
      ok: false,
      error: "payment_required",
      detail: "Voice is off while this workspace is paused or its plan has ended.",
    },
  ]);
  assert.equal(net.calls.length, 0);
});

test("spoken: one POST of the folded words to Ask's one voice on its one model, with the key from this edge; the vendor's stream answered as it arrives with its content type and no cache; the key in no answer", async () => {
  use();
  const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 9, 8, 7]);
  const net = wired(() => new Response(mp3, { status: 200, headers: { "content-type": "audio/mpeg" } }));
  const res = await knock(T(1), ask({ text: "Two  people\nneed you.", purpose: "brief" }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "audio/mpeg");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), mp3);
  assert.equal(net.calls.length, 1);
  const [call] = net.calls;
  assert.equal(call.method, "POST");
  assert.equal(
    call.url,
    `https://api.elevenlabs.io/v1/text-to-speech/${ASK_VOICE_ID}/stream?output_format=mp3_44100_128`,
  );
  assert.equal(call.headers["xi-api-key"], "xi-key-for-this-file");
  assert.deepEqual(JSON.parse(call.body), {
    text: "Two people need you.",
    model_id: ASK_VOICE_MODEL,
    apply_text_normalization: "on",
  });
});

test("the vendor's no: its limit (429) is 503 provider_unreachable, a dropped connection is 503 provider_unreachable, a refusal (401) is 502 provider_refused; each asked once", async () => {
  use();
  const limited = wired(() => json(429, { detail: { status: "too_many_concurrent_requests", message: "Too many" } }));
  let [status, body] = await answer(await knock(T(1), ask()));
  assert.equal(status, 503);
  assert.equal(body.error, "provider_unreachable");
  assert.equal(limited.calls.length, 1);
  resetBreakers();
  const down = wired(() => {
    throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  });
  [status, body] = await answer(await knock(T(1), ask()));
  assert.equal(status, 503);
  assert.equal(body.error, "provider_unreachable");
  assert.equal(down.calls.length, 1);
  resetBreakers();
  const refused = wired(() => json(401, { detail: { status: "invalid_api_key", message: "Invalid API key" } }));
  [status, body] = await answer(await knock(T(1), ask()));
  assert.equal(status, 502);
  assert.equal(body.error, "provider_refused");
  assert.equal(refused.calls.length, 1);
});

test("the rest of a reading: the words read just before it go to the vendor as what came before (previous_text), folded and bounded as the words are; a reading's first clip, or its only one, says nothing of it", async () => {
  use();
  const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1]);
  const net = wired(() => new Response(mp3, { status: 200, headers: { "content-type": "audio/mpeg" } }));
  const res = await knock(T(1), ask({ text: "Five are booked today.", before: "Two  people\nneed you." }));
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(net.calls[0].body), {
    text: "Five are booked today.",
    model_id: ASK_VOICE_MODEL,
    apply_text_normalization: "on",
    previous_text: "Two people need you.",
  });
  // Blank, or not words at all: a clip like any other.
  for (const before of ["   ", 7, null]) {
    const one = wired(() => new Response(mp3, { status: 200, headers: { "content-type": "audio/mpeg" } }));
    assert.equal((await knock(T(1), ask({ before }))).status, 200);
    assert.equal("previous_text" in JSON.parse(one.calls[0].body), false);
  }
  // Longer than a clip's own words may be: its end, which is what the next clip carries on from.
  const long = wired(() => new Response(mp3, { status: 200, headers: { "content-type": "audio/mpeg" } }));
  await knock(T(1), ask({ before: `${"x".repeat(2000)} the end.` }));
  const sent = JSON.parse(long.calls[0].body).previous_text;
  assert.equal(sent.length, 1500);
  assert.ok(sent.endsWith(" the end."));
});
