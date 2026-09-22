/**
 * The recordings stored before the copy sniffed its type are retyped.
 *
 * Every recording copied before sniffAudioType (apps/edge/lib/call-recording.ts)
 * sits in the private bucket as binary/octet-stream, the Retell CDN's word for a
 * WAV. tooling/scripts/recordings-retype.mjs re-uploads each one typed as what it
 * is and records that on its row. Executed here over rows in memory and a bucket
 * that answers: what it picks, that its rule is the copy's, what it writes, and
 * what it leaves alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = await import(pathToFileURL(path.join(here, "../recordings-retype.mjs")).href);
const edge = await import(pathToFileURL(path.join(here, "../../../apps/edge/lib/call-recording.ts")).href);

const T = "t-1";
const bytes = (...parts) => {
  const out = [];
  for (const p of parts) out.push(...(typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p));
  return new Uint8Array(out).buffer;
};
const WAV = bytes("RIFF", [0x24, 0x08, 0, 0], "WAVE", "fmt ", [16, 0, 0, 0]);
const MP3 = bytes([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0]);
const stored = (id, mime, over = {}) => ({
  id,
  tenant_id: T,
  recording: { fetch_state: "stored", attempts: 1, storage_path: `${T}/calls/${id}.wav`, mime, bytes: 20, ...over },
});

test("the plan is every stored recording not typed as audio, and nothing else", () => {
  const rows = [
    stored("octet", "binary/octet-stream"),
    stored("app-octet", "application/octet-stream"),
    stored("untyped", null),
    stored("wav", "audio/wav"),
    stored("mp3", "audio/mpeg"),
    stored("pathless", "binary/octet-stream", { storage_path: undefined }),
    { id: "pending", tenant_id: T, recording: { fetch_state: "pending", attempts: 1 } },
    { id: "purged", tenant_id: T, recording: { fetch_state: "purged", mime: "binary/octet-stream" } },
    { id: "none", tenant_id: T, recording: null },
  ];
  assert.deepEqual(script.planRetype(rows), [
    { id: "octet", tenant_id: T, storage_path: `${T}/calls/octet.wav`, from: "binary/octet-stream" },
    { id: "app-octet", tenant_id: T, storage_path: `${T}/calls/app-octet.wav`, from: "application/octet-stream" },
    { id: "untyped", tenant_id: T, storage_path: `${T}/calls/untyped.wav`, from: null },
  ]);
});

test("its rule is the copy's rule", () => {
  const cases = [
    [WAV, "binary/octet-stream"],
    [WAV, null],
    [MP3, null],
    [MP3, "application/octet-stream"],
    [bytes("ID3", [4, 0, 0]), null],
    [bytes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), "audio/ogg"],
    [bytes([1, 2, 3, 4]), "application/octet-stream"],
    [bytes("RIFF"), "audio/wav"],
    [new ArrayBuffer(0), null],
  ];
  for (const [b, given] of cases)
    assert.equal(script.sniffAudioType(b, given), edge.sniffAudioType(b, given), `${given}`);
});

/** The rows, and a bucket holding these objects that keeps what it is given. */
function world(rows, objects, faults = {}) {
  const tables = { calls: rows };
  const db = fakeDb(tables);
  const uploads = [];
  db.storage = {
    from: (bucket) => ({
      download: async (p) =>
        faults.download?.[p]
          ? { data: null, error: { message: faults.download[p] } }
          : { data: new Blob([objects[p]]), error: null },
      upload: async (p, b, opts) => {
        uploads.push({ bucket, path: p, bytes: b.byteLength, ...opts });
        return { data: { path: p }, error: null };
      },
    }),
  };
  return { tables, db, uploads };
}

test("an apply re-uploads each object typed as what it is, in place, and records the type on its row; running it again finds nothing", async () => {
  const w = world(
    [
      stored("a", "binary/octet-stream"),
      stored("b", "binary/octet-stream", { storage_path: `${T}/calls/b.wav` }),
      stored("c", "audio/wav"),
    ],
    { [`${T}/calls/a.wav`]: WAV, [`${T}/calls/b.wav`]: MP3 },
  );
  const plan = script.planRetype(w.tables.calls);
  const out = await script.retype(w.db, plan);
  assert.deepEqual(out, {
    retyped: [
      { id: "a", from: "binary/octet-stream", to: "audio/wav" },
      { id: "b", from: "binary/octet-stream", to: "audio/mpeg" },
    ],
    skipped: [],
  });
  assert.deepEqual(
    w.uploads.map((u) => [u.bucket, u.path, u.contentType, u.upsert, u.bytes]),
    [
      ["media", `${T}/calls/a.wav`, "audio/wav", true, WAV.byteLength],
      ["media", `${T}/calls/b.wav`, "audio/mpeg", true, MP3.byteLength],
    ],
    "the same path: the row's storage_path stays true",
  );
  assert.deepEqual(
    w.tables.calls[0].recording,
    { fetch_state: "stored", attempts: 1, storage_path: `${T}/calls/a.wav`, mime: "audio/wav", bytes: 20 },
    "only the type changes",
  );
  assert.equal(w.tables.calls[1].recording.mime, "audio/mpeg");
  assert.equal(w.tables.calls[2].recording.mime, "audio/wav", "already audio: not in the plan, not touched");
  assert.deepEqual(script.planRetype(w.tables.calls), [], "nothing left to retype");
});

test("a row that changed since the plan, and an object the bucket will not hand over, are skipped and said; the rest go ahead", async () => {
  const w = world(
    [
      stored("purged-since", "binary/octet-stream"),
      stored("gone", "binary/octet-stream"),
      stored("ok", "binary/octet-stream"),
    ],
    { [`${T}/calls/ok.wav`]: WAV },
    { download: { [`${T}/calls/gone.wav`]: "Object not found" } },
  );
  const plan = script.planRetype(w.tables.calls);
  // Purged between the plan and the apply: the audio is gone and the row says so.
  w.tables.calls[0].recording = {
    fetch_state: "purged",
    purged_at: "2026-09-21T00:00:00Z",
    retention_days: 90,
    mime: "binary/octet-stream",
  };
  const out = await script.retype(w.db, plan);
  assert.deepEqual(out.retyped, [{ id: "ok", from: "binary/octet-stream", to: "audio/wav" }]);
  assert.deepEqual(out.skipped, [
    { id: "purged-since", why: "no longer stored at the planned path" },
    { id: "gone", why: "download: Object not found" },
  ]);
  assert.deepEqual(
    w.uploads.map((u) => u.path),
    [`${T}/calls/ok.wav`],
    "nothing uploaded for either",
  );
  assert.equal(w.tables.calls[0].recording.fetch_state, "purged", "a purged row is not stored again");
  assert.equal(w.tables.calls[1].recording.mime, "binary/octet-stream", "left as it was, for the next run");
});

test("a dry run reads each object's first bytes through a short-lived link, and writes nothing", async () => {
  const w = world([stored("a", "binary/octet-stream"), stored("b", null)], {});
  const signed = [];
  w.db.storage.from = (bucket) => ({
    createSignedUrl: async (p, secs) => {
      signed.push([bucket, p, secs]);
      return { data: { signedUrl: `https://storage.test/${p}?token=x` }, error: null };
    },
    upload: async () => {
      throw new Error("a dry run must not upload");
    },
  });
  const real = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push([String(url), init?.headers?.Range ?? null]);
    return new Response(String(url).includes("/a.wav") ? WAV.slice(0, 12) : MP3.slice(0, 12), { status: 206 });
  };
  try {
    const plan = script.planRetype(w.tables.calls);
    const out = await script.peekTypes(w.db, plan);
    assert.deepEqual(out, [
      { id: "a", from: "binary/octet-stream", to: "audio/wav" },
      { id: "b", from: null, to: "audio/mpeg" },
    ]);
    assert.deepEqual(signed, [
      ["media", `${T}/calls/a.wav`, 60],
      ["media", `${T}/calls/b.wav`, 60],
    ]);
    assert.deepEqual(
      asked.map(([, range]) => range),
      ["bytes=0-11", "bytes=0-11"],
      "twelve bytes each, not the whole call",
    );
    assert.deepEqual(
      w.tables.calls.map((r) => r.recording.mime),
      ["binary/octet-stream", null],
      "no row written",
    );
  } finally {
    globalThis.fetch = real;
  }
});
