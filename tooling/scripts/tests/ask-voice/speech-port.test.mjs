/**
 * The ElevenLabs port's speech (packages/channels/src/voice/elevenlabs.ts speakText), run over a captured wire: the
 * POST of the words to the voice's stream with the key and the vendor's normaliser on, the body handed back unread
 * with its content type, and what each of the vendor's answers comes to (its limit and a dropped connection are
 * unreachable; a refusal is rejected with the vendor's words).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const port = await import(at("packages/channels/src/voice/elevenlabs.ts"));
const { resetBreakers } = await import(at("packages/channels/src/provider-fetch.ts"));
beforeEach(() => resetBreakers());

const CFG = { apiKey: "xi-key-for-this-file" };
const INPUT = { voiceId: "voice_0001", modelId: "eleven_turbo_v2", text: "Two at 3:30." };
const URL = "https://api.elevenlabs.io/v1/text-to-speech/voice_0001/stream?output_format=mp3_44100_128";

function wire(answer) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: init?.body ?? null,
    });
    return answer(calls.length);
  };
  return { calls, fetch };
}
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("speak: a POST of the words to the voice's stream, MP3 asked for, the key in the header, the model and the vendor's normaliser in the body; a 2xx's body handed back unread with its content type", async () => {
  const bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]);
  const w = wire(() => new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg" } }));
  const a = await port.speakText(CFG, INPUT, { fetch: w.fetch });
  assert.equal(a.outcome, "ok");
  assert.equal(a.contentType, "audio/mpeg");
  assert.ok(a.body && typeof a.body.getReader === "function", "a stream, unread");
  assert.deepEqual(new Uint8Array(await new Response(a.body).arrayBuffer()), bytes);
  assert.equal(w.calls.length, 1);
  assert.equal(w.calls[0].url, URL);
  assert.equal(w.calls[0].method, "POST");
  assert.equal(w.calls[0].headers["xi-api-key"], "xi-key-for-this-file");
  assert.equal(w.calls[0].headers.accept, "audio/mpeg");
  assert.deepEqual(JSON.parse(w.calls[0].body), {
    text: "Two at 3:30.",
    model_id: "eleven_turbo_v2",
    apply_text_normalization: "on",
  });
});

test("the vendor's no: its limit (429) and a connection that never opened are unreachable; a refusal (400) is rejected with the vendor's words; one try while a person waits", async () => {
  const limited = wire(() => json(429, { detail: { status: "too_many_concurrent_requests", message: "Too many" } }));
  assert.deepEqual(await port.speakText(CFG, INPUT, { fetch: limited.fetch }), {
    outcome: "unreachable",
    status: 429,
    error: "Too many",
  });
  assert.equal(limited.calls.length, 1);
  const refused = wire(() =>
    json(400, { detail: { status: "invalid_model", message: "This model is not available." } }),
  );
  assert.deepEqual(await port.speakText(CFG, INPUT, { fetch: refused.fetch }), {
    outcome: "rejected",
    status: 400,
    error: "This model is not available.",
  });
  const down = wire(() => {
    throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
  });
  const a = await port.speakText(CFG, INPUT, { fetch: down.fetch });
  assert.equal(a.outcome, "unreachable");
  assert.equal(a.status, 0);
});
