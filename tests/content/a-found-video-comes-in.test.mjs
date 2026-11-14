/**
 * A found video comes in (apps/edge/lib/files/found-video.ts and found.ts; 00626), over a database in memory and a web that
 * answers from memory: what a website plays, fetched by Stream from its address and kept once, at the road's status; a twin or
 * one a person let go never fetched again; a workspace that takes no videos passed over; Stream's copy let go where no row
 * holds it; and a batch that brings a video rings the bell in those words.
 */
import { test, after, beforeEach } from "node:test";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";
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

function world({ takesVideos = true, full = false } = {}) {
  const tables = {
    tenants: [{ id: T, name: "Harbor Salon", timezone: "America/New_York", status: "active" }],
    tenant_config: takesVideos ? [{ tenant_id: T, config: { features: { video_preview: true } } }] : [],
    files: [],
    files_let_go: [],
    notifications: [],
    jobs: [],
    events: [],
  };
  const asked = [];
  const notes = [];
  const db = fakeDb(
    tables,
    {},
    {
      // The ledger's line for the road's run (imports, 00626): the found-files job notes what it kept.
      import_ledger_note: (a) => {
        notes.push(a);
        return null;
      },
      // 00626's order: asked again, twin, let go, room.
      file_video_found: (a) => {
        asked.push(a);
        if (world.throws) throw new Error(world.throws);
        if (tables.files.some((f) => f.id === a.p_id)) return { fate: "kept", file_id: a.p_id };
        const twin = tables.files.find((f) => f.fingerprint === a.p_fingerprint && !f.removed_at);
        if (twin) return { fate: "here", file_id: twin.id };
        if (full) return { fate: "minutes", file_id: null };
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
          removed_at: null,
        });
        return { fate: "kept", file_id: a.p_id };
      },
    },
  );
  setPg(db);
  return { db, tables, asked, notes };
}

/** Stream: a copy asked for answers its video; a delete is answered too. Each call is kept. */
function stream({ refuse = null } = {}) {
  const calls = [];
  answer = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : null });
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
  return calls;
}

const keep = (w, over = {}) =>
  keepFoundVideo(w.db, T, { source: "website", status: "inbox", url: CLIP, ref: CLIP, name: "cut", ...over });

test("a found video is fetched by Stream from its address and kept once, at its road's status", async () => {
  const w = world();
  const calls = stream();
  assert.equal(await keep(w), "kept");
  const copy = calls.find((c) => c.url === `${STREAM_API}/copy`);
  assert.equal(copy.method, "POST");
  assert.equal(copy.body.url, CLIP);
  assert.equal(copy.body.requireSignedURLs, true);
  assert.equal(copy.body.meta.name, w.asked[0].p_id, "the webhook finds the row by our id, as an upload's");
  assert.deepEqual(
    {
      status: w.asked[0].p_status,
      source: w.asked[0].p_source,
      ref: w.asked[0].p_source_ref,
      media: w.asked[0].p_media_ref,
      mime: w.asked[0].p_mime,
      print: w.asked[0].p_fingerprint,
    },
    {
      status: "inbox",
      source: "website",
      ref: CLIP,
      media: UID,
      mime: "video/mp4",
      print: foundVideoPrintOf("website", CLIP),
    },
  );
  assert.equal(await keep(w), "here", "the same video found again");
  assert.equal(calls.filter((c) => c.url === `${STREAM_API}/copy`).length, 1, "and Stream is not asked twice");
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

test("Stream refusing an address is a pass; its storage spent is no room", async () => {
  const w = world();
  stream({ refuse: "Invalid URL" });
  assert.equal(await keep(w), "passed");
  stream({ refuse: "Storage capacity exceeded" });
  assert.equal(await keep(w), "full");
  assert.equal(w.asked.length, 0);
});

test("no room in the workspace's minutes: Stream's copy is let go, and the answer says full", async () => {
  const w = world({ full: true });
  const calls = stream();
  assert.equal(await keep(w), "full");
  assert.deepEqual(
    calls.map((c) => [c.method, c.url]),
    [
      ["POST", `${STREAM_API}/copy`],
      ["DELETE", `${STREAM_API}/${UID}`],
    ],
  );
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

test("a batch that brings a video keeps it and rings the bell in words that say videos", async () => {
  const w = world();
  stream();
  const job = {
    id: "job-1",
    tenant_id: T,
    kind: "file_fetch",
    attempts: 1,
    payload: { source: "website", batch: "b1", items: [{ url: CLIP, ref: CLIP, kind: "video" }] },
  };
  await fetchFiles(w.db, job, Date.now() + 30_000);
  assert.equal(w.tables.files.length, 1);
  assert.equal(w.tables.files[0].kind, "video");
  assert.equal(w.tables.notifications.length, 1);
  assert.equal(w.tables.notifications[0].title, "New photos and videos are waiting");
  // The website's line on the ledger: done, with what it kept, so the empty page stops saying Looking.
  assert.deepEqual(
    [w.notes[0].p_source, w.notes[0].p_state, w.notes[0].p_counts, w.notes[0].p_add],
    ["website_media", "done", { photos: 0, videos: 1 }, true],
  );
});
