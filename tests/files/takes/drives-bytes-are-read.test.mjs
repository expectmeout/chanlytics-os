/**
 * A Drive file's bytes read by the app (packages/channels/src/files/drive-bytes.ts, the footage sources plan): a
 * clip's first MiB or a photo whole, in one download, under a key that rides a header and never the address. Drive's
 * answers are judged once: "not now" is a rest, a 404 gone, a refused grant no access, and silence throws.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { importSrc } from "../../_source.mjs";

const { readDriveBytes } = await importSrc("packages/channels/src/files/drive-bytes.ts");

const KEY = "ya29.a-drive-key-for-this-file";
const MIB = 1_048_576;
const CLIP = Uint8Array.from({ length: 3 * MIB }, (_, i) => (i * 31 + (i >> 8)) & 0xff);
const TRY = { most: MIB, timeoutMs: 5_000 };

beforeEach(() => resetBreakers());

/** Drive, from memory: the range asked of one file, kept with what was asked. */
function drive(answerWith) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers });
    return answerWith(init);
  };
  return { calls, deps: { fetch, sleep: async () => undefined } };
}

const ranged = (bytes, total) => (init) => {
  const [, from, to] = /^bytes=(\d+)-(\d+)$/.exec(init.headers.Range);
  const last = Math.min(Number(to), bytes.length - 1);
  return new Response(bytes.subarray(Number(from), last + 1), {
    status: 206,
    headers: { "content-range": `bytes ${from}-${last}/${total ?? bytes.length}` },
  });
};

test("a clip's first MiB comes in one read, with the whole clip's size, and the key rides a header", async () => {
  const d = drive(ranged(CLIP));
  const read = await readDriveBytes(KEY, "file 1/x", TRY, d.deps);
  assert.equal(read.verdict, "ok");
  assert.equal(read.answer.bytes.length, MIB);
  assert.deepEqual([...read.answer.bytes.subarray(0, 64)], [...CLIP.subarray(0, 64)]);
  assert.equal(read.answer.size, CLIP.length, "the size is the whole file's, from Drive's own answer");
  assert.equal(d.calls.length, 1, "one download: 200 of Google's units");
  const asked = new URL(d.calls[0].url);
  assert.equal(asked.pathname, "/drive/v3/files/file%201%2Fx", "the file's id is escaped into the path");
  assert.equal(asked.searchParams.get("alt"), "media");
  assert.equal(asked.searchParams.get("supportsAllDrives"), "true", "a shared drive's file is read too");
  assert.equal(d.calls[0].headers.Range, `bytes=0-${MIB - 1}`);
  assert.equal(d.calls[0].headers.Authorization, `Bearer ${KEY}`);
  assert.ok(!d.calls[0].url.includes(KEY), "never in the address");
});

test("a file shorter than what was asked comes whole", async () => {
  const photo = CLIP.subarray(0, 4_000);
  const read = await readDriveBytes(KEY, "p", { most: 25_000_001, timeoutMs: 5_000 }, drive(ranged(photo)).deps);
  assert.equal(read.answer.bytes.length, 4_000);
  assert.equal(read.answer.size, 4_000);
});

test("bytes past what was asked are never held, whatever Drive sends", async () => {
  const d = drive(() => new Response(CLIP, { status: 200 }));
  const read = await readDriveBytes(KEY, "p", TRY, d.deps);
  assert.equal(read.answer.bytes.length, MIB);
  assert.equal(read.answer.size, MIB, "with no size said, the bytes read are all that is known");
});

test("Drive's refusals are judged once: a rest, gone, no access", async () => {
  const refusal = (status, reason, headers = {}) =>
    drive(() => new Response(JSON.stringify({ error: { errors: [{ reason }] } }), { status, headers })).deps;
  assert.deepEqual(await readDriveBytes(KEY, "f", TRY, refusal(429, "rateLimitExceeded", { "retry-after": "7" })), {
    verdict: "pace",
    restMs: 7_000,
  });
  assert.deepEqual(await readDriveBytes(KEY, "f", TRY, refusal(403, "userRateLimitExceeded")), {
    verdict: "pace",
    restMs: 60_000,
  });
  assert.deepEqual(await readDriveBytes(KEY, "f", TRY, refusal(404, "notFound")), { verdict: "gone" });
  assert.deepEqual(await readDriveBytes(KEY, "f", TRY, refusal(403, "insufficientPermissions")), {
    verdict: "no_access",
  });
  assert.deepEqual(await readDriveBytes(KEY, "f", TRY, refusal(401, "authError")), { verdict: "no_access" });
});

test("no answer, or a body cut short, is no verdict: it throws, and half a file is never a file", async () => {
  await assert.rejects(readDriveBytes(KEY, "f", TRY, drive(() => new Response("upstream", { status: 502 })).deps), {
    name: "DriveBytesUnread",
    status: 502,
  });
  const cut = new ReadableStream({
    start(controller) {
      controller.enqueue(CLIP.subarray(0, 1000));
      controller.error(new Error("socket hang up"));
    },
  });
  await assert.rejects(
    readDriveBytes(
      KEY,
      "f",
      TRY,
      drive(() => new Response(cut, { status: 206, headers: { "content-range": "bytes 0-1048575/3145728" } })).deps,
    ),
    /socket hang up/,
  );
});
