/**
 * A found video comes in (apps/edge/lib/files/found-video.ts and found.ts; 00626, 00643), over a database in memory and a web
 * that answers from memory: what a website plays or an Instagram posted, let in by its length at the door before Stream is
 * asked, fetched by Stream from its address and kept once, at the road's status; a twin or one a person let go never
 * fetched; a workspace that takes no videos passed over; Stream's copy let go where no row holds it; a batch that brings a
 * video rings the bell in those words; and a batch whose videos do not fit still brings its photos, and counts what it left.
 */
import { test, after, beforeEach } from "node:test";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { resetBreakers, setPublicFetch } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";
import { scenePng } from "../look/_png.mjs";
import { at } from "../_cron-doors-world.mjs";

Object.assign(process.env, {
  CLOUDFLARE_ACCOUNT_ID: "acct-1",
  CLOUDFLARE_STREAM_API_TOKEN: "stream-token-for-this-file",
});
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

let answer = async (url) => {
  throw new Error(`nothing answers ${url}`);
};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => answer(String(url), init);

const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { keepFoundVideo } = await import(at("apps/edge/lib/files/found-video.ts"));
/** What a found video is known by (found-video.ts): its road and the road's name for it, hashed. */
const foundVideoPrintOf = (source, ref) => `found:${createHash("sha256").update(`${source}|${ref}`).digest("hex")}`;
const { fetchFiles, siteVideosOf } = await import(at("apps/edge/lib/files/found.ts"));

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const T = "aaaaaaaa-0000-4000-8000-000000000001";
const UID = "0123456789abcdef0123456789abcdef";
const STREAM_API = "https://api.cloudflare.com/client/v4/accounts/acct-1/stream";
const CLIP = "https://harbor.example/reels/cut.mp4";
const ok = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

/** A video already in the Library, holding this many of the workspace's seconds. */
const heldVideo = (seconds, over = {}) => ({
  id: randomUUID(),
  tenant_id: T,
  kind: "video",
  status: "filed",
  source: "upload",
  fingerprint: `held-${randomUUID()}`,
  media_status: "ready",
  seconds,
  removed_at: null,
  ...over,
});

/**
 * The database a found video meets. `videos`: what the Library holds already. `files`: how many files it counts
 * toward its thousand before anything comes. `roomGoes`: the room is taken between the judging and the write.
 */
function world({ takesVideos = true, videos = [], files = 0, roomGoes = false, upload = null } = {}) {
  const tables = {
    tenants: [{ id: T, name: "Harbor Salon", timezone: "America/New_York", status: "active" }],
    tenant_config: takesVideos ? [{ tenant_id: T, config: { features: { video_preview: true } } }] : [],
    files: [...videos],
    files_let_go: [],
    notifications: [],
    jobs: [],
    events: [],
  };
  const asked = [];
  const notes = [];
  const found = [];
  const live = () => tables.files.filter((f) => !f.removed_at);
  // 00638 video_seconds_toward_cap: every video not removed whose copy did not fail.
  const used = () =>
    live()
      .filter((f) => f.kind === "video" && f.media_status !== "failed")
      .reduce((n, f) => n + Number(f.seconds ?? 0), 0);
  // 00643 file_video_room: long, minutes or room.
  const roomFor = (seconds) => {
    if (seconds !== null && seconds > 600) return "long";
    if (seconds === null ? used() >= 3600 : used() + seconds > 3600) return "minutes";
    return "room";
  };
  const db = fakeDb(
    tables,
    {},
    {
      // The ledger's line for the road's run (imports, 00626): the found-files job notes what it kept.
      import_ledger_note: (a) => {
        notes.push(a);
        return null;
      },
      // 00551, as a batch's photo meets the door: a twin, room in the thousand, then the row.
      file_found: (a) => {
        found.push(a);
        if (live().some((f) => f.fingerprint === a.p_fingerprint)) return { fate: "here", file_id: null };
        if (files + live().length >= 1000) return { fate: "full", file_id: null };
        tables.files.push({
          id: a.p_id,
          tenant_id: T,
          kind: "image",
          status: a.p_status,
          fingerprint: a.p_fingerprint,
        });
        return { fate: "kept", file_id: a.p_id };
      },
      // 00643's order: asked again, twin, let go, the thousand, room by its length, then (with a copy named) the row.
      file_video_found: (a) => {
        asked.push(a);
        if (world.throws && a.p_media_ref) throw new Error(world.throws);
        if (tables.files.some((f) => f.id === a.p_id)) return { fate: "kept", file_id: a.p_id };
        const twin = live().find((f) => f.fingerprint === a.p_fingerprint);
        if (twin) return { fate: "here", file_id: twin.id };
        if (tables.files_let_go.some((g) => g.fingerprint === a.p_fingerprint)) return { fate: "here", file_id: null };
        if (files + live().length >= 1000) return { fate: "full", file_id: null };
        const room = roomGoes && a.p_media_ref ? "minutes" : roomFor(a.p_seconds ?? null);
        if (room !== "room" || !a.p_media_ref) return { fate: room, file_id: null };
        tables.files.push({
          id: a.p_id,
          tenant_id: T,
          kind: "video",
          status: a.p_status,
          source: a.p_source,
          source_ref: a.p_source_ref,
          name: a.p_name,
          mime: a.p_mime,
          fingerprint: a.p_fingerprint,
          media_ref: a.p_media_ref,
          media_status: "uploading",
          seconds: a.p_seconds ?? null,
          removed_at: null,
        });
        return { fate: "kept", file_id: a.p_id };
      },
    },
  );
  const bucket = { uploaded: [], removed: [] };
  db.storage = {
    from: () => ({
      upload: async (path) => (upload ? await upload(path) : (bucket.uploaded.push(path), { error: null })),
      remove: async (paths) => (bucket.removed.push(...paths), { error: null }),
    }),
  };
  setPg(db);
  return { db, tables, asked, notes, found, bucket, used, writes: () => asked.filter((a) => a.p_media_ref) };
}

/** Stream: a copy asked for answers its video; a delete is answered too. Each call is kept. */
function stream({ refuse = null, busy = false } = {}) {
  const calls = [];
  answer = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : null });
    // As many videos queued or encoding as it takes at once: its own "too many", with nothing wrong with the video.
    if (url === `${STREAM_API}/copy` && busy)
      return new Response(JSON.stringify({ success: false, errors: [{ code: 10010, message: "Too many videos" }] }), {
        status: 429,
        headers: { "content-type": "application/json" },
      });
    if (url === `${STREAM_API}/copy` && refuse)
      return new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: refuse }] }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    if (url === `${STREAM_API}/copy`)
      return ok({ success: true, result: { uid: UID, status: { state: "downloading" } } });
    if (url === `${STREAM_API}/${UID}`) return ok({ success: true });
    throw new Error(`nothing answers ${url}`);
  };
  calls.copies = () => calls.filter((c) => c.url === `${STREAM_API}/copy`);
  return calls;
}

const keep = (w, over = {}) =>
  keepFoundVideo(w.db, T, {
    source: "website",
    status: "inbox",
    url: CLIP,
    ref: CLIP,
    name: "cut",
    seconds: null,
    ...over,
  });

test("a found video is judged, then fetched by Stream from its address and kept once, at its road's status", async () => {
  const w = world();
  const calls = stream();
  assert.equal(await keep(w), "kept");
  const copy = calls.find((c) => c.url === `${STREAM_API}/copy`);
  assert.equal(copy.method, "POST");
  assert.equal(copy.body.input, CLIP, "the address goes in Cloudflare's `input`");
  assert.equal("url" in copy.body, false, "and never in the deprecated `url` beside it");
  assert.equal(copy.body.requireSignedURLs, true);
  assert.equal(w.asked[0].p_media_ref, null, "the door is asked first with no copy named: it only judges");
  const [written] = w.writes();
  assert.equal(copy.body.meta.name, written.p_id, "the webhook finds the row by our id, as an upload's");
  assert.equal(written.p_id, w.asked[0].p_id, "the row is the one that was judged");
  assert.deepEqual(
    {
      status: written.p_status,
      source: written.p_source,
      ref: written.p_source_ref,
      media: written.p_media_ref,
      mime: written.p_mime,
      print: written.p_fingerprint,
      seconds: written.p_seconds,
    },
    {
      status: "inbox",
      source: "website",
      ref: CLIP,
      media: UID,
      mime: "video/mp4",
      print: foundVideoPrintOf("website", CLIP),
      seconds: null,
    },
  );
  assert.equal(await keep(w), "here", "the same video found again");
  assert.equal(calls.copies().length, 1, "and Stream is not asked twice");
});

test("one a person let go is not fetched again", async () => {
  const w = world();
  const calls = stream();
  w.tables.files_let_go.push({ tenant_id: T, fingerprint: foundVideoPrintOf("website", CLIP) });
  assert.equal(await keep(w), "here");
  assert.equal(calls.length, 0);
});

test("a workspace that takes no videos is passed over, and Stream is never asked", async () => {
  const w = world({ takesVideos: false });
  const calls = stream();
  assert.equal(await keep(w), "passed");
  assert.equal(calls.length, 0);
  assert.equal(w.asked.length, 0);
});

test("Stream refusing an address is a pass; its own storage spent stops the videos, and nothing is written", async () => {
  const w = world();
  stream({ refuse: "Invalid URL" });
  assert.equal(await keep(w), "passed");
  stream({ refuse: "Storage capacity exceeded" });
  assert.equal(await keep(w), "stopped", "the platform's account is full, which is not the business's Library");
  assert.equal(w.writes().length, 0);
});

test("a reel is let in by the length its road says: with no room for it, Stream is never asked", async () => {
  const w = world({ videos: [heldVideo(3540)] });
  const calls = stream();
  assert.equal(await keep(w, { source: "instagram", ref: "instagram:A1", seconds: 90 }), "minutes");
  assert.equal(calls.length, 0, "no fetch, so no copy to let go");
  assert.equal(await keep(w, { source: "instagram", ref: "instagram:B2", seconds: 45 }), "kept", "a shorter one fits");
  assert.equal(w.writes()[0].p_seconds, 45, "its length is on the row at once, so it counts while it is on its way");
  assert.equal(w.used(), 3585);
});

test("a found video longer than ten minutes is passed over at the door, with no fetch", async () => {
  const w = world();
  const calls = stream();
  assert.equal(await keep(w, { source: "instagram", ref: "instagram:L9", seconds: 601 }), "long");
  assert.equal(await keep(w, { source: "instagram", ref: "instagram:M1", seconds: 600 }), "kept", "ten minutes is in");
  assert.equal(calls.copies().length, 1);
});

test("a video whose road says no length is let in on what is known, and passed over only where the minutes are full", async () => {
  const some = world({ videos: [heldVideo(3599)] });
  stream();
  assert.equal(await keep(some), "kept", "its length is the video platform's to say, and it is judged then");
  const none = world({ videos: [heldVideo(3600)] });
  const calls = stream();
  assert.equal(await keep(none), "minutes");
  assert.equal(calls.length, 0);
});

test("room that went between the judging and the fetch: Stream's copy is let go, and the door's word stands", async () => {
  const w = world({ roomGoes: true });
  const calls = stream();
  assert.equal(await keep(w), "minutes");
  assert.deepEqual(
    calls.map((c) => [c.method, c.url]),
    [
      ["POST", `${STREAM_API}/copy`],
      ["DELETE", `${STREAM_API}/${UID}`],
    ],
  );
  assert.equal(w.tables.files.length, 0);
});

test("the database failing throws, and lets Stream's copy go only where no row holds it", async () => {
  const w = world();
  const calls = stream();
  world.throws = "connection reset";
  try {
    await assert.rejects(keep(w), /connection reset/);
  } finally {
    world.throws = undefined;
  }
  assert.ok(calls.some((c) => c.method === "DELETE"));
});

test("a read site's videos come as video items, each once, with the players it embeds counted", () => {
  const pages = [
    {
      url: "https://harbor.example/",
      html: `<video src="/a.mp4"></video><iframe src="https://www.youtube.com/embed/x1"></iframe>`,
    },
    { url: "https://harbor.example/work/", html: `<video src="/a.mp4"></video><video src="b.webm"></video>` },
  ];
  assert.deepEqual(siteVideosOf(pages), {
    items: [
      { url: "https://harbor.example/a.mp4", ref: "https://harbor.example/a.mp4", kind: "video" },
      { url: "https://harbor.example/work/b.webm", ref: "https://harbor.example/work/b.webm", kind: "video" },
    ],
    embedded: 1,
  });
});

/** A batch's job, as file_fetch carries it. */
const batch = (source, items) => ({
  id: "job-1",
  tenant_id: T,
  kind: "file_fetch",
  attempts: 1,
  payload: { source, batch: "b1", items },
});
/** The ledger's line a batch wrote: its road, its state and its counts. */
const lineOf = (w) => [w.notes.at(-1).p_source, w.notes.at(-1).p_state, w.notes.at(-1).p_counts, w.notes.at(-1).p_add];

test("a batch that brings a video keeps it and rings the bell in words that say videos", async () => {
  const w = world();
  stream();
  await fetchFiles(w.db, batch("website", [{ url: CLIP, ref: CLIP, kind: "video" }]), Date.now() + 30_000);
  assert.equal(w.tables.files.length, 1);
  assert.equal(w.tables.files[0].kind, "video");
  assert.equal(w.tables.notifications.length, 1);
  assert.equal(w.tables.notifications[0].title, "New photos and videos are waiting");
  // The website's line on the ledger: done, with what it kept, so the empty page stops saying Looking.
  assert.deepEqual(lineOf(w), ["website_media", "done", { photos: 0, videos: 1 }, true]);
});

test("ACCEPTANCE 26: a read of fifty reels cannot take a workspace past sixty minutes, each let in by its length", async () => {
  const w = world();
  const calls = stream();
  const reels = Array.from({ length: 50 }, (_, i) => ({
    url: `https://cdn.example/r${i}.mp4`,
    ref: `instagram:R${i}`,
    kind: "video",
    seconds: 90,
  }));
  await fetchFiles(w.db, batch("instagram", reels), Date.now() + 30_000);
  assert.ok(w.used() <= 3600, `${w.used()} seconds held`);
  assert.equal(w.tables.files.length, 40, "sixty minutes of ninety-second reels");
  assert.equal(calls.copies().length, 40, "the ten with no room cost no fetch");
  assert.deepEqual(lineOf(w), ["instagram", "done", { photos: 0, videos: 40, left_videos: 10 }, true]);
});

test("ACCEPTANCE 25: with the videos full, a batch passes its videos over, still brings its photos, and counts what it left", async () => {
  const w = world({ videos: [heldVideo(3600)] });
  const calls = stream();
  const pictures = {
    "https://cdn.example/p1.png": scenePng(900, 1200, (x, y) => [Math.round(255 * x), Math.round(255 * y), 90]),
    "https://cdn.example/p2.png": scenePng(1200, 900, (x, y) => [40, Math.round(200 * x), Math.round(255 * (1 - y))]),
  };
  const previous = setPublicFetch(
    async (url) => new Response(pictures[String(url)], { headers: { "content-type": "image/png" } }),
  );
  try {
    await fetchFiles(
      w.db,
      batch("instagram", [
        { url: "https://cdn.example/r1.mp4", ref: "instagram:R1", kind: "video", seconds: 30 },
        { url: "https://cdn.example/p1.png", ref: "instagram:P1" },
        { url: "https://cdn.example/r2.mp4", ref: "instagram:R2", kind: "video", seconds: 700 },
        { url: "https://cdn.example/r3.mp4", ref: "instagram:R3", kind: "video", seconds: 12 },
        { url: "https://cdn.example/r4.mp4", ref: "instagram:R4", kind: "video", seconds: 20 },
        { url: "https://cdn.example/p2.png", ref: "instagram:P2" },
      ]),
      Date.now() + 30_000,
    );
  } finally {
    setPublicFetch(previous);
  }
  assert.equal(calls.length, 0, "Stream is asked for none of them");
  assert.equal(w.found.length, 2, "both photos, the one behind the videos too, reach their door");
  assert.equal(w.bucket.uploaded.length, 2);
  assert.deepEqual(lineOf(w), ["instagram", "done", { photos: 2, videos: 0, left_videos: 3, long_videos: 1 }, true]);
  assert.equal(w.tables.notifications[0].title, "New photos are waiting", "the bell rings for what did come");
});

test("a full Library stops the batch as it did, and what it never reached is counted as left too", async () => {
  const w = world({ files: 1000 });
  const calls = stream();
  const reels = Array.from({ length: 9 }, (_, i) => ({
    url: `https://cdn.example/r${i}.mp4`,
    ref: `instagram:R${i}`,
    kind: "video",
    seconds: 20,
  }));
  await fetchFiles(w.db, batch("instagram", reels), Date.now() + 30_000);
  assert.equal(calls.length, 0);
  assert.equal(w.asked.length, 4, "the first four are asked side by side, and the batch stops there");
  assert.deepEqual(lineOf(w), ["instagram", "done", { photos: 0, videos: 0, left_files: 9 }, true]);
  assert.equal(
    w.tables.jobs.some((j) => j.kind === "file_fetch"),
    false,
    "nothing goes on as another job",
  );
});

test("the video platform's own storage spent: no other video of the batch is asked for, and the photos go on", async () => {
  const w = world();
  const calls = stream({ refuse: "Storage capacity exceeded" });
  const picture = scenePng(900, 1200, (x, y) => [Math.round(255 * x), 120, Math.round(255 * y)]);
  const previous = setPublicFetch(async () => new Response(picture, { headers: { "content-type": "image/png" } }));
  const video = (i) => ({ url: `https://cdn.example/r${i}.mp4`, ref: `instagram:R${i}`, kind: "video", seconds: 20 });
  try {
    await fetchFiles(
      w.db,
      batch("instagram", [
        video(1),
        video(2),
        video(3),
        video(4),
        video(5),
        { url: "https://cdn.example/p.png", ref: "instagram:P" },
      ]),
      Date.now() + 30_000,
    );
  } finally {
    setPublicFetch(previous);
  }
  assert.equal(calls.copies().length, 4, "the first part's four are asked side by side; the fifth is not asked for");
  assert.deepEqual(
    lineOf(w),
    ["instagram", "done", { photos: 1, videos: 0 }, true],
    "nothing is said to have been left: the Library is not what is full",
  );
});

test("a file that could not be kept is asked for again alone, so what the batch left is counted once", async () => {
  // Storage is down for the batch's first try at the photo, and up again after.
  let storageUp = false;
  const w = world({
    videos: [heldVideo(3600)],
    upload: async () => (storageUp ? { error: null } : { error: { message: "storage is down" } }),
  });
  stream();
  const picture = scenePng(900, 1200, (x, y) => [Math.round(255 * y), 80, Math.round(255 * x)]);
  const previous = setPublicFetch(async () => new Response(picture, { headers: { "content-type": "image/png" } }));
  try {
    await fetchFiles(
      w.db,
      batch("instagram", [
        { url: "https://cdn.example/r1.mp4", ref: "instagram:R1", kind: "video", seconds: 30 },
        { url: "https://cdn.example/p1.png", ref: "instagram:P1" },
      ]),
      Date.now() + 30_000,
    );
    assert.deepEqual(lineOf(w), ["instagram", "running", { photos: 0, videos: 0, left_videos: 1 }, true]);
    const [again] = w.tables.jobs.filter((j) => j.kind === "file_fetch");
    assert.deepEqual(again.payload.items, [{ url: "https://cdn.example/p1.png", ref: "instagram:P1" }]);
    storageUp = true;
    await fetchFiles(w.db, { ...again, attempts: 1 }, Date.now() + 30_000);
  } finally {
    setPublicFetch(previous);
  }
  assert.deepEqual(lineOf(w), ["instagram", "done", { photos: 1, videos: 0 }, true], "the reel is not counted again");
  const left = w.notes.reduce((n, note) => n + (note.p_counts.left_videos ?? 0), 0);
  assert.equal(left, 1, "one reel was left, and the line says one");
});

test("the video platform preparing as many as it takes: the video is asked for again a minute on, never passed over", async () => {
  const w = world();
  stream({ busy: true });
  await assert.rejects(keep(w), /preparing as many as it takes/, "not a pass: nothing is wrong with the video");
  const picture = scenePng(900, 1200, (x, y) => [Math.round(255 * x), Math.round(255 * y), 160]);
  const previous = setPublicFetch(async () => new Response(picture, { headers: { "content-type": "image/png" } }));
  const reel = { url: "https://cdn.example/r1.mp4", ref: "instagram:R1", kind: "video", seconds: 30 };
  try {
    await fetchFiles(
      w.db,
      batch("instagram", [reel, { url: "https://cdn.example/p1.png", ref: "instagram:P1" }]),
      Date.now() + 30_000,
    );
  } finally {
    setPublicFetch(previous);
  }
  assert.deepEqual(
    lineOf(w),
    ["instagram", "running", { photos: 1, videos: 0 }, true],
    "the photo came, and the read goes on",
  );
  const [again] = w.tables.jobs.filter((j) => j.kind === "file_fetch");
  assert.deepEqual(again.payload.items, [reel], "the reel alone, with its length");
});

test("a batch that goes on as its own job carries each reel's length with it", async () => {
  const w = world();
  stream();
  const reels = Array.from({ length: 6 }, (_, i) => ({
    url: `https://cdn.example/r${i}.mp4`,
    ref: `instagram:R${i}`,
    kind: "video",
    seconds: 15 + i,
  }));
  // The deadline has come: nothing is read, and the whole batch goes on.
  await fetchFiles(w.db, batch("instagram", reels), Date.now() - 1);
  const next = w.tables.jobs.find((j) => j.kind === "file_fetch");
  assert.deepEqual(next.payload.items, reels);
  assert.deepEqual(lineOf(w), ["instagram", "running", { photos: 0, videos: 0 }, true]);
});
