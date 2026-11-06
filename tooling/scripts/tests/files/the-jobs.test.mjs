/**
 * What the edge does with a business's files (apps/edge/lib/files/, decision 0099), run over a database in memory and a web
 * that answers from memory: a look, read through a copy the model is sent by id and answered in code; a removed file let go;
 * bytes that never became a file given up on; what an import finds, kept once; a profile's photos brought a page at a time; and
 * the sweep, which brings back a look that failed and finishes a removal.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetBreakers, setPublicFetch } from "@chanlytics/channels";
import { fakeDb } from "../_fake-db.mjs";
import { squarePng } from "../look/_png.mjs";
import { at } from "../_cron-doors-world.mjs";
import { scripted, said, json } from "../ai/_model-world.mjs";

process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
process.env.GOOGLE_PLACES_API_KEY = "places-key-for-this-file";
Object.assign(process.env, {
  GOOGLE_OAUTH_CLIENT_ID: "cid",
  GOOGLE_OAUTH_CLIENT_SECRET: "secret",
  GOOGLE_OAUTH_REDIRECT_URI: "https://app.example.com/cb",
});
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

// Set before the modules load, since Google's transport takes its fetch as it is made.
let answer = async (url) => {
  throw new Error(`nothing answers ${url}`);
};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => answer(String(url), init);

const { setPg } = await import(at("apps/edge/lib/pg.ts"));
const { setModelFetch } = await import(at("apps/edge/lib/model.ts"));
const { askForFoundFiles, askForListingPhotos, keepFoundFile, sitePhotosOf } = await import(
  at("apps/edge/lib/files/found.ts")
);
const { fileJobs, keepFilesMoving } = await import(at("apps/edge/lib/files/upkeep.ts"));
const { fileCopies } = await import(at("apps/edge/lib/files/copies.ts"));
const { historyImports } = await import(at("apps/edge/lib/imports/history-import.ts"));
const { importAgain } = await import(at("apps/edge/lib/imports/import-again.ts"));

const previous = setPublicFetch((url, init) => answer(String(url), init));
after(() => {
  setPg(null);
  setModelFetch(null);
  setPublicFetch(previous);
  globalThis.fetch = realFetch;
});
beforeEach(() => resetBreakers());

const T = "aaaaaaaa-0000-4000-8000-000000000001";
const F = "ffffffff-0000-4000-8000-000000000001";
const U = "bbbbbbbb-0000-4000-8000-000000000001";
const PATH = `${T}/${F}/original.jpg`;
const PICTURE = squarePng(600);
const png = () => new Response(PICTURE, { status: 200, headers: { "content-type": "image/png" } });
const ok = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

const fileRow = (over = {}) => ({
  id: F,
  tenant_id: T,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: "img-2041",
  owner_named: false,
  mime: "image/jpeg",
  bytes: 1000,
  width: 1200,
  height: 900,
  fingerprint: "fp-1",
  claude_copy: null,
  look: null,
  look_status: "waiting",
  shows: null,
  owner_shelved: false,
  who_in_it: "not_asked",
  created_by: null,
  look_edition: null,
  looked_at: "2026-11-05T12:00:00Z",
  created_at: "2026-11-05T12:00:00Z",
  updated_at: "2026-11-05T12:00:00Z",
  removed_at: null,
  ...over,
});

/** The database and the bucket the jobs find. */
function world({ files = [fileRow()], upload = null } = {}) {
  const tables = {
    tenants: [{ id: T, name: "Harbor Moving", timezone: "America/New_York", status: "active" }],
    tenant_config: [],
    billing_accounts: [{ tenant_id: T, mode: "stripe", status: "active" }],
    files,
    files_let_go: [],
    notifications: [],
    jobs: [],
    imports: [],
    ai_usage: [],
    events: [],
    google_connections: [],
  };
  const kept = [];
  const purged = [];
  const found = [];
  const notes = [];
  const db = fakeDb(
    tables,
    {},
    {
      file_look_keep: (a) => {
        kept.push(a);
        return null;
      },
      file_purged: (a) => {
        purged.push(a);
        tables.files = tables.files.filter((f) => f.id !== a.p_id);
        return null;
      },
      file_listing_aside: () => {
        let moved = 0;
        for (const f of tables.files) {
          if (f.source !== "google_listing" || f.status !== "inbox" || f.owner_named || f.owner_shelved) continue;
          f.status = "set_aside";
          moved++;
        }
        return moved;
      },
      // The door's own order, as 00551 writes it.
      file_found: (a) => {
        found.push(a);
        if (world.foundThrows) throw new Error(world.foundThrows);
        if (tables.files.some((f) => f.id === a.p_id)) return { fate: "kept", file_id: a.p_id };
        const twin = tables.files.find((f) => f.fingerprint === a.p_fingerprint && !f.removed_at);
        if (twin) {
          if (a.p_source === "upload" || (a.p_status === "filed" && twin.status === "inbox")) twin.status = "filed";
          if (a.p_source === "google_profile" && twin.source === "google_listing") {
            twin.source = a.p_source;
            twin.source_ref = a.p_source_ref;
          }
          return { fate: "here", file_id: twin.id };
        }
        if (a.p_source !== "upload" && tables.files_let_go.some((g) => g.fingerprint === a.p_fingerprint)) {
          return { fate: "here", file_id: null };
        }
        if (world.fullAt !== undefined && tables.files.filter((f) => !f.removed_at).length >= world.fullAt) {
          return { fate: "full", file_id: null };
        }
        tables.files.push(
          fileRow({
            id: a.p_id,
            fingerprint: a.p_fingerprint,
            name: a.p_name,
            source: a.p_source,
            source_ref: a.p_source_ref,
            status: a.p_status,
            created_by: a.p_actor ?? null,
          }),
        );
        return { fate: "kept", file_id: a.p_id };
      },
      get_google_credentials: () => ({
        refresh_token: "rt",
        access_token: "at",
        expires_at: Date.now() + 86_400_000,
        scope: "https://www.googleapis.com/auth/business.manage",
      }),
      import_ledger_note: (a) => {
        notes.push(a);
        const i = tables.imports.findIndex((r) => r.source === a.p_source);
        const was = i >= 0 ? tables.imports[i] : {};
        const row = {
          ...was,
          tenant_id: a.p_tenant_id,
          source: a.p_source,
          state: a.p_state,
          counts: a.p_counts ?? {},
          job_cursor: a.p_cursor ?? was.job_cursor ?? null,
          connection_id: null,
          run: a.p_run ?? was.run ?? null,
          via: a.p_via ?? was.via ?? null,
        };
        if (i >= 0) tables.imports[i] = row;
        else tables.imports.push(row);
        return null;
      },
    },
  );
  const bucket = { uploaded: [], removed: [], listed: [] };
  db.storage = {
    from: () => ({
      createSignedUrl: async (path) => ({ data: { signedUrl: `https://storage.example/${path}` }, error: null }),
      upload: async (path, bytes) => {
        if (upload) return upload(path, bytes);
        bucket.uploaded.push(path);
        return { error: null };
      },
      remove: async (paths) => {
        bucket.removed.push(...paths);
        return { error: null };
      },
      list: async (folder) => {
        bucket.listed.push(folder);
        return { data: [{ name: "original.jpg" }], error: null };
      },
    }),
  };
  setPg(db);
  return { db, tables, kept, purged, found, notes, bucket };
}

/** The web the copy goes through: Storage's resize, Anthropic's Files API. `on` may step in before a call answers. */
function theWeb(on = {}) {
  const calls = [];
  answer = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET" });
    if (on[url]) return on[url](init);
    if (url.startsWith("https://storage.example/")) return png();
    if (url === "https://api.anthropic.com/v1/files") return ok({ id: "file_abc", expires_at: "2027-02-01T00:00:00Z" });
    if (url.startsWith("https://api.anthropic.com/v1/files/")) return ok({ id: "file_abc" });
    throw new Error(`nothing answers ${url}`);
  };
  return calls;
}

const LOOK = {
  line: "A shopfront at dusk.",
  name: "storefront-dusk",
  shows: "storefront",
  people: { count: 0, recognizable: 0 },
  text_seen: [],
  quality: { sharp: "good", light: "ok" },
  subject_box: [0, 0, 300, 300],
  colors: [],
  issues: [],
  looks_like_stock: false,
};
const job = (kind, payload) => ({ id: "job-1", tenant_id: T, kind, payload, attempts: 1 });
const lookJob = () => job("file_look", { file_id: F, edition: "1" });
const SOON = () => Date.now() + 30_000;

test("a look: a copy goes up, the model reads it by id at the size it came back, and what it saw is kept in code", async () => {
  const w = world();
  const web = theWeb();
  const api = scripted(json(LOOK));
  setModelFetch(api.fetch);
  await fileJobs(w.db).look(lookJob(), SOON());

  assert.equal(web.filter((c) => c.url === "https://api.anthropic.com/v1/files").length, 1);
  const [image, words] = api.calls[0].body.messages[0].content;
  assert.deepEqual(image.source, { type: "file", file_id: "file_abc" });
  assert.match(words.text, /600x600 pixels/);
  assert.deepEqual(w.tables.files[0].claude_copy, {
    id: "file_abc",
    expires_at: "2027-02-01T00:00:00Z",
    width: 600,
    height: 600,
  });
  assert.equal(w.kept[0].p_status, "done");
  assert.equal(w.kept[0].p_name, "storefront-dusk");
  assert.equal(w.kept[0].p_shows, "storefront");
  assert.deepEqual(w.kept[0].p_look.people, { count: 0, recognizable: 0 });
  assert.deepEqual(w.kept[0].p_look.subject, [0, 0, 0.5, 0.5]);
  assert.equal(w.tables.ai_usage[0].purpose, "file_look");
});

test("a look is on the ledger under who added the file and about that file, and an import under nobody", async () => {
  const w = world({ files: [fileRow({ created_by: U })] });
  theWeb();
  setModelFetch(scripted(json(LOOK)).fetch);
  await fileJobs(w.db).look(lookJob(), SOON());
  assert.equal(w.tables.ai_usage[0].user_id, U);
  assert.equal(w.tables.ai_usage[0].subject_id, F);

  const nobody = world({ files: [fileRow({ source: "website" })] });
  theWeb();
  setModelFetch(scripted(json(LOOK)).fetch);
  await fileJobs(nobody.db).look(lookJob(), SOON());
  assert.equal(nobody.tables.ai_usage[0].user_id, null);
});

test("the copy the model reads is asked for a little sharper than Storage's default, so small print can be read", async () => {
  const w = world();
  const asked = [];
  const sign = w.db.storage.from().createSignedUrl;
  w.db.storage = { from: () => ({ createSignedUrl: (path, s, o) => (asked.push(o), sign(path, s, o)) }) };
  theWeb();
  setModelFetch(scripted(json(LOOK)).fetch);
  await fileJobs(w.db).look(lookJob(), SOON());
  assert.equal(asked[0].transform.quality, 90);
});

test("a copy already held is read again, not uploaded again; one about to expire is replaced", async () => {
  const held = { id: "file_held", expires_at: "2099-01-01T00:00:00Z", width: 600, height: 600 };
  const w = world({ files: [fileRow({ claude_copy: held })] });
  const web = theWeb();
  const api = scripted(json(LOOK));
  setModelFetch(api.fetch);
  await fileJobs(w.db).look(lookJob(), SOON());
  assert.equal(web.length, 0, "nothing fetched and nothing uploaded");
  assert.equal(api.calls[0].body.messages[0].content[0].source.file_id, "file_held");

  const soon = { ...held, expires_at: new Date(Date.now() + 3_600_000).toISOString() };
  const w2 = world({ files: [fileRow({ claude_copy: soon })] });
  const web2 = theWeb();
  setModelFetch(scripted(json(LOOK)).fetch);
  await fileJobs(w2.db).look(lookJob(), SOON());
  assert.equal(web2.filter((c) => c.url === "https://api.anthropic.com/v1/files").length, 1);
});

test("a refusal is an answer, kept as one; an answer it cannot read is a failed look, for the sweep to try", async () => {
  const w = world();
  theWeb();
  setModelFetch(scripted(said("", { stop_reason: "refusal" })).fetch);
  await fileJobs(w.db).look(lookJob(), SOON());
  assert.equal(w.kept[0].p_status, "refused");
  assert.equal(w.kept[0].p_name, null);

  const w2 = world();
  theWeb();
  setModelFetch(scripted(said("no JSON here")).fetch);
  await fileJobs(w2.db).look(lookJob(), SOON());
  assert.equal(w2.kept[0].p_status, "failed");
});

test("a look of nothing: a file removed, or gone, costs no model call", async () => {
  for (const files of [[fileRow({ removed_at: "2026-11-05T12:00:00Z" })], []]) {
    const w = world({ files });
    theWeb();
    const api = scripted(json(LOOK));
    setModelFetch(api.fetch);
    await fileJobs(w.db).look(lookJob(), SOON());
    assert.equal(api.calls.length, 0);
    assert.equal(w.kept.length, 0);
  }
});

test("with no time left a look does not start: the ledger tries it again, and nothing is paid for", async () => {
  const w = world();
  theWeb();
  const api = scripted(json(LOOK));
  setModelFetch(api.fetch);
  await assert.rejects(fileJobs(w.db).look(lookJob(), Date.now() - 1), /no time left/);
  assert.equal(api.calls.length, 0);
});

test("a workspace that may not pay keeps its files and has them not read: nothing fetched, nothing uploaded, nothing thrown", async () => {
  const w = world();
  w.tables.billing_accounts[0].status = "canceled";
  const web = theWeb();
  const api = scripted(json(LOOK));
  setModelFetch(api.fetch);
  await fileJobs(w.db).look(lookJob(), SOON());
  assert.equal(api.calls.length, 0);
  assert.equal(web.length, 0, "no resize paid for, and no copy sent");
  assert.equal(w.kept[0].p_status, "failed", "it stops saying Looking, and the sweep brings it back");
  assert.equal(w.kept[0].p_look, null);
});

test("a file removed while its copy went up: the copy is deleted at once, since no purge will ever see it", async () => {
  const w = world();
  const web = theWeb({
    "https://api.anthropic.com/v1/files": () => {
      w.tables.files[0].removed_at = "2026-11-05T12:00:00Z";
      return ok({ id: "file_late", expires_at: "2027-02-01T00:00:00Z" });
    },
  });
  setModelFetch(scripted(json(LOOK)).fetch);
  await assert.rejects(fileJobs(w.db).look(lookJob(), SOON()), /no copy/);
  assert.equal(w.tables.files[0].claude_copy, null);
  assert.ok(web.some((c) => c.method === "DELETE" && c.url.endsWith("/v1/files/file_late")));
});

const purgeJob = () => job("file_purge", { file_id: F, why: "remove" });

test("a removed file: its folder emptied, Anthropic's copy deleted, and only then its row gone", async () => {
  const copy = { id: "file_held", expires_at: "2099-01-01T00:00:00Z", width: 1, height: 1 };
  const w = world({ files: [fileRow({ removed_at: "2026-11-05T12:00:00Z", claude_copy: copy })] });
  const web = theWeb();
  await fileJobs(w.db).purge(purgeJob());
  assert.deepEqual(w.bucket.listed, [`${T}/${F}`]);
  assert.deepEqual(w.bucket.removed, [PATH]);
  assert.ok(web.some((c) => c.method === "DELETE" && c.url.endsWith("/v1/files/file_held")));
  assert.equal(w.purged.length, 1);
  assert.equal(w.tables.files.length, 0);
});

test("a copy Anthropic would not let go leaves the row, so the ledger tries again", async () => {
  const copy = { id: "file_held", expires_at: "2099-01-01T00:00:00Z", width: 1, height: 1 };
  const w = world({ files: [fileRow({ removed_at: "2026-11-05T12:00:00Z", claude_copy: copy })] });
  theWeb({
    "https://api.anthropic.com/v1/files/file_held": () => new Response("{}", { status: 403 }),
  });
  await assert.rejects(fileJobs(w.db).purge(purgeJob()), /copy stayed/);
  assert.equal(w.purged.length, 0);
});

test("with no key to reach Anthropic a copy holds its row, rather than being forgotten there for 90 days", async () => {
  const copy = { id: "file_held", expires_at: "2099-01-01T00:00:00Z", width: 1, height: 1 };
  const w = world({ files: [fileRow({ removed_at: "2026-11-05T12:00:00Z", claude_copy: copy })] });
  theWeb();
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(fileJobs(w.db).purge(purgeJob()), /no key/);
  } finally {
    process.env.ANTHROPIC_API_KEY = key;
  }
  assert.equal(w.purged.length, 0);
});

test("the purge an upload leaves itself: bytes that never became a file go, and a file is left alone", async () => {
  const never = world({ files: [] });
  theWeb();
  await fileJobs(never.db).purge(job("file_purge", { file_id: F, why: "start" }));
  assert.deepEqual(never.bucket.removed, [PATH], "its folder emptied");
  assert.equal(never.purged.length, 0, "and no row to take");

  const arrived = world({ files: [fileRow({ status: "filed" })] });
  theWeb();
  await fileJobs(arrived.db).purge(job("file_purge", { file_id: F, why: "start" }));
  assert.equal(arrived.tables.files.length, 1);
  assert.deepEqual(arrived.bucket.removed, []);
  assert.equal(arrived.purged.length, 0);
});

const FOUND = { url: "https://harbor.example/shop.png", ref: "https://harbor.example/shop.png" };
const foundIt = (w, file = FOUND) => keepFoundFile(w.db, T, { source: "website", status: "inbox", file });

test("a found picture is kept once: new, then here, and its bytes stored only for a row that holds them", async () => {
  const w = world({ files: [] });
  answer = async () => png();
  assert.equal(await foundIt(w), "kept");
  assert.equal(w.found[0].p_status, "inbox");
  assert.equal(w.found[0].p_name, "shop");
  assert.equal(w.found[0].p_actor, undefined, "an import was nobody's press");
  assert.equal(w.bucket.uploaded.length, 1);
  assert.equal(await foundIt(w), "here", "the same bytes again");
  assert.equal(w.bucket.uploaded.length, 1);
  assert.equal(w.found.length, 1, "the door isn't asked again by a road that only offers");
});

test("what a person removed is not brought back, and costs no bytes", async () => {
  const w = world({ files: [] });
  answer = async () => png();
  assert.equal(await foundIt(w), "kept");
  w.tables.files_let_go.push({ tenant_id: T, fingerprint: w.tables.files[0].fingerprint });
  w.tables.files = [];
  assert.equal(await foundIt(w), "here");
  assert.equal(w.bucket.uploaded.length, 1);
});

test("a full workspace keeps nothing more: the bytes go, and the answer says why", async () => {
  const w = world({ files: [] });
  world.fullAt = 0;
  try {
    answer = async () => png();
    assert.equal(await foundIt(w), "full");
  } finally {
    world.fullAt = undefined;
  }
  assert.equal(w.bucket.uploaded.length, 1);
  assert.deepEqual(w.bucket.removed, w.bucket.uploaded);
});

test("a profile's word files a twin that only waited, and takes over from what a listing offered, with no second bytes", async () => {
  const w = world({ files: [] });
  answer = async () => png();
  assert.equal(await foundIt(w), "kept");
  const onSite = w.tables.files[0];
  onSite.source = "google_listing";
  const profile = { source: "google_profile", status: "filed", file: { url: "https://lh3.example/p", ref: "m/1" } };
  assert.equal(await keepFoundFile(w.db, T, profile), "here");
  assert.equal(onSite.status, "filed");
  assert.equal(onSite.source, "google_profile");
  assert.equal(onSite.source_ref, "m/1");
  assert.equal(w.bucket.uploaded.length, 1);
});

test("a small picture is the website's furniture, and Google's own, which it takes from 250 pixels, is kept", async () => {
  const small = squarePng(300);
  answer = async () => new Response(small, { status: 200 });
  const w = world({ files: [] });
  assert.equal(await foundIt(w), "passed");
  const fromGoogle = { source: "google_profile", status: "filed", file: { url: "https://lh3.example/p", ref: "m/1" } };
  assert.equal(await keepFoundFile(w.db, T, fromGoogle), "kept");
});

test("a picture too small, unreadable or missing is passed over, and nothing is stored", async () => {
  const w = world({ files: [] });
  answer = async () => new Response(squarePng(80), { status: 200 });
  assert.equal(await foundIt(w), "passed");
  answer = async () => new Response("<html>not a picture</html>", { status: 200 });
  assert.equal(await foundIt(w), "passed");
  answer = async () => new Response("gone", { status: 404 });
  assert.equal(await foundIt(w), "passed");
  assert.equal(w.bucket.uploaded.length, 0);
});

test("Storage or the database failing throws, and leaves no bytes behind with no row to find them", async () => {
  const refused = world({ files: [], upload: async () => ({ error: { message: "storage is down" } }) });
  answer = async () => png();
  await assert.rejects(foundIt(refused), /storage is down/);

  const w = world({ files: [] });
  answer = async () => png();
  world.foundThrows = "the door failed";
  try {
    await assert.rejects(foundIt(w), /door/);
  } finally {
    world.foundThrows = null;
  }
  assert.equal(w.bucket.removed.length, 1, "what was stored for it is removed");
});

test("a batch that runs out of time goes on as a job of its own, and a bad picture does not stop it", async () => {
  const w = world({ files: [] });
  answer = async () => new Response("gone", { status: 404 });
  const items = Array.from({ length: 6 }, (_, i) => ({ url: `https://harbor.example/${i}.jpg`, ref: `r${i}` }));
  await fileJobs(w.db).fetch(job("file_fetch", { source: "website", batch: "b1", items }), Date.now() - 1);
  const next = w.tables.jobs.filter((j) => j.kind === "file_fetch");
  assert.equal(next.length, 1);
  assert.equal(next[0].payload.items.length, 6);
  assert.notEqual(next[0].payload.batch, "b1");
  assert.equal(next[0].payload.rang, undefined);
  assert.equal(w.tables.notifications.length, 0, "nothing waits on anyone yet");
});

const distinctPictures = (url) =>
  new Response(squarePng(500 + Number(/(\d+)\.jpg/.exec(url)?.[1] ?? 0)), { status: 200 });
const fetched = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://harbor.example/${i}.jpg`, ref: `r${i}` }));

test("a batch that keeps something rings the bell once, and says so to what comes after it", async () => {
  const w = world({ files: [] });
  answer = async (url) => distinctPictures(url);
  await fileJobs(w.db).fetch(job("file_fetch", { source: "website", batch: "b1", items: fetched(3) }), SOON());
  assert.equal(w.tables.files.length, 3);
  assert.deepEqual(
    w.tables.notifications.map((n) => [n.kind, n.route]),
    [["files_waiting", "admin/files"]],
  );
  assert.doesNotMatch(
    w.tables.notifications[0].body,
    /\d/,
    "a number written now would be wrong by the time it is read",
  );

  const after = world({ files: [] });
  answer = async (url) => distinctPictures(url);
  await fileJobs(after.db).fetch(
    job("file_fetch", { source: "website", batch: "b2", rang: true, items: fetched(3) }),
    SOON(),
  );
  assert.equal(after.tables.notifications.length, 0, "told once for the whole of what was found");
});

test("the rest of a batch that rang carries that it rang", async () => {
  const w = world({ files: [] });
  answer = async (url) => distinctPictures(url);
  // One group's time, and no more: the deadline passes while the first four are read.
  let deadline = SOON();
  const reading = answer;
  answer = async (url) => {
    deadline = Date.now() - 1;
    return reading(url);
  };
  const clock = { valueOf: () => deadline };
  await fileJobs(w.db).fetch(job("file_fetch", { source: "website", batch: "b1", items: fetched(6) }), clock);
  const [next] = w.tables.jobs.filter((j) => j.kind === "file_fetch");
  assert.equal(next.payload.items.length, 2);
  assert.equal(next.payload.rang, true);
});

test("Storage failing part way: what was kept stays, the bell has rung, and the ledger tries again", async () => {
  let uploads = 0;
  const w = world({
    files: [],
    upload: async () => (++uploads === 2 ? { error: { message: "storage is down" } } : { error: null }),
  });
  answer = async (url) => distinctPictures(url);
  const running = job("file_fetch", { source: "website", batch: "b1", items: fetched(2) });
  await assert.rejects(fileJobs(w.db).fetch(running, SOON()), /1 of 2 could not be kept/);
  assert.equal(w.tables.files.length, 1, "the one that made it stays");
  assert.equal(w.tables.notifications.length, 1, "and it waits on someone, whatever happens to the other");
});

test("Google refusing one name is a pass, not a failure: a name can expire, and asking again would not change it", async () => {
  const w = world({ files: [] });
  answer = async () => new Response("{}", { status: 404 });
  const items = [{ url: "places/p/photos/old", ref: "places/p/photos/old" }];
  await fileJobs(w.db).fetch(job("file_fetch", { source: "google_listing", batch: "b1", items }), SOON());
  assert.equal(w.tables.files.length, 0);
  assert.equal(w.tables.notifications.length, 0);
});

test("a full workspace stops the batch: nothing more is read, and nothing more is asked for", async () => {
  const w = world({ files: [] });
  world.fullAt = 0;
  try {
    answer = async (url) => distinctPictures(url);
    await fileJobs(w.db).fetch(job("file_fetch", { source: "website", batch: "b1", items: fetched(9) }), SOON());
  } finally {
    world.fullAt = undefined;
  }
  assert.equal(w.found.length, 4, "the group it found out in, and no other");
  assert.equal(w.tables.jobs.filter((j) => j.kind === "file_fetch").length, 0);
});

test("a road nothing here knows is refused, and the job says which", async () => {
  const w = world({ files: [] });
  await assert.rejects(
    fileJobs(w.db).fetch(job("file_fetch", { source: "dropbox", batch: "b", items: [] }), SOON()),
    /dropbox/,
  );
});

test("a listing brings only what the business itself put there, to the Inbox, since linking one proves nothing", async () => {
  const w = world({ files: [] });
  await askForListingPhotos(w.db, T, {
    name: "Harbor Móving",
    photos: [
      { name: "places/p/photos/own", author: "harbor moving " },
      { name: "places/p/photos/customer", author: "A Customer" },
      { name: "places/p/photos/nobody", author: null },
    ],
  });
  const [asked] = w.tables.jobs.filter((j) => j.kind === "file_fetch");
  assert.deepEqual(asked.payload.items, [{ url: "places/p/photos/own", ref: "places/p/photos/own" }]);

  answer = async (url) => (url.includes("places.googleapis.com") ? ok({ photoUri: "https://lh3.example/own" }) : png());
  await fileJobs(w.db).fetch(asked, SOON());
  assert.equal(w.found[0].p_source, "google_listing");
  assert.equal(w.found[0].p_status, "inbox");
  assert.equal(w.found[0].p_source_ref, "places/p/photos/own");
});

test("a batch's key is what it holds, so the same pictures found again are no second job", async () => {
  const w = world({ files: [] });
  await askForFoundFiles(w.db, T, { source: "website", items: fetched(2) });
  await askForFoundFiles(w.db, T, { source: "website", items: fetched(2).reverse() });
  const jobs = w.tables.jobs.filter((j) => j.kind === "file_fetch");
  assert.equal(jobs[0].payload.batch, jobs.at(-1).payload.batch);
});

test("the photographs of a read site's pages, each once", () => {
  const pages = [
    { url: "https://harbor.example/", html: `<img src="/a.jpg"><img src="/b.jpg">` },
    { url: "https://harbor.example/work", html: `<img src="/b.jpg">` },
  ];
  assert.deepEqual(
    sitePhotosOf(pages).map((f) => f.url),
    ["https://harbor.example/a.jpg", "https://harbor.example/b.jpg"],
  );
});

/** A connected profile, and Google's media list a page at a time. */
function profile(pages) {
  const w = world({ files: [] });
  w.tables.google_connections.push({
    tenant_id: T,
    google_email: "owner@example.com",
    account_name: "accounts/1",
    location_name: "locations/2",
  });
  let asked = 0;
  answer = async (url) => {
    if (url.includes("mybusiness.googleapis.com")) return ok(pages[asked++]);
    if (url.startsWith("https://lh3.example/bad")) return new Response("gone", { status: 404 });
    return new Response(squarePng(500 + Number(/p(\d+)/.exec(url)?.[1] ?? 0)), { status: 200 });
  };
  return w;
}
const media = (n, category = "EXTERIOR") => ({
  name: `m/${n}`,
  mediaFormat: "PHOTO",
  googleUrl: `https://lh3.example/p${n}`,
  locationAssociation: { category },
});
const photosJob = () => job("history_import", { source: "google_photos", seq: "1:1" });

test("a profile's photos come in a page at a time, filed, on Google's shelves, and the source says how many", async () => {
  const w = profile([{ mediaItems: [media(1), media(2, "TEAMS")], nextPageToken: "more" }, { mediaItems: [media(3)] }]);
  await historyImports(w.db).part(photosJob(), Date.now() + 40_000);
  assert.deepEqual(
    w.found.map((f) => [f.p_source, f.p_status, f.p_shows]),
    [
      ["google_profile", "filed", "storefront"],
      ["google_profile", "filed", "team"],
      ["google_profile", "filed", "storefront"],
    ],
  );
  const last = w.notes.at(-1);
  assert.equal(last.p_state, "done");
  assert.deepEqual(last.p_counts, { photos: 3 });
});

test("a reconnect that finds its photos here already counts them, and one bad address only passes that photo", async () => {
  const w = profile([
    { mediaItems: [media(1), { ...media(2), googleUrl: "https://lh3.example/bad" }] },
    { mediaItems: [media(1)] },
  ]);
  await historyImports(w.db).part(photosJob(), Date.now() + 40_000);
  assert.deepEqual(w.notes.at(-1).p_counts, { photos: 1 });
  await historyImports(w.db).part(photosJob(), Date.now() + 40_000);
  assert.deepEqual(w.notes.at(-1).p_counts, { photos: 1 }, "here already, and said");
  assert.equal(w.bucket.uploaded.length, 1);
});

test("a profile that came in sets aside what a listing alone offered and nobody kept; what a person touched stays", async () => {
  const w = profile([{ mediaItems: [media(1)] }]);
  w.tables.files.push(
    fileRow({ id: "listed", source: "google_listing", status: "inbox", fingerprint: "fp-listed", name: "listed" }),
    fileRow({
      id: "named",
      source: "google_listing",
      status: "inbox",
      fingerprint: "fp-named",
      name: "named",
      owner_named: true,
    }),
  );
  await historyImports(w.db).part(photosJob(), Date.now() + 40_000);
  const by = Object.fromEntries(w.tables.files.map((f) => [f.id, f.status]));
  assert.equal(by.listed, "set_aside");
  assert.equal(by.named, "inbox");
});

test("a full workspace stops a profile's photos in words, counting only what came in", async () => {
  const w = profile([{ mediaItems: [media(1), media(2), media(3), media(4), media(5)], nextPageToken: "more" }]);
  world.fullAt = 2;
  try {
    await historyImports(w.db).part(photosJob(), Date.now() + 40_000);
  } finally {
    world.fullAt = undefined;
  }
  const last = w.notes.at(-1);
  assert.equal(last.p_state, "failed");
  assert.match(last.p_error, /full/i);
  assert.deepEqual(last.p_counts, { photos: 2 });
});

test("Storage failing stops the part with a throw, for the ledger to try again, never a run that says done", async () => {
  const w = profile([{ mediaItems: [media(1)] }]);
  w.db.storage = {
    from: () => ({
      upload: async () => ({ error: { message: "storage is down" } }),
      remove: async () => ({ error: null }),
    }),
  };
  await assert.rejects(historyImports(w.db).part(photosJob(), Date.now() + 40_000), /storage is down/);
  assert.notEqual(w.notes.at(-1).p_state, "done");
});

test("no connection or no token stops the source in its own words, and no mailbox is named", async () => {
  const w = world({ files: [] });
  await historyImports(w.db).part(photosJob(), Date.now() + 40_000);
  assert.equal(w.notes.at(-1).p_state, "failed");
  assert.match(w.notes.at(-1).p_error, /Google profile/);
  assert.doesNotMatch(w.notes.at(-1).p_error, /mailbox/i);
});

test("Try again on a profile's stopped photos starts them again, from where they stopped", async () => {
  const w = world({ files: [] });
  w.tables.imports.push({
    tenant_id: T,
    source: "google_photos",
    state: "failed",
    counts: { photos: 12 },
    connection_id: null,
    job_cursor: { page: "more", read: 12 },
    via: "google",
    run: null,
    parts_done: 1,
    parts_total: null,
    oldest: null,
    started_at: "2026-11-05T12:00:00Z",
    finished_at: null,
    last_error: "It stopped part way.",
    updated_at: "2026-11-05T12:00:00Z",
  });
  const res = await importAgain(
    { ok: true, via: "key", workspace: null, user: null },
    { tenant_id: T, source: "google_photos" },
  );
  assert.equal(res.status, 200, await res.clone().text());
  const part = w.tables.jobs.find((j) => j.kind === "history_import");
  assert.equal(part.payload.source, "google_photos");
  assert.equal(w.notes.at(-1).p_add, true, "what it kept stays");
});

const ago = (ms) => new Date(Date.now() - ms).toISOString();
const DAY = 86_400_000;
const sweepRow = (id, over) =>
  fileRow({ id, fingerprint: `fp-${id}`, name: id, created_at: ago(2 * DAY), looked_at: ago(2 * DAY), ...over });

test("the sweep's pass: a young look that failed or was lost is tried again, once for its file and edition", async () => {
  const w = world({
    files: [
      sweepRow("failed", { look_status: "failed", look_edition: 1 }),
      sweepRow("lost", { look_status: "waiting" }),
      sweepRow("tried-today", { look_status: "failed", look_edition: 1, looked_at: ago(1000) }),
      sweepRow("refused", { look_status: "refused", look_edition: 1 }),
      sweepRow("done", { look_status: "done", look_edition: 1 }),
      sweepRow("old", { look_status: "failed", look_edition: 1, created_at: ago(30 * DAY) }),
      sweepRow("removed", { look_status: "failed", look_edition: 1, removed_at: ago(1000) }),
    ],
  });
  const did = await keepFilesMoving(w.db);
  assert.equal(did.looks, 2);
  const looks = w.tables.jobs.filter((j) => j.kind === "file_look");
  assert.deepEqual(looks.map((j) => j.payload.file_id).sort(), ["failed", "lost"]);
  // As text: a job's once-only key reads strings, and a number would make every pass a new job (job_dedupe_key_of).
  assert.deepEqual(new Set(looks.map((j) => j.payload.edition)), new Set(["1"]));
  assert.ok(Date.parse(looks[1].due_at) > Date.parse(looks[0].due_at), "paced, so a pile doesn't page Health");
});

test("the sweep's pass: a raised edition reads again what the last one read, whatever its age, and a good look's age is no reason", async () => {
  const w = world({
    files: [
      sweepRow("under-the-old-rules", { look_status: "done", look_edition: 0, created_at: ago(90 * DAY) }),
      sweepRow("under-these-rules", { look_status: "done", look_edition: 1, created_at: ago(90 * DAY) }),
    ],
  });
  await keepFilesMoving(w.db);
  assert.deepEqual(
    w.tables.jobs.filter((j) => j.kind === "file_look").map((j) => j.payload.file_id),
    ["under-the-old-rules"],
  );
});

test("the sweep's pass: a removal that has not finished is asked for again, for a week", async () => {
  const w = world({
    files: [
      sweepRow("stuck", { removed_at: ago(2 * 3_600_000) }),
      sweepRow("just-now", { removed_at: ago(1000) }),
      sweepRow("long-ago", { removed_at: ago(30 * DAY) }),
    ],
  });
  const did = await keepFilesMoving(w.db);
  assert.equal(did.purges, 1);
  const [purge] = w.tables.jobs.filter((j) => j.kind === "file_purge");
  assert.deepEqual(purge.payload, { file_id: "stuck", why: "sweep" });
});

test("the sweep's pass catches its own failures: nothing else the sweep does waits on files", async () => {
  const w = world({ files: [] });
  const from = w.db.from.bind(w.db);
  w.db.from = (table) => {
    if (table === "files") throw new Error("the read failed");
    return from(table);
  };
  assert.deepEqual(await keepFilesMoving(w.db), { looks: 0, purges: 0 });
});

const copiesAsked = (w, body, workspace = T) =>
  fileCopies(
    { ok: true, via: "token", workspace, user: U },
    new Request("https://edge.example/api/admin/files/copies", { method: "POST", body: JSON.stringify(body) }),
  );

test("Ask's door: a copy already held is answered as it is, and one that ran out is made again", async () => {
  const held = { id: "file_held", expires_at: "2099-01-01T00:00:00Z", width: 600, height: 600 };
  const OTHER = "ffffffff-0000-4000-8000-000000000002";
  const w = world({
    files: [fileRow({ claude_copy: held }), fileRow({ id: OTHER, fingerprint: "fp-2", name: "other" })],
  });
  const web = theWeb();
  const res = await copiesAsked(w, { tenant_id: T, ids: [F, OTHER] });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).copies, [
    { id: F, file_id: "file_held" },
    { id: OTHER, file_id: "file_abc" },
  ]);
  assert.equal(web.filter((c) => c.url === "https://api.anthropic.com/v1/files").length, 1, "only the one with none");
  assert.equal(w.tables.files[1].claude_copy.id, "file_abc", "and it is kept on its row");
});

test("Ask's door: what the model refused, what was removed and what is not here have no copy to send, and cost nothing", async () => {
  const held = { id: "file_held", expires_at: "2099-01-01T00:00:00Z", width: 600, height: 600 };
  const REMOVED = "ffffffff-0000-4000-8000-000000000002";
  const NONE = "ffffffff-0000-4000-8000-000000000003";
  const w = world({
    files: [
      fileRow({ look_status: "refused", claude_copy: held }),
      fileRow({
        id: REMOVED,
        fingerprint: "fp-2",
        name: "gone",
        removed_at: "2026-11-05T12:00:00Z",
        claude_copy: held,
      }),
    ],
  });
  const web = theWeb();
  const res = await copiesAsked(w, { tenant_id: T, ids: [F, REMOVED, NONE] });
  assert.deepEqual((await res.json()).copies, [
    { id: F, file_id: null },
    { id: REMOVED, file_id: null },
    { id: NONE, file_id: null },
  ]);
  assert.equal(web.length, 0);
});

test("Ask's door: one picture Storage can't make a copy of leaves the others standing", async () => {
  const OTHER = "ffffffff-0000-4000-8000-000000000002";
  const w = world({ files: [fileRow(), fileRow({ id: OTHER, fingerprint: "fp-2", name: "other" })] });
  theWeb({ [`https://storage.example/${T}/${OTHER}/original.jpg`]: () => new Response("no", { status: 500 }) });
  const res = await copiesAsked(w, { tenant_id: T, ids: [F, OTHER] });
  assert.deepEqual((await res.json()).copies, [
    { id: F, file_id: "file_abc" },
    { id: OTHER, file_id: null },
  ]);
});

test("Ask's door: another workspace's knock, and a list that is no list, are refused", async () => {
  const w = world();
  assert.equal((await copiesAsked(w, { tenant_id: T, ids: [F] }, "bbbbbbbb-0000-4000-8000-000000000001")).status, 403);
  assert.equal((await copiesAsked(w, { tenant_id: T, ids: [] })).status, 400);
  assert.equal((await copiesAsked(w, { tenant_id: T, ids: "all" })).status, 400);
  assert.equal((await copiesAsked(w, { tenant_id: T, ids: Array(11).fill(F) })).status, 400);
});
