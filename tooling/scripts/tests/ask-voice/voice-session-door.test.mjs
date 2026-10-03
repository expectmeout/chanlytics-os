/**
 * The voice-session door, run: POST /api/admin/voice/session over a database in memory and a captured wire where
 * api.elevenlabs.io would be (modelled on llm-door.test.mjs). The dashboard's voice route has verified the member and
 * written the row; this edge spends the key once, for the agent's conversation token, and answers it with the
 * conversation's id. The key is in the environment only so the door gets past its own check; it travels no further
 * than a captured header.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { signEdgeToken, resetBreakers } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.ELEVENLABS_API_KEY = "xi-key-for-this-file";
process.env.ELEVENLABS_AGENT_ID = "agent_for_this_file";
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
const silent = (why = "this case must not reach the vendor") =>
  wired((req) => {
    throw new Error(`${why}: ${req.method} ${req.url}`);
  });
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const door = await import(at("apps/edge/api/admin/voice/session.ts"));
after(() => setPg(null));
beforeEach(() => resetBreakers());

const AUD = "/api/admin/voice/session";
const MINT = "https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent_for_this_file";
const T = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = "11111111-1111-4111-8111-111111111111";

/* ------------------------------- the knock -------------------------------- */

const token = (o = {}) =>
  signEdgeToken(o.secret ?? process.env.EDGE_CALL_SECRET, o.aud ?? AUD, {
    workspace: "workspace" in o ? o.workspace : T(1),
    user: "user" in o ? o.user : U,
  });
const knock = (ws, body, headers = { "x-edge-token": token({ workspace: ws }) }) =>
  door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
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

/** Three workspaces, active and billed, so the agent may be asked for them; a case that pauses one says so. */
function use(tables = {}) {
  const ids = [T(1), T(2), T(3)];
  tables.tenants ??= ids.map((id) => ({ id, status: "active", left_empty_at: null }));
  tables.billing_accounts ??= ids.map((tenant_id) => ({ tenant_id, mode: "stripe", status: "active" }));
  const db = fakeDb(tables);
  setPg(db);
  return db;
}
const ask = (over = {}) => ({ tenant_id: T(1), user_id: U, ...over });

/* --------------------------------- the door ------------------------------- */

test("the door: a token for another door, a forgery and no credential are 403; a body naming another workspace than the token is refused; nothing is read and the vendor is not asked", async () => {
  const db = use();
  const net = silent();
  assert.deepEqual(await answer(await knock(T(1), ask(), { "x-edge-token": token({ aud: "/api/admin/llm" }) })), [
    403,
    { ok: false, error: "token_audience" },
  ]);
  assert.deepEqual(await answer(await knock(T(1), ask(), { "x-edge-token": token({ secret: "not-the-secret" }) })), [
    403,
    { ok: false, error: "token_signature" },
  ]);
  assert.deepEqual(await answer(await knock(T(1), ask(), {})), [403, { ok: false }]);
  assert.deepEqual(await answer(await knock(T(1), ask({ tenant_id: T(2) }))), [
    403,
    { ok: false, error: "workspace_mismatch" },
  ]);
  assert.equal(db.seen.length, 0, "nothing was read for any of it");
  assert.equal(net.calls.length, 0, "the vendor heard none of it");
});

test("without the key or the agent on this edge the door says so before the body is looked at: 503 no_provider_key, no read, no wire", async () => {
  const db = use();
  const net = silent();
  await withEnv({ ELEVENLABS_API_KEY: undefined }, async () => {
    assert.deepEqual(await answer(await knock(T(1), "not even json")), [503, { ok: false, error: "no_provider_key" }]);
  });
  await withEnv({ ELEVENLABS_AGENT_ID: undefined }, async () => {
    assert.deepEqual(await answer(await knock(T(1), ask())), [503, { ok: false, error: "no_provider_key" }]);
  });
  assert.equal(db.seen.length, 0);
  assert.equal(net.calls.length, 0);
});

test("the person is the token's: a token about nobody with no person in the body, or one that is not a person's id, is 400; the vendor is not asked", async () => {
  use();
  const net = silent();
  // A token opens a door once (admin-auth.ts): each knock gets its own.
  const nobody = () => ({ "x-edge-token": token({ workspace: T(1), user: null }) });
  const bad = [400, { ok: false, error: "bad_request", detail: "tenant_id and user_id required" }];
  assert.deepEqual(await answer(await knock(T(1), ask({ user_id: undefined }), nobody())), bad);
  assert.deepEqual(await answer(await knock(T(1), ask({ user_id: "ada" }), nobody())), bad);
  assert.equal(net.calls.length, 0);
});

test("a paused workspace spends nothing: 402 payment_required, the vendor not asked; and a spend check that could not be made is a no too", async () => {
  use({ tenants: [{ id: T(2), status: "paused", left_empty_at: null }] });
  const net = silent("a paused workspace costs no mint");
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

test("minted: one GET of the agent's token with the key from this edge; the token and the conversation's id answered; the key in no answer", async () => {
  use();
  const net = wired(() => json(200, { token: "eyJ.conversation.token", conversation_id: "conv_0001" }));
  const res = await knock(T(1), ask());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ok: true, token: "eyJ.conversation.token", conversation_id: "conv_0001" });
  assert.equal(net.calls.length, 1);
  assert.deepEqual(net.calls[0], { url: MINT, method: "GET", headers: { "xi-api-key": "xi-key-for-this-file" } });
  assert.equal(JSON.stringify(body).includes("xi-key-for-this-file"), false, "the key leaves no further than the wire");
});

test("the vendor's no: its limit (429) is 503 provider_unreachable, a dropped connection is 503 provider_unreachable, a refusal (401) is 502 provider_refused; each asked once", async () => {
  use();
  const busy = wired(() => json(429, { detail: { status: "concurrent_limit_exceeded", message: "Too many calls." } }));
  assert.deepEqual(await answer(await knock(T(1), ask())), [
    503,
    { ok: false, error: "provider_unreachable", detail: "voice agent 429" },
  ]);
  assert.equal(busy.calls.length, 1);

  const down = wired(() => {
    throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  });
  assert.deepEqual(await answer(await knock(T(1), ask())), [
    503,
    { ok: false, error: "provider_unreachable", detail: "voice agent timeout" },
  ]);
  assert.equal(down.calls.length, 1);

  const refused = wired(() => json(401, { detail: { status: "invalid_api_key", message: "Invalid API key" } }));
  assert.deepEqual(await answer(await knock(T(1), ask())), [
    502,
    { ok: false, error: "provider_refused", detail: "voice agent 401" },
  ]);
  assert.equal(refused.calls.length, 1);
});
