/**
 * The ElevenLabs port (packages/channels/src/voice/elevenlabs.ts), run over a captured wire: the mint of a
 * conversation token and what each of the vendor's answers comes to, the erase of a conversation, and the post-call
 * webhook's signature, signed here a second way (node:crypto) so the construction is pinned and not just mirrored.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const port = await import(at("packages/channels/src/voice/elevenlabs.ts"));
const { resetBreakers } = await import(at("packages/channels/src/provider-fetch.ts"));

beforeEach(() => resetBreakers());

const CFG = { apiKey: "xi-key-for-this-file", agentId: "agent_0001" };
const MINT = "https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent_0001";

/** A fetch that records what left and answers from the case's script. */
function wire(answer) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", headers: init?.headers ?? {} });
    return answer(calls.length);
  };
  return { calls, fetch };
}
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const neverOpened = () => {
  throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
};

test("mint: a GET of the agent's token with the key; the token and the conversation's id answered", async () => {
  const w = wire(() => json(200, { token: "eyJ.token", conversation_id: "conv_1" }));
  assert.deepEqual(await port.mintConversationToken(CFG, { fetch: w.fetch }), {
    outcome: "ok",
    token: "eyJ.token",
    conversationId: "conv_1",
  });
  assert.deepEqual(w.calls, [{ url: MINT, method: "GET", headers: { "xi-api-key": "xi-key-for-this-file" } }]);
});

test("mint: the vendor's limit (429) and a connection that never opened are unreachable; a 401 is rejected with the vendor's words; an answer without a token is rejected; one try while a person waits", async () => {
  const busy = wire(() => json(429, { detail: { status: "concurrent_limit_exceeded", message: "Too many calls." } }));
  assert.deepEqual(await port.mintConversationToken(CFG, { fetch: busy.fetch }), {
    outcome: "unreachable",
    status: 429,
    error: "Too many calls.",
  });
  assert.equal(busy.calls.length, 1, "the person is waiting: asked once");

  const refused = wire(() => json(401, { detail: { status: "invalid_api_key", message: "Invalid API key" } }));
  assert.deepEqual(await port.mintConversationToken(CFG, { fetch: refused.fetch }), {
    outcome: "rejected",
    status: 401,
    error: "Invalid API key",
  });

  const down = wire(neverOpened);
  const r = await port.mintConversationToken(CFG, { fetch: down.fetch });
  assert.equal(r.outcome, "unreachable");
  assert.equal(r.status, 0);

  const empty = wire(() => json(200, { token: "" }));
  assert.deepEqual(await port.mintConversationToken(CFG, { fetch: empty.fetch }), {
    outcome: "rejected",
    status: 200,
    error: "no token in the answer",
  });
});

test("delete: a DELETE of the conversation with the key; 200 is ok, 404 is rejected, no answer is unreachable", async () => {
  const gone = wire(() => new Response("", { status: 200 }));
  assert.deepEqual(await port.deleteConversation(CFG, "conv_1", { fetch: gone.fetch }), { outcome: "ok", status: 200 });
  assert.deepEqual(gone.calls, [
    {
      url: "https://api.elevenlabs.io/v1/convai/conversations/conv_1",
      method: "DELETE",
      headers: { "xi-api-key": "xi-key-for-this-file" },
    },
  ]);
  const missing = wire(() => json(404, { detail: "not found" }));
  assert.deepEqual(await port.deleteConversation(CFG, "conv_1", { fetch: missing.fetch }), {
    outcome: "rejected",
    status: 404,
  });
  const down = wire(neverOpened);
  assert.deepEqual(await port.deleteConversation(CFG, "conv_1", { fetch: down.fetch }), {
    outcome: "unreachable",
    status: 0,
  });
});

test("the webhook's signature: HMAC-SHA256 over `t.body`, hex, as v0; verified inside the window; a tampered body, a wrong secret, a stale clock, a missing field or header are refused", async () => {
  const secret = "whsec-for-this-file";
  const body = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "conv_1" } });
  const nowMs = Date.parse("2026-10-03T12:00:00Z");
  const t = String(Math.floor(nowMs / 1000) - 5);
  const signed = await port.elevenLabsWebhookSignature(secret, t, body);
  assert.equal(
    signed,
    `v0=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`,
    "the construction, derived a second way",
  );
  const header = `t=${t},${signed}`;
  assert.equal(await port.verifyElevenLabsWebhook(secret, header, body, nowMs), true);
  assert.equal(await port.verifyElevenLabsWebhook(secret, header, body + " ", nowMs), false, "a tampered body");
  assert.equal(await port.verifyElevenLabsWebhook("other", header, body, nowMs), false, "a wrong secret");
  assert.equal(
    await port.verifyElevenLabsWebhook(secret, header, body, nowMs + (port.ELEVENLABS_WEBHOOK_TOLERANCE_S + 60) * 1000),
    false,
    "a delivery older than the window",
  );
  assert.equal(await port.verifyElevenLabsWebhook(secret, `t=${t}`, body, nowMs), false, "no v0");
  assert.equal(await port.verifyElevenLabsWebhook(secret, signed, body, nowMs), false, "no t");
  assert.equal(await port.verifyElevenLabsWebhook(secret, null, body, nowMs), false, "no header");
  assert.equal(await port.verifyElevenLabsWebhook(undefined, header, body, nowMs), false, "no secret");
  assert.equal(port.ELEVENLABS_SIGNATURE_HEADER, "elevenlabs-signature");
});
