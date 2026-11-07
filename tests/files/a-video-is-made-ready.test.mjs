/**
 * What the edge does with a business's videos (apps/edge/lib/files/video-*.ts, upkeep.ts; decision 0099, stage B), over a database
 * in memory, a bucket in memory and a web that answers from memory: a reservation and its row, a twin's reservation let go; the
 * sheet drawn for real (sharp) from Stream's frames, its poster, its copy at Anthropic, and the next step on the ledger; a clip
 * with no sound; the step a stopped digest still lacks; a removed video let go at Stream first; an upload that never arrived let
 * go a day on; and the sweep, which asks Stream after a video its webhook did not finish.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";
import { at, ROOT } from "../_cron-doors-world.mjs";

const sharp = createRequire(path.join(ROOT, "apps/edge/package.json"))("sharp");

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
Object.assign(process.env, {
  ANTHROPIC_API_KEY: "model-key-for-this-file",
  CLOUDFLARE_ACCOUNT_ID: "acct-1",
  CLOUDFLARE_STREAM_API_TOKEN: "stream-token-for-this-file",
  CLOUDFLARE_STREAM_CUSTOMER_CODE: "abc",
  CLOUDFLARE_STREAM_KEY_ID: "key-1",
  CLOUDFLARE_STREAM_KEY_JWK: Buffer.from(JSON.stringify(privateKey.export({ format: "jwk" }))).toString("base64"),
});
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "VIDEO_WORDS_MODEL"])
  delete process.env[k];

let answer = async (url) => {
  throw new Error(`nothing answers ${url}`);
};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => answer(String(url), init);

const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { fileJobs, keepFilesMoving } = await import(at("apps/edge/lib/files/upkeep.ts"));
const { startVideoUpload } = await import(at("apps/edge/lib/files/video-doors.ts"));
const { videoSheetPlanOf } = await import(at("packages/contracts/src/files/video.ts"));

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const T = "aaaaaaaa-0000-4000-8000-000000000001";
const F = "ffffffff-0000-4000-8000-000000000001";
const U = "bbbbbbbb-0000-4000-8000-000000000001";
const UID = "0123456789abcdef0123456789abcdef";
const STREAM_API = `https://api.cloudflare.com/client/v4/accounts/acct-1/stream`;
const ok = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const DAY = 86_400_000;

const videoRow = (over = {}) => ({
  id: F,
  tenant_id: T,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: "salon-tour",
  owner_named: false,
  mime: "video/mp4",
  bytes: 5_000_000,
  width: 1920,
  height: 1080,
  fingerprint: "a".repeat(64),
  claude_copy: null,
  look: null,
  look_status: "waiting",
  look_edition: null,
  looked_at: ago(1000),
  shows: null,
  owner_shelved: false,
  who_in_it: "not_asked",
  created_by: U,
  removed_at: null,
  created_at: ago(1000),
  updated_at: ago(1000),
  made: null,
  kind: "video",
  media_ref: UID,
  media_status: "ready",
  media_error: null,
  ready_at: ago(1000),
  seconds: 3,
  sound: null,
  sound_said: null,
  ...over,
});

function world({ files = [videoRow()], folder = [], takesVideos = true } = {}) {
  const tables = {
    tenants: [{ id: T, name: "Harbor Salon", timezone: "America/New_York", status: "active" }],
    tenant_config: takesVideos ? [{ tenant_id: T, config: { features: { video_preview: true } } }] : [],
    billing_accounts: [{ tenant_id: T, mode: "stripe", status: "active" }],
    files,
    files_let_go: [],
    jobs: [],
    ai_usage: [],
    events: [],
  };
  const doors = [];
  const db = fakeDb(
    tables,
    {},
    {
      file_video_begin: (a) => {
        doors.push(["begin", a]);
        const twin = tables.files.find((f) => f.fingerprint === a.p_fingerprint && !f.removed_at);
        if (twin) return { fate: "here", file_id: twin.id };
        tables.files.push(
          videoRow({ id: a.p_id, media_ref: a.p_media_ref, media_status: "uploading", fingerprint: a.p_fingerprint }),
        );
        return { fate: "kept", file_id: a.p_id };
      },
      file_media_ready: (a) => {
        doors.push(["ready", a]);
        return { fate: "ready", tenant_id: T, file_id: F };
      },
      file_media_failed: (a) => {
        doors.push(["failed", a]);
        return { fate: "failed", tenant_id: T, file_id: F };
      },
      file_upload_lapsed: (a) => {
        doors.push(["lapsed", a]);
        const row = tables.files.find((f) => f.id === a.p_id && f.media_status === "uploading" && !f.removed_at);
        if (row) row.removed_at = new Date().toISOString();
        return !!row;
      },
      file_purged: (a) => {
        doors.push(["purged", a]);
        tables.files = tables.files.filter((f) => f.id !== a.p_id);
        return null;
      },
      file_sound_keep: (a) => {
        doors.push(["sound", a]);
        const row = tables.files.find((f) => f.id === a.p_id);
        if (a.p_part === "none") row.sound = { none: true };
        row.sound_said = a.p_said || row.sound_said;
        return null;
      },
    },
  );
  const bucket = { uploaded: [], removed: [], folder: [...folder] };
  db.storage = {
    from: () => ({
      createSignedUrl: async (p) => ({ data: { signedUrl: `https://storage.example/${p}` }, error: null }),
      upload: async (p, bytes) => {
        bucket.uploaded.push({ path: p, bytes });
        bucket.folder.push(p.split("/").at(-1));
        return { error: null };
      },
      remove: async (paths) => {
        bucket.removed.push(...paths);
        return { error: null };
      },
      list: async () => ({ data: bucket.folder.map((name) => ({ name })), error: null }),
      download: async () => ({ data: null, error: { message: "not here" } }),
    }),
  };
  setPg(db);
  return { db, tables, doors, bucket };
}

const job = (kind, payload) => ({ id: "job-1", tenant_id: T, kind, payload, attempts: 1 });
const SOON = () => Date.now() + 30_000;

/** A frame as Stream would hand one over: a JPEG at the size asked. */
async function frameAt(url) {
  const q = new URL(url).searchParams;
  return sharp({
    create: {
      width: Number(q.get("width")),
      height: Number(q.get("height")),
      channels: 3,
      background: { r: 200, g: 40, b: 90 },
    },
  })
    .jpeg()
    .toBuffer();
}

test("a video's start: a reservation at Stream, then its row with every fact; a twin's reservation is let go at once", async () => {
  world({ files: [], takesVideos: false });
  const calls = [];
  answer = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET" });
    if (url === `${STREAM_API}?direct_user=true`)
      return new Response(null, {
        status: 201,
        headers: { location: "https://upload.videodelivery.net/tus/x", "stream-media-id": UID },
      });
    if (url === `${STREAM_API}/${UID}` && init.method === "DELETE") return ok({ success: true });
    throw new Error(`nothing answers ${url}`);
  };
  // What the door read of the dashboard's knock (api/admin/files/video-start.ts reads it through FILE_VIDEO_START_DOOR).
  const ask = (id) =>
    startVideoUpload(
      { ok: true, via: "token", workspace: T, user: U },
      {
        tenant_id: T,
        id,
        name: "salon-tour",
        mime: "video/mp4",
        bytes: 5_000_000,
        seconds: 24,
        fingerprint: "b".repeat(64),
      },
    );
  const off = await ask(F);
  assert.deepEqual(await off.json(), { ok: true, fate: "off" }, "a workspace whose switch is off is told so");
  assert.equal(calls.length, 0, "and Stream is never asked");
  const w = world({ files: [] });
  const first = await ask(F);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    ok: true,
    fate: "kept",
    file_id: F,
    upload_url: "https://upload.videodelivery.net/tus/x",
  });
  const [, begun] = w.doors.find(([d]) => d === "begin");
  assert.deepEqual([begun.p_media_ref, begun.p_seconds, begun.p_actor, begun.p_name], [UID, 24, U, "salon-tour"]);
  const again = await ask("ffffffff-0000-4000-8000-000000000002");
  assert.equal((await again.json()).fate, "here");
  assert.ok(
    calls.some((c) => c.method === "DELETE"),
    "the twin's reservation is let go",
  );
  const bad = await startVideoUpload(
    { ok: true, via: "token", workspace: T, user: U },
    { tenant_id: T, id: F, mime: "image/jpeg" },
  );
  assert.equal(bad.status, 400);
});

test("the sheet: Stream's frames tiled for real at the plan's size, a first poster, the copy at Anthropic, then the sound's step", async () => {
  const w = world();
  const frames = [];
  answer = async (url, init = {}) => {
    if (url.startsWith("https://customer-abc.cloudflarestream.com/") && url.includes("/thumbnails/thumbnail.jpg")) {
      frames.push(url);
      return new Response(await frameAt(url), { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    if (url.startsWith("https://storage.example/")) {
      const sheet = w.bucket.uploaded.find((u) => u.path.endsWith("/sheet.jpg"));
      return new Response(sheet.bytes, { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    if (url === "https://api.anthropic.com/v1/files" && init.method === "POST")
      return ok({ id: "file_sheet", expires_at: "2027-02-01T00:00:00Z" });
    throw new Error(`nothing answers ${url}`);
  };
  await fileJobs(w.db).digest(job("video_digest", { file_id: F, step: "sheet", edition: "1" }), SOON());
  const plan = videoSheetPlanOf({ seconds: 3, width: 1920, height: 1080 });
  assert.equal(frames.length, plan.times.length + 1, "each frame once, and the poster's");
  assert.match(frames[0], /\/thumbnails\/thumbnail\.jpg\?time=0\.25s&width=\d+&height=\d+&fit=clip$/);
  const sheet = w.bucket.uploaded.find((u) => u.path === `${T}/${F}/sheet.jpg`);
  const meta = await sharp(sheet.bytes).metadata();
  assert.deepEqual([meta.width, meta.height, meta.format], [plan.width, plan.height, "jpeg"]);
  assert.ok(w.bucket.uploaded.some((u) => u.path === `${T}/${F}/poster.jpg`));
  assert.deepEqual(w.tables.files[0].claude_copy, {
    id: "file_sheet",
    expires_at: "2027-02-01T00:00:00Z",
    width: plan.width,
    height: plan.height,
  });
  assert.deepEqual(
    w.tables.jobs.map((j) => [j.kind, j.payload.step]),
    [["video_digest", "audio"]],
  );

  // Asked again (a retry after a lost answer): nothing is drawn twice.
  frames.length = 0;
  w.tables.jobs.length = 0;
  await fileJobs(w.db).digest(job("video_digest", { file_id: F, step: "sheet", edition: "1" }), SOON());
  assert.equal(frames.length, 0);
});

test("a clip Stream makes no sound for keeps that it has none, and goes straight to the look", async () => {
  const w = world({
    files: [
      videoRow({ claude_copy: { id: "file_sheet", expires_at: "2027-02-01T00:00:00Z", width: 2576, height: 1449 } }),
    ],
  });
  answer = async (url) => {
    if (url === `${STREAM_API}/${UID}/downloads/audio`) return ok({ result: { audio: { status: "error" } } });
    throw new Error(`nothing answers ${url}`);
  };
  await fileJobs(w.db).digest(job("video_digest", { file_id: F, step: "audio", edition: "1" }), SOON());
  const sound = w.doors.find(([d]) => d === "sound")[1];
  assert.deepEqual([sound.p_part, sound.p_said], ["none", "no sound"]);
  assert.deepEqual(
    w.tables.jobs.map((j) => [j.kind, j.payload.step]),
    [["video_digest", "look"]],
  );
  w.tables.jobs.length = 0;
  w.tables.files[0].sound = { none: true };
  await fileJobs(w.db).digest(job("video_digest", { file_id: F, step: "look", edition: "1" }), SOON());
  assert.deepEqual(
    w.tables.jobs.map((j) => [j.kind, j.payload]),
    [["file_look", { file_id: F, edition: "1" }]],
  );
});

test("a video not ready, or removed, has nothing to make ready; an unknown step is a line, never a retry", async () => {
  const w = world({ files: [videoRow({ media_status: "processing" })] });
  answer = async (url) => {
    throw new Error(`nothing should be asked: ${url}`);
  };
  await fileJobs(w.db).digest(job("video_digest", { file_id: F, step: "sheet", edition: "1" }), SOON());
  await fileJobs(w.db).digest(job("video_digest", { file_id: F, step: "dance", edition: "1" }), SOON());
  assert.deepEqual(w.tables.jobs, []);
});

test("a removed video is let go at Stream first, then its folder and its copy, then its row", async () => {
  const w = world({
    files: [videoRow({ removed_at: ago(1000), claude_copy: { id: "file_sheet" } })],
    folder: ["sheet.jpg", "poster.jpg", "audio.m4a"],
  });
  const order = [];
  answer = async (url, init = {}) => {
    order.push(`${init.method ?? "GET"} ${new URL(url).host}`);
    if (url === `${STREAM_API}/${UID}` && init.method === "DELETE") return ok({ success: true });
    if (url === "https://api.anthropic.com/v1/files/file_sheet") return ok({ id: "file_sheet" });
    throw new Error(`nothing answers ${url}`);
  };
  await fileJobs(w.db).purge(job("file_purge", { file_id: F, why: "remove" }));
  assert.deepEqual(order, ["DELETE api.cloudflare.com", "DELETE api.anthropic.com"]);
  assert.deepEqual(w.bucket.removed.sort(), [`${T}/${F}/audio.m4a`, `${T}/${F}/poster.jpg`, `${T}/${F}/sheet.jpg`]);
  assert.deepEqual(w.tables.files, []);
});

test("Stream keeping the video holds the row, so the purge is asked again", async () => {
  const w = world({ files: [videoRow({ removed_at: ago(1000) })] });
  answer = async () => new Response("{}", { status: 500 });
  await assert.rejects(fileJobs(w.db).purge(job("file_purge", { file_id: F, why: "remove" })), /Stream kept the video/);
  assert.equal(w.tables.files.length, 1);
});

test("a video whose bytes never arrived is let go a day after its upload began; one that arrived is left alone", async () => {
  const w = world({ files: [videoRow({ media_status: "uploading" })] });
  answer = async (url, init = {}) => {
    if (url === `${STREAM_API}/${UID}` && init.method === "DELETE") return ok({ success: true });
    throw new Error(`nothing answers ${url}`);
  };
  await fileJobs(w.db).purge(job("file_purge", { file_id: F, why: "start" }));
  assert.ok(w.doors.some(([d]) => d === "lapsed"));
  assert.deepEqual(w.tables.files, [], "removed, and let go");
  const kept = world({ files: [videoRow()] });
  await fileJobs(kept.db).purge(job("file_purge", { file_id: F, why: "start" }));
  assert.equal(kept.tables.files.length, 1);
});

test("the sweep asks Stream after a video its webhook did not finish: ready as the webhook would write it, an error as failed", async () => {
  const w = world({
    files: [
      videoRow({
        id: "v-ready",
        name: "v-ready",
        media_ref: "a".repeat(32),
        media_status: "processing",
        updated_at: ago(10 * 60_000),
      }),
      videoRow({
        id: "v-broken",
        name: "v-broken",
        media_ref: "b".repeat(32),
        media_status: "uploading",
        updated_at: ago(10 * 60_000),
        fingerprint: "c".repeat(64),
      }),
      videoRow({
        id: "v-just-now",
        name: "v-just-now",
        media_ref: "d".repeat(32),
        media_status: "processing",
        updated_at: ago(1000),
        fingerprint: "d".repeat(64),
      }),
    ],
  });
  const asked = [];
  answer = async (url) => {
    asked.push(url);
    if (url.endsWith("a".repeat(32)))
      return ok({
        result: {
          uid: "a".repeat(32),
          readyToStream: true,
          status: { state: "ready" },
          duration: 24,
          input: { width: 1080, height: 1920 },
        },
      });
    if (url.endsWith("b".repeat(32)))
      return ok({
        result: { uid: "b".repeat(32), status: { state: "error", errorReasonCode: "ERR_MALFORMED_VIDEO" } },
      });
    throw new Error(`nothing answers ${url}`);
  };
  const did = await keepFilesMoving(w.db);
  assert.equal(asked.length, 2, "one just touched is left for the next pass");
  assert.deepEqual(
    w.doors.filter(([d]) => d === "ready" || d === "failed"),
    [
      ["ready", { p_media_ref: "a".repeat(32), p_seconds: 24, p_width: 1080, p_height: 1920 }],
      ["failed", { p_media_ref: "b".repeat(32), p_error: "ERR_MALFORMED_VIDEO" }],
    ],
  );
  assert.ok(did.videos >= 2);
});

test("the sweep schedules the step a young video's stopped digest lacks, a day on, from what its row holds", async () => {
  const stopped = (id, over) =>
    videoRow({
      id,
      name: id,
      look_status: "failed",
      looked_at: ago(2 * DAY),
      created_at: ago(2 * DAY),
      fingerprint: id.padEnd(64, "0"),
      ...over,
    });
  const copy = { id: "x" };
  const w = world({
    files: [
      stopped("no-sheet", { claude_copy: null }),
      stopped("no-sound", { claude_copy: copy }),
      stopped("silent", { claude_copy: copy, sound: { none: true } }),
      stopped("no-note", { claude_copy: copy, sound: { words: { none: true } } }),
      stopped("heard", { claude_copy: copy, sound: { words: { none: true }, note: { feel: "Quiet." } } }),
      videoRow({
        id: "today",
        name: "today",
        look_status: "failed",
        looked_at: ago(1000),
        created_at: ago(2 * DAY),
        fingerprint: "e".repeat(64),
      }),
      videoRow({
        id: "old",
        name: "old",
        look_status: "failed",
        looked_at: ago(2 * DAY),
        created_at: ago(30 * DAY),
        fingerprint: "f".repeat(64),
      }),
    ],
  });
  answer = async (url) => {
    throw new Error(`nothing should be asked: ${url}`);
  };
  await keepFilesMoving(w.db);
  assert.deepEqual(
    Object.fromEntries(
      w.tables.jobs.filter((j) => j.kind === "video_digest").map((j) => [j.payload.file_id, j.payload.step]),
    ),
    { "no-sheet": "sheet", "no-sound": "audio", silent: "look", "no-note": "note", heard: "look" },
  );
  assert.deepEqual(
    w.tables.jobs.filter((j) => j.kind === "file_look"),
    [],
    "a video's wait is its digest's, not a look's",
  );
});
