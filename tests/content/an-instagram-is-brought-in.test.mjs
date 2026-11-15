/**
 * A link brought in (apps/edge/lib/imports/bring-in.ts) and an Instagram account read (lib/imports/instagram-read.ts; 00626),
 * over a database in memory and a scraping platform that answers from memory: the door asks for a website's read or an
 * account's, each on the ledger first; the account's run started, asked after, and once done its own posts handed to
 * file_fetch, a carousel a slide each and a reel as a video; another account's post passed over; a run that failed said on
 * the ledger.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../_fake-db.mjs";
import { at } from "../_cron-doors-world.mjs";

process.env.APIFY_TOKEN = "apify-token-for-this-file";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

let answer = async (url) => {
  throw new Error(`nothing answers ${url}`);
};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => answer(String(url), init);

const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { bringInLink } = await import(at("apps/edge/lib/imports/bring-in.ts"));
const { instagramReader } = await import(at("apps/edge/lib/imports/instagram-read.ts"));
const readInstagram = (db, job) => instagramReader(db).read(job, Date.now() + 30_000);

after(() => {
  setPg(null);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const T = "aaaaaaaa-0000-4000-8000-000000000001";
const U = "bbbbbbbb-0000-4000-8000-000000000001";
const APIFY = "https://api.apify.com/v2";
const ok = (data) =>
  new Response(JSON.stringify({ data }), { status: 200, headers: { "content-type": "application/json" } });

function world() {
  const tables = { tenants: [{ id: T, name: "Harbor Salon", status: "active" }], jobs: [], imports: [] };
  const notes = [];
  const db = fakeDb(
    tables,
    {},
    {
      import_ledger_note: (a) => {
        notes.push(a);
        return null;
      },
    },
  );
  setPg(db);
  return { db, tables, notes };
}

const POSTS = [
  { type: "Image", shortCode: "A1", ownerUsername: "harborsalon", displayUrl: "https://cdn.example/a1.jpg" },
  {
    type: "Video",
    shortCode: "B2",
    ownerUsername: "harborsalon",
    displayUrl: "https://cdn.example/b2.jpg",
    videoUrl: "https://cdn.example/b2.mp4",
  },
  {
    type: "Sidecar",
    shortCode: "C3",
    ownerUsername: "HarborSalon",
    childPosts: [
      { type: "Image", displayUrl: "https://cdn.example/c3-0.jpg" },
      { type: "Video", displayUrl: "https://cdn.example/c3-1.jpg", videoUrl: "https://cdn.example/c3-1.mp4" },
    ],
  },
  { type: "Image", shortCode: "D4", ownerUsername: "someone_else", displayUrl: "https://cdn.example/d4.jpg" },
];

test("the door asks for an Instagram's read, the ledger first, under its handle", async () => {
  const w = world();
  const res = await bringInLink(
    { ok: true, via: "token", workspace: T, user: U },
    { tenant_id: T, link: "instagram.com/HarborSalon" },
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).fate, "instagram");
  assert.deepEqual([w.notes[0].p_source, w.notes[0].p_state, w.notes[0].p_via], ["instagram", "queued", "harborsalon"]);
  const job = w.tables.jobs.find((j) => j.kind === "instagram_read");
  assert.deepEqual([job.payload.handle, job.payload.step], ["harborsalon", "start"]);
});

test("the door asks for a website's read with its photos, and refuses a player's link in words", async () => {
  const w = world();
  const res = await bringInLink(
    { ok: true, via: "token", workspace: T, user: U },
    { tenant_id: T, link: "harbor.example" },
  );
  assert.equal((await res.json()).fate, "website");
  assert.equal(w.notes[0].p_source, "website_media");
  assert.equal(w.tables.jobs.find((j) => j.kind === "website_read").payload.url, "https://harbor.example/");
  const refused = await bringInLink(
    { ok: true, via: "token", workspace: T, user: U },
    { tenant_id: T, link: "https://youtu.be/x" },
  );
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).detail, /YouTube or Vimeo/);
});

test("a read starts its run, asks after it while it runs, and hands the account's posts to file_fetch once done", async () => {
  const w = world();
  let status = "RUNNING";
  const calls = [];
  answer = async (url, init = {}) => {
    calls.push([init.method ?? "GET", url.split("?")[0]]);
    if (url.startsWith(`${APIFY}/actors/apify~instagram-scraper/runs`))
      return ok({ id: "run-1", status: "READY", defaultDatasetId: "ds-1" });
    if (url.startsWith(`${APIFY}/actor-runs/run-1`)) return ok({ id: "run-1", status, defaultDatasetId: "ds-1" });
    if (url.startsWith(`${APIFY}/datasets/ds-1/items`))
      return new Response(JSON.stringify(POSTS), {
        status: 200,
        headers: { "content-type": "application/json", "x-apify-pagination-total": "4" },
      });
    throw new Error(`nothing answers ${url}`);
  };
  const job = (payload) => ({ id: "j", tenant_id: T, kind: "instagram_read", attempts: 1, payload });
  await readInstagram(w.db, job({ handle: "harborsalon", step: "start", try: "0" }));
  const started = calls.find(([m]) => m === "POST");
  assert.ok(started, "the run is started");
  const next = w.tables.jobs.find((j) => j.kind === "instagram_read" && j.payload.step === "collect");
  assert.deepEqual([next.payload.run_id, next.payload.dataset_id, next.payload.try], ["run-1", "ds-1", "1"]);
  assert.equal(w.notes.at(-1).p_state, "running");

  await readInstagram(w.db, job(next.payload));
  assert.ok(
    w.tables.jobs.some((j) => j.kind === "instagram_read" && j.payload.try === "2"),
    "still running: asked after again",
  );

  status = "SUCCEEDED";
  await readInstagram(w.db, job({ ...next.payload, try: "2" }));
  const fetch = w.tables.jobs.find((j) => j.kind === "file_fetch");
  assert.equal(fetch.payload.source, "instagram");
  // A post's picture, a reel as a video, a carousel a slide each, and only the account's own: another's post is passed over.
  assert.deepEqual(fetch.payload.items, [
    { url: "https://cdn.example/a1.jpg", ref: "instagram:A1" },
    { url: "https://cdn.example/b2.mp4", ref: "instagram:B2", kind: "video" },
    { url: "https://cdn.example/c3-0.jpg", ref: "instagram:C3:0" },
    { url: "https://cdn.example/c3-1.mp4", ref: "instagram:C3:1", kind: "video" },
  ]);
});

test("a run that failed is said on the ledger, and no key is said too", async () => {
  const w = world();
  answer = async (url) => {
    if (url.startsWith(`${APIFY}/actor-runs/run-9`))
      return ok({ id: "run-9", status: "FAILED", defaultDatasetId: "ds-9" });
    throw new Error(`nothing answers ${url}`);
  };
  await readInstagram(w.db, {
    id: "j",
    tenant_id: T,
    kind: "instagram_read",
    attempts: 1,
    payload: { handle: "harborsalon", step: "collect", try: "3", run_id: "run-9", dataset_id: "ds-9" },
  });
  assert.deepEqual([w.notes.at(-1).p_state, w.notes.at(-1).p_source], ["failed", "instagram"]);
  const token = process.env.APIFY_TOKEN;
  delete process.env.APIFY_TOKEN;
  try {
    await readInstagram(w.db, {
      id: "j",
      tenant_id: T,
      kind: "instagram_read",
      attempts: 1,
      payload: { handle: "harborsalon", step: "start", try: "0" },
    });
  } finally {
    process.env.APIFY_TOKEN = token;
  }
  assert.match(w.notes.at(-1).p_error, /can't be read/);
});
