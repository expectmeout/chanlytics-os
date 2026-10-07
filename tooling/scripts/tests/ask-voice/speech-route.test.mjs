/**
 * The speech route, run through route(): POST /api/v1/ask/speech (the one-way speech: a brief or an answer read aloud
 * in Ask's voice, docs/superpowers/specs/2026-10-03-ask-spoken-design.md §3.5 as amended 4 Oct 2026), its `run`
 * called with a database in memory and a captured wire where the edge's speech door would be. What is proved: the
 * policy it declares; the edge asked once with a signed, body-bound token for its door and the words folded; a 2xx
 * audio stream forwarded as it arrives with the vendor's content type and a private cache rule; the edge's refusals
 * answered in the gateway's words (402 as payment_required, anything else as 503 upstream_voice, an edge that could
 * not be reached too); and text past the cap refused before the edge hears of it.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyEdgeToken } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
delete process.env.EDGE_URL;
delete process.env.DIAG_KEY;

/* --------------------------------- the wire ------------------------------- */

const wire = { answer: null, calls: [] };
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const req = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      raw: typeof init?.body === "string" ? init.body : null,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
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
const silent = () =>
  wired((req) => {
    throw new Error(`this case must not reach the edge: ${req.method} ${req.url}`);
  });
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const speech = await import(at("apps/dashboard/app/api/v1/ask/speech/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const EDGE = "https://chanlytics-messaging.vercel.app/api/admin/voice/speech";
const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "viewer", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
});
const ctxFor = (t = tables(), params = {}) => ({ supabase: fakeDb(t), userId: USER, email: "ada@example.com", params });
const send = (body) =>
  new Request(`http://localhost/api/v1/x?workspace=${A}`, { method: "POST", body: JSON.stringify(body) });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}

test("the route declares its policy: every member's, counted as speech, spending nothing of its own (the edge checks the workspace's spend)", () => {
  assert.deepEqual(speech.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "viewer",
    rate: "speech",
    spend: false,
  });
});

test("a clip: the edge's speech door asked once with a signed token bound to the body, the words folded to one line; the vendor's stream answered as it arrives, with its content type and a private cache rule", async () => {
  const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);
  const net = wired(() => new Response(mp3, { status: 200, headers: { "content-type": "audio/mpeg" } }));
  const res = await speech.POST.run(send({ text: "Two  people\n need you.", purpose: "brief" }), ctxFor());
  assert.ok(res instanceof Response, "the audio itself, not an envelope");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "audio/mpeg");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), mp3, "the bytes, whole");
  assert.equal(net.calls.length, 1);
  const [call] = net.calls;
  assert.equal(call.url, EDGE);
  assert.deepEqual(
    call.body,
    { tenant_id: A, user_id: USER, text: "Two people need you.", purpose: "brief" },
    "folded, as the person reads it",
  );
  const v = verifyEdgeToken(
    process.env.EDGE_CALL_SECRET,
    call.headers["x-edge-token"],
    "/api/admin/voice/speech",
    Date.now(),
  );
  assert.equal(v.ok, true, "a token for this door");
  assert.equal(v.claims.ws, A);
  assert.equal(v.claims.user, USER);
  assert.ok(v.claims.bh, "bound to the body it was sent with");
});

test("the edge's no, in the gateway's words: a workspace that may not spend is 402 payment_required with the edge's sentence; a door without the key, a refusal with no JSON, and an edge that could not be reached are 503 upstream_voice", async () => {
  wired(() =>
    json(402, {
      ok: false,
      error: "payment_required",
      detail: "Voice is off while this workspace is paused or its plan has ended.",
    }),
  );
  await refused(
    speech.POST.run(send({ text: "Hello.", purpose: "answer" }), ctxFor()),
    "payment_required",
    402,
    "paused",
  );
  wired(() => json(503, { ok: false, error: "no_provider_key" }));
  await refused(
    speech.POST.run(send({ text: "Hello.", purpose: "answer" }), ctxFor()),
    "upstream_voice",
    503,
    "not set up",
  );
  wired(() => new Response("nope", { status: 404 }));
  await refused(
    speech.POST.run(send({ text: "Hello.", purpose: "answer" }), ctxFor()),
    "upstream_voice",
    503,
    "could not be reached",
  );
  wired(() => {
    throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  });
  await refused(
    speech.POST.run(send({ text: "Hello.", purpose: "answer" }), ctxFor()),
    "upstream_voice",
    503,
    "could not be reached",
  );
});

test("the words are bounded before the edge hears of them: past the cap, empty, or of a purpose that is neither a brief nor an answer is 400; the edge is not asked", async () => {
  const net = silent();
  await refused(speech.POST.run(send({ text: "x".repeat(1501), purpose: "brief" }), ctxFor()), "validation", 400);
  await refused(speech.POST.run(send({ text: "", purpose: "brief" }), ctxFor()), "validation", 400);
  await refused(
    speech.POST.run(send({ text: "   ", purpose: "brief" }), ctxFor()),
    "validation",
    400,
    "nothing to say",
  );
  await refused(speech.POST.run(send({ text: "Hello.", purpose: "song" }), ctxFor()), "validation", 400);
  assert.equal(net.calls.length, 0);
});
