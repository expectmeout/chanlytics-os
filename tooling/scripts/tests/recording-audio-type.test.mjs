/**
 * A stored recording is typed as audio.
 *
 * Retell's CDN serves a call's WAV as `binary/octet-stream`. The copy took the
 * CDN's word for it, so all 24 recordings in the private bucket were stored,
 * served and recorded on their rows as octet-stream, and a browser that goes by
 * the type (Safari above all) has nothing it knows how to play. The type is
 * read from the audio's first bytes now; the provider's word counts only when
 * it names audio. Executed over the real copy with the CDN and the bucket
 * answering, not read out of the source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = await import(pathToFileURL(path.join(here, "../../../apps/edge/lib/call-recording.ts")).href);

const bytes = (...parts) => {
  const out = [];
  for (const p of parts) out.push(...(typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p));
  return new Uint8Array(out).buffer;
};
/** A WAV's header as the CDN serves it: RIFF, the size, WAVE. */
const WAV = bytes("RIFF", [0x24, 0x08, 0, 0], "WAVE", "fmt ");
/** An MP3 with its tag, and one without: a frame sync is eleven set bits. */
const MP3_TAGGED = bytes("ID3", [4, 0, 0, 0, 0, 0, 0]);
const MP3_BARE = bytes([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]);
const UNKNOWN = bytes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

test("the type comes from the audio's first bytes; the provider's word counts only when it names audio", () => {
  assert.equal(lib.sniffAudioType(WAV, "binary/octet-stream"), "audio/wav", "the CDN's word for a WAV");
  assert.equal(lib.sniffAudioType(MP3_TAGGED, null), "audio/mpeg");
  assert.equal(lib.sniffAudioType(MP3_BARE, null), "audio/mpeg");
  assert.equal(lib.sniffAudioType(UNKNOWN, "audio/ogg"), "audio/ogg", "an audio type the bytes cannot contradict stands");
  assert.equal(lib.sniffAudioType(UNKNOWN, "application/octet-stream"), "audio/wav", "not audio by its own word: what Retell records in");
  assert.equal(lib.sniffAudioType(bytes("RIFF"), "audio/wav"), "audio/wav", "four bytes are not a header, and the word stands");
  assert.equal(lib.sniffAudioType(new ArrayBuffer(0), null), "audio/wav", "nothing to read");
});

/** The CDN answering with these bytes under this type, and a bucket that keeps what it is given. */
function world(body, contentType) {
  const T = "t-1";
  const tables = { calls: [{ id: "k1", tenant_id: T, recording: { fetch_state: "pending", attempts: 0 } }] };
  const db = fakeDb(tables);
  const uploads = [];
  db.storage = {
    from: (bucket) => ({
      upload: async (p, b, opts) => { uploads.push({ bucket, path: p, bytes: b.byteLength, ...opts }); return { data: { path: p }, error: null }; },
    }),
  };
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(body, { status: 200, headers: { "content-type": contentType } });
  return { T, tables, db, uploads, restore: () => { globalThis.fetch = real; } };
}

test("a WAV the CDN calls binary/octet-stream is stored, served and recorded as audio/wav", async () => {
  const w = world(WAV, "binary/octet-stream");
  try {
    const out = await lib.copyRecording(w.db, { tenantId: w.T, callId: "k1", providerUrl: "https://cdn.retell.test/k1.wav", timeoutMs: 1000 });
    assert.equal(out, "stored");
    assert.deepEqual(w.uploads.map((u) => [u.bucket, u.path, u.contentType, u.upsert]), [["media", `${w.T}/calls/k1.wav`, "audio/wav", true]]);
    assert.deepEqual(w.tables.calls[0].recording, { fetch_state: "stored", attempts: 1, storage_path: `${w.T}/calls/k1.wav`, mime: "audio/wav", bytes: WAV.byteLength });
  } finally { w.restore(); }
});

test("the file's name follows what the audio is, not what the CDN said", async () => {
  const w = world(MP3_BARE, "application/octet-stream");
  try {
    assert.equal(await lib.copyRecording(w.db, { tenantId: w.T, callId: "k1", providerUrl: "https://cdn.retell.test/k1", timeoutMs: 1000 }), "stored");
    assert.deepEqual(w.uploads.map((u) => [u.path, u.contentType]), [[`${w.T}/calls/k1.mp3`, "audio/mpeg"]]);
    assert.equal(w.tables.calls[0].recording.mime, "audio/mpeg");
  } finally { w.restore(); }
});
