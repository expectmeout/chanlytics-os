/**
 * The wires a business's videos go by (decision 0099, stage B): Cloudflare Stream's (a tus reservation with everything the browser
 * knows, a video read, its audio download, a delete, its tokens signed here, its webhook's signature), Gemini's ear and Scribe's
 * words, each over a fetch that answers from memory; and the edge's webhook door, over a database in memory. What goes out is
 * read back as the vendor would read it.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, verify as verifyWith } from "node:crypto";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

const stream = await import(at("packages/channels/src/files/stream.ts"));
const { askGemini, GEMINI_INLINE_BYTES } = await import(at("packages/channels/src/ai/gemini.ts"));
const { transcribeWithScribe } = await import(at("packages/channels/src/voice/scribe.ts"));
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { receiveStreamWebhook } = await import(at("apps/edge/lib/files/video-webhook.ts"));

after(() => setPg(null));
beforeEach(() => resetBreakers());

const ACCOUNT = { accountId: "acct-1", token: "stream-token-for-this-file" };
const UID = "0123456789abcdef0123456789abcdef";
const answers = (...replies) => {
  const calls = [];
  return {
    calls,
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      const r = replies.shift();
      if (!r) throw new Error(`nothing answers ${url}`);
      return typeof r === "function" ? r(String(url), init) : r;
    },
  };
};
const ok = (body, init = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

/* ------------------------------------------------------------------------------------------------------ Stream -- */

test("a reservation sends everything the browser knows in tus's own metadata, and reads the address and the video's id", async () => {
  const web = answers(
    new Response(null, {
      status: 201,
      headers: { location: "https://upload.videodelivery.net/tus/abc?tusv2=true", "stream-media-id": UID },
    }),
  );
  const expiresAt = new Date("2026-11-07T16:00:00.000Z");
  const got = await stream.reserveStreamUpload(
    ACCOUNT,
    { bytes: 1234567, maxDurationSeconds: 26.4, expiresAt, name: "file-id-1" },
    { fetch: web.fetch },
  );
  assert.deepEqual(got, { ok: true, uploadUrl: "https://upload.videodelivery.net/tus/abc?tusv2=true", mediaRef: UID });
  const { url, init } = web.calls[0];
  assert.equal(url, "https://api.cloudflare.com/client/v4/accounts/acct-1/stream?direct_user=true");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.authorization, "Bearer stream-token-for-this-file");
  assert.equal(init.headers["tus-resumable"], "1.0.0");
  assert.equal(init.headers["upload-length"], "1234567");
  const meta = Object.fromEntries(
    init.headers["upload-metadata"].split(",").map((pair) => {
      const [k, v] = pair.split(" ");
      return [k, v === undefined ? true : Buffer.from(v, "base64").toString("utf8")];
    }),
  );
  assert.deepEqual(meta, {
    maxDurationSeconds: "27",
    expiry: "2026-11-07T16:00:00Z",
    name: "file-id-1",
    requiresignedurls: true,
  });
});

test("a reservation Stream refuses for want of room says the account is full; one it never answered may be asked again", async () => {
  const full = await stream.reserveStreamUpload(
    ACCOUNT,
    { bytes: 1, maxDurationSeconds: 10, expiresAt: new Date(), name: "x" },
    {
      fetch: answers(
        new Response(JSON.stringify({ errors: [{ code: 10011, message: "Storage capacity exceeded" }] }), {
          status: 403,
        }),
      ).fetch,
    },
  );
  assert.equal(full.ok, false);
  assert.equal(full.full, true);
  const nothing = await stream.reserveStreamUpload(
    ACCOUNT,
    { bytes: 1, maxDurationSeconds: 10, expiresAt: new Date(), name: "x" },
    { fetch: answers(new Response("", { status: 502 })).fetch },
  );
  assert.equal(nothing.ok, false);
  assert.equal(nothing.full, false);
  assert.equal(nothing.retryable, true);
});

test("a video as Stream describes it: ready, its length and size; -1 is unknown; an error keeps its code", () => {
  assert.deepEqual(
    stream.streamVideoOf({
      uid: UID,
      readyToStream: true,
      status: { state: "ready", errorReasonCode: "" },
      duration: 24.5,
      input: { width: 1080, height: 1920 },
    }),
    { uid: UID, state: "ready", ready: true, seconds: 24.5, width: 1080, height: 1920, errorCode: null },
  );
  const waiting = stream.streamVideoOf({
    uid: UID,
    status: { state: "inprogress" },
    duration: -1,
    input: { width: -1 },
  });
  assert.equal(waiting.seconds, null);
  assert.equal(waiting.ready, false);
  assert.equal(
    stream.streamVideoOf({ uid: UID, status: { state: "error", errorReasonCode: "ERR_MALFORMED_VIDEO" } }).errorCode,
    "ERR_MALFORMED_VIDEO",
  );
  assert.equal(stream.streamVideoOf({ uid: UID, status: { state: "something new" } }).state, "unknown");
  assert.equal(stream.streamVideoOf({ nope: 1 }), null);
});

test("a read of a video Stream no longer has is gone; a delete of one is done", async () => {
  const read = await stream.readStreamVideo(ACCOUNT, UID, {
    fetch: answers(new Response("{}", { status: 404 })).fetch,
  });
  assert.deepEqual(read, { ok: false, gone: true, error: "not at Stream" });
  assert.equal(
    await stream.deleteStreamVideo(ACCOUNT, UID, { fetch: answers(new Response("{}", { status: 404 })).fetch }),
    true,
  );
  const web = answers(ok({ success: true }));
  assert.equal(await stream.deleteStreamVideo(ACCOUNT, UID, { fetch: web.fetch }), true);
  assert.equal(web.calls[0].init.method, "DELETE");
  assert.equal(web.calls[0].url, `https://api.cloudflare.com/client/v4/accounts/acct-1/stream/${UID}`);
});

test("the audio download: asked for, being made, ready; one Stream makes no sound for is none", async () => {
  const state = (s) => ok({ result: { audio: { status: s, url: "x" } } });
  assert.deepEqual(await stream.askStreamAudio(ACCOUNT, UID, { fetch: answers(state("inprogress")).fetch }), {
    status: "inprogress",
  });
  assert.deepEqual(await stream.readStreamAudio(ACCOUNT, UID, { fetch: answers(state("ready")).fetch }), {
    status: "ready",
  });
  assert.deepEqual(await stream.readStreamAudio(ACCOUNT, UID, { fetch: answers(state("error")).fetch }), {
    status: "none",
  });
  const web = answers(state("inprogress"));
  await stream.askStreamAudio(ACCOUNT, UID, { fetch: web.fetch });
  assert.equal(web.calls[0].url, `https://api.cloudflare.com/client/v4/accounts/acct-1/stream/${UID}/downloads/audio`);
  assert.equal(web.calls[0].init.method, "POST");
});

test("the caption track is put in its language, as WebVTT", async () => {
  const web = answers(ok({ result: { language: "es" } }));
  assert.equal(
    await stream.putStreamCaptions(ACCOUNT, UID, { language: "es", vtt: "WEBVTT\n\n" }, { fetch: web.fetch }),
    true,
  );
  assert.equal(web.calls[0].url, `https://api.cloudflare.com/client/v4/accounts/acct-1/stream/${UID}/captions/es`);
  assert.equal(web.calls[0].init.method, "PUT");
  const file = web.calls[0].init.body.get("file");
  assert.equal(file.type, "text/vtt");
});

test("a token is signed here, RS256 under the key's id, for one video, minutes to a day; downloadable only where asked", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = Buffer.from(JSON.stringify(privateKey.export({ format: "jwk" }))).toString("base64");
  const nowMs = Date.parse("2026-11-07T12:00:00Z");
  const token = stream.streamTokenOf({ keyId: "key-1", jwk }, { uid: UID, seconds: 3600, nowMs });
  const [head, body, sig] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(head, "base64url").toString()), { alg: "RS256", kid: "key-1" });
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  assert.equal(claims.sub, UID);
  assert.equal(claims.kid, "key-1");
  assert.equal(claims.exp, nowMs / 1000 + 3600);
  assert.equal(claims.downloadable, undefined);
  assert.ok(verifyWith("sha256", Buffer.from(`${head}.${body}`), publicKey, Buffer.from(sig, "base64url")));
  const long = stream.streamTokenOf(
    { keyId: "key-1", jwk },
    { uid: UID, seconds: 10 * 86_400, nowMs, downloadable: true },
  );
  const longClaims = JSON.parse(Buffer.from(long.split(".")[1], "base64url").toString());
  assert.equal(longClaims.exp, nowMs / 1000 + 86_400, "never past a day");
  assert.equal(longClaims.downloadable, true);
});

test("a frame's address, the audio's and the player's, each under a token on the account's own host", () => {
  assert.equal(
    stream.streamFrameUrl("abc", "tok", { at: 12.5, width: 368, height: 208 }),
    "https://customer-abc.cloudflarestream.com/tok/thumbnails/thumbnail.jpg?time=12.5s&width=368&height=208&fit=clip",
  );
  assert.equal(
    stream.streamAudioUrl("abc", "tok"),
    "https://customer-abc.cloudflarestream.com/tok/downloads/audio.m4a",
  );
  // Stream refuses an odd side and one outside 10 to 2,000 pixels (a 400 for every frame of the first real clips, 10 Nov 2026).
  const sizeIn = (url) => {
    const q = new URL(url).searchParams;
    return [Number(q.get("width")), Number(q.get("height"))];
  };
  assert.deepEqual(sizeIn(stream.streamFrameUrl("abc", "tok", { at: 1, width: 368, height: 207 })), [368, 208], "even");
  assert.deepEqual(sizeIn(stream.streamFrameUrl("abc", "tok", { at: 1, width: 2576, height: 1449 })), [2000, 1126]);
  assert.deepEqual(sizeIn(stream.streamFrameUrl("abc", "tok", { at: 1, width: 1449, height: 2576 })), [1126, 2000]);
  assert.deepEqual(
    sizeIn(stream.streamFrameUrl("abc", "tok", { at: 1, width: 4, height: 3 })),
    [10, 10],
    "at least ten",
  );
  for (const [w, h] of [
    [368, 207],
    [2576, 1449],
    [1464, 598],
    [3840, 2160],
    [1080, 1920],
    [1284, 2282],
    [11, 2001],
  ]) {
    const [sw, sh] = sizeIn(stream.streamFrameUrl("abc", "tok", { at: 1, width: w, height: h }));
    for (const side of [sw, sh]) assert.ok(side % 2 === 0 && side >= 10 && side <= 2000, `${w}x${h} -> ${sw}x${sh}`);
  }
  const player = new URL(
    stream.streamPlayerUrl("abc", "tok", { poster: "https://storage.example/p.jpg?x=1", captions: "es" }),
  );
  assert.equal(player.pathname, "/tok/iframe");
  assert.equal(player.searchParams.get("poster"), "https://storage.example/p.jpg?x=1");
  assert.equal(player.searchParams.get("defaultTextTrack"), "es");
  assert.equal(player.searchParams.get("preload"), "metadata");
});

const signed = (secret, body, time) =>
  `time=${time},sig1=${createHmac("sha256", secret).update(`${time}.${body}`).digest("hex")}`;

test("the webhook is Stream's by its HMAC over the time and the body, inside five minutes", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  const t = Math.floor(now / 1000);
  const body = JSON.stringify({ uid: UID });
  assert.equal(stream.verifyStreamWebhook("s3cret", signed("s3cret", body, t), body, now), true);
  assert.equal(stream.verifyStreamWebhook("s3cret", signed("other", body, t), body, now), false, "another secret");
  assert.equal(stream.verifyStreamWebhook("s3cret", signed("s3cret", body, t - 301), body, now), false, "a stale time");
  assert.equal(stream.verifyStreamWebhook("s3cret", signed("s3cret", body, t), `${body} `, now), false, "another body");
  assert.equal(stream.verifyStreamWebhook("s3cret", "sig1=abc", body, now), false, "no time");
  assert.equal(stream.verifyStreamWebhook("", signed("", body, t), body, now), false, "no secret, no door");
  assert.equal(stream.verifyStreamWebhook("s3cret", null, body, now), false);
});

/* ------------------------------------------------------------------------------------------------- the ears -- */

const SOUND = new Uint8Array([1, 2, 3, 4]);

test("Gemini is sent the sound inline with its question and the answer's shape, and read back with what it cost", async () => {
  const web = answers(
    ok({
      candidates: [
        {
          content: { parts: [{ text: '{"feel":"A warm welcome.",' }, { text: '"speech":true}' }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 120, thoughtsTokenCount: 30 },
    }),
  );
  const got = await askGemini(
    "gemini-key-for-this-file",
    {
      model: "gemini-3.5-flash-lite",
      system: "You listen.",
      prompt: "How does it sound?",
      audio: { bytes: SOUND, mime: "audio/mp4" },
      schema: { type: "object" },
      maxOutputTokens: 2000,
      timeoutMs: 10_000,
    },
    { fetch: web.fetch },
  );
  assert.deepEqual(got, {
    ok: true,
    text: '{"feel":"A warm welcome.","speech":true}',
    json: { feel: "A warm welcome.", speech: true },
    input: 800,
    output: 150,
  });
  const { url, init } = web.calls[0];
  assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
  assert.equal(init.headers["x-goog-api-key"], "gemini-key-for-this-file");
  const body = JSON.parse(init.body);
  assert.deepEqual(body.systemInstruction, { parts: [{ text: "You listen." }] });
  assert.deepEqual(body.contents[0].parts[0], {
    inlineData: { mimeType: "audio/mp4", data: Buffer.from(SOUND).toString("base64") },
  });
  assert.equal(body.contents[0].parts[1].text, "How does it sound?");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.responseJsonSchema, { type: "object" });
});

test("Gemini's refusals are said as one: a block, an empty answer, an answer cut short; a sound too long is never sent", async () => {
  const ask = (reply) =>
    askGemini(
      "k",
      {
        model: "gemini-3.5-flash-lite",
        system: "s",
        prompt: "p",
        audio: { bytes: SOUND, mime: "audio/mp4" },
        schema: {},
        maxOutputTokens: 10,
        timeoutMs: 1000,
      },
      { fetch: answers(reply).fetch },
    );
  const blocked = await ask(ok({ promptFeedback: { blockReason: "SAFETY" } }));
  assert.deepEqual([blocked.ok, blocked.error, blocked.retryable], [false, "blocked: SAFETY", false]);
  const empty = await ask(ok({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }));
  assert.deepEqual([empty.ok, empty.error], [false, "empty: MAX_TOKENS"]);
  const cut = await ask(
    ok({ candidates: [{ content: { parts: [{ text: '{"feel": "a' }] }, finishReason: "MAX_TOKENS" }] }),
  );
  assert.deepEqual([cut.ok, cut.retryable], [false, true]);
  const refused = await ask(new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }));
  assert.deepEqual([refused.ok, refused.retryable], [false, false]);
  assert.match(refused.error, /API key not valid/);
  const web = answers();
  const tooLong = await askGemini(
    "k",
    {
      model: "m",
      system: "s",
      prompt: "p",
      audio: { bytes: new Uint8Array(GEMINI_INLINE_BYTES + 1), mime: "audio/mp4" },
      schema: null,
      maxOutputTokens: 1,
      timeoutMs: 1,
    },
    { fetch: web.fetch },
  );
  assert.equal(tooLong.ok, false);
  assert.equal(web.calls.length, 0);
});

test("Scribe is sent the sound whole, asked for speakers, its sounds and each word's time", async () => {
  const web = answers(ok({ language_code: "eng", words: [] }));
  const got = await transcribeWithScribe(
    "eleven-key",
    { model: "scribe_v2", audio: { bytes: SOUND, mime: "audio/mp4", name: "f.m4a" }, timeoutMs: 10_000 },
    { fetch: web.fetch },
  );
  assert.deepEqual(got, { ok: true, answer: { language_code: "eng", words: [] } });
  const { url, init } = web.calls[0];
  assert.equal(url, "https://api.elevenlabs.io/v1/speech-to-text");
  assert.equal(init.headers["xi-api-key"], "eleven-key");
  const form = init.body;
  assert.equal(form.get("model_id"), "scribe_v2");
  assert.equal(form.get("diarize"), "true");
  assert.equal(form.get("tag_audio_events"), "true");
  assert.equal(form.get("timestamps_granularity"), "word");
  assert.equal(form.get("file").name, "f.m4a");
});

/* ---------------------------------------------------------------------------------------------- the webhook -- */

const SECRET = "stream-webhook-secret-for-this-file";
const T = "aaaaaaaa-0000-4000-8000-000000000001";
const F = "ffffffff-0000-4000-8000-000000000001";

function webhookWorld() {
  const asked = [];
  const db = fakeDb(
    { files: [], jobs: [] },
    {},
    {
      file_media_ready: (a) => {
        asked.push(["ready", a]);
        return a.p_media_ref === UID ? { fate: "ready", tenant_id: T, file_id: F } : { fate: "unknown" };
      },
      file_media_failed: (a) => {
        asked.push(["failed", a]);
        return { fate: "failed", tenant_id: T, file_id: F };
      },
    },
  );
  setPg(db);
  return asked;
}

const delivery = (event, { secret = SECRET, time = Math.floor(Date.now() / 1000) } = {}) => {
  const body = JSON.stringify(event);
  return new Request("https://edge.example/api/stream-webhook", {
    method: "POST",
    headers: { "webhook-signature": signed(secret, body, time) },
    body,
  });
};

test("the webhook door: no secret here is no door; a delivery not Stream's is refused before any row is touched", async () => {
  delete process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
  const asked = webhookWorld();
  assert.equal((await receiveStreamWebhook(delivery({ uid: UID }))).status, 404);
  process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET = SECRET;
  assert.equal((await receiveStreamWebhook(delivery({ uid: UID }, { secret: "forged" }))).status, 401);
  assert.equal((await receiveStreamWebhook(delivery({ uid: UID }, { time: 1 }))).status, 401, "a replay of an old one");
  assert.deepEqual(asked, []);
});

test("the webhook door: ready finishes the row by Stream's id with its length and size; an error marks it failed; a step between is heard and left", async () => {
  process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET = SECRET;
  const asked = webhookWorld();
  const ready = await receiveStreamWebhook(
    delivery({
      uid: UID,
      readyToStream: true,
      status: { state: "ready" },
      duration: 3.04,
      input: { width: 640, height: 360 },
    }),
  );
  assert.equal(ready.status, 200);
  assert.deepEqual(asked.at(-1), ["ready", { p_media_ref: UID, p_seconds: 3.04, p_width: 640, p_height: 360 }]);
  const failed = await receiveStreamWebhook(
    delivery({ uid: UID, readyToStream: false, status: { state: "error", errorReasonCode: "ERR_NON_VIDEO" } }),
  );
  assert.equal(failed.status, 200);
  assert.deepEqual(asked.at(-1), ["failed", { p_media_ref: UID, p_error: "ERR_NON_VIDEO" }]);
  const between = await receiveStreamWebhook(delivery({ uid: UID, status: { state: "inprogress" } }));
  assert.equal(between.status, 200);
  assert.equal(asked.length, 2, "nothing written for a step between");
  const stranger = await receiveStreamWebhook(
    delivery({ uid: "ffffffffffffffffffffffffffffffff", readyToStream: true, status: { state: "ready" } }),
  );
  assert.equal(stranger.status, 200, "a video this database does not know is no retry storm");
  assert.equal((await receiveStreamWebhook(delivery({ nope: true }))).status, 400);
});
