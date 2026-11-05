/**
 * A member's upload, run through route() (apps/dashboard/src/server/files/, decision 0099): the real route modules over a
 * database in memory and a Storage that answers from memory. There is no file until the server has proven the bytes, by their
 * own first bytes and never the browser's word, and Storage's decoder is asked only where the head can't say. On Storage's wire
 * HTTP 400 means many things and the true status is in the body, so only its own "400" refuses a photo.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { squarePng } from "../look/_png.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

let storage = async () => new Response("nothing answers", { status: 500 });
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => storage(String(input instanceof Request ? input.url : input), init ?? {});
after(() => {
  globalThis.fetch = realFetch;
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const start = await import(at("apps/dashboard/app/api/v1/files/start/route.ts"));
const done = await import(at("apps/dashboard/app/api/v1/files/[id]/done/route.ts"));
const keep = await import(at("apps/dashboard/app/api/v1/files/keep/route.ts"));
const one = await import(at("apps/dashboard/app/api/v1/files/[id]/route.ts"));
const view = await import(at("apps/dashboard/app/api/v1/files/[id]/view/route.ts"));
const { FILE_WORDS: W } = await import(at("packages/contracts/src/files/files.ts"));

beforeEach(() => setRateStore(memoryStore()));
after(() => setServiceClient(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const F = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const USER = "11111111-1111-4111-8111-111111111111";
const SIGNED = "https://storage.example/signed";
const inA = `?workspace=${A}`;

const member = (role = "owner") => ({
  user_id: USER,
  tenant_id: A,
  role,
  tenants: { slug: "harbor" },
  created_at: "2026-01-01T00:00:00Z",
});
const ctxFor = (rows = {}, rpcs = {}, params = {}, role = "owner") => ({
  supabase: fakeDb({ memberships: [member(role)], files: [], ...rows }, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params,
});
const post = (body) => new Request(`http://localhost/api/v1/x${inA}`, { method: "POST", body: JSON.stringify(body) });
async function refused(p, code, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (words) assert.equal(e.message, words);
    return true;
  });
}

/** The service role's side: the one door, and a bucket that signs. */
function service(answer = { fate: "kept", file_id: F }) {
  const asked = { found: [], signed: [] };
  const db = fakeDb(
    {},
    {},
    {
      file_found: (a) => {
        asked.found.push(a);
        return answer;
      },
    },
  );
  db.storage = {
    from: () => ({
      createSignedUploadUrl: async (p) => {
        asked.signed.push({ upload: p });
        return { data: { signedUrl: `${SIGNED}/${p}` }, error: null };
      },
      createSignedUrl: async (p, s, o) => {
        asked.signed.push({ path: p, s, ...o });
        return { data: { signedUrl: `${SIGNED}${o?.transform ? "/resize" : ""}/${p}` }, error: null };
      },
    }),
  };
  setServiceClient(db);
  return asked;
}

const PICTURE = squarePng(600);
/** Storage's answer to the head read, whose size says the whole file's, and to a resize. */
function arrives(bytes, resize = async () => new Response(squarePng(320), { status: 200 })) {
  storage = async (url) => {
    if (url.includes("/resize/")) return resize();
    return new Response(bytes, {
      status: 206,
      headers: { "content-range": `bytes 0-${bytes.length - 1}/${bytes.length + 5000}` },
    });
  };
}
const DONE = { name: "IMG_2041.PNG", mime: "image/png" };
const finished = (body = DONE) => done.POST.run(post(body), ctxFor({}, {}, { id: F }));

test("a start holds no name and no row: the door's word, and an address to send to", async () => {
  const asked = service();
  let door = null;
  const ctx = ctxFor({}, { file_start: (a) => ((door = a), null) });
  const said = await start.POST.run(post({ mime: "image/jpeg", bytes: 1000 }), ctx);
  assert.equal(door.p_tenant_id, A);
  assert.equal(door.p_id, said.id);
  assert.equal(said.upload_url, `${SIGNED}/${A}/${said.id}/original.jpg`);
  assert.deepEqual(Object.keys(door).sort(), ["p_id", "p_tenant_id"]);
  assert.equal(asked.found.length, 0);
});

test("a full workspace is said at the start, in the door's words, before anything travels", async () => {
  service();
  const full = () => {
    throw Object.assign(new Error(W.full), { code: "22023" });
  };
  await refused(
    start.POST.run(post({ mime: "image/jpeg", bytes: 1000 }), ctxFor({}, { file_start: full })),
    "validation",
    W.full,
  );
});

test("a kind we don't keep, or a photo past the bucket's limit, is refused at the start", async () => {
  service();
  const ctx = () => ctxFor({}, { file_start: () => null });
  await refused(start.POST.run(post({ mime: "image/svg+xml", bytes: 1000 }), ctx()), "validation");
  await refused(start.POST.run(post({ mime: "image/jpeg", bytes: 25_000_001 }), ctx()), "validation");
});

test("the bytes proven: one door, for this member, with what the bytes say and never what the browser did", async () => {
  const asked = service();
  arrives(PICTURE);
  assert.deepEqual(await finished(), { file_id: F, twin: false });
  const [door] = asked.found;
  assert.equal(door.p_tenant_id, A);
  assert.equal(door.p_id, F);
  assert.equal(door.p_status, "filed");
  assert.equal(door.p_source, "upload");
  assert.equal(door.p_name, "img-2041");
  assert.equal(door.p_actor, USER);
  assert.equal(door.p_bytes, PICTURE.length + 5000, "the whole file's size, from the range's answer");
  assert.equal(door.p_width, 600);
  assert.match(door.p_fingerprint, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    asked.signed.map((s) => s.path),
    [`${A}/${F}/original.png`],
    "the head alone: the decoder isn't asked of a photo that says its own size",
  );
});

test("a name with nothing in it is still a file", async () => {
  const asked = service();
  arrives(PICTURE);
  await finished({ name: "🙂.png", mime: "image/png" });
  assert.equal(asked.found[0].p_name, "photo");
});

test("a twin answers with the first, calmly; a full workspace in words; and no bytes are thrown away here", async () => {
  const twin = "22222222-2222-4222-8222-222222222222";
  const asked = service({ fate: "here", file_id: twin });
  arrives(PICTURE);
  assert.deepEqual(await finished(), { file_id: twin, twin: true });
  assert.equal(
    asked.signed.some((s) => s.remove),
    false,
  );

  service({ fate: "full", file_id: null });
  arrives(PICTURE);
  await refused(finished(), "validation", W.full);
});

test("nothing arrived, a kind it isn't, or too small: refused by its own bytes, and the door never asked", async () => {
  let asked = service();
  storage = async () => new Response("not found", { status: 400 });
  await refused(finished(), "validation", W.notSaved);
  assert.equal(asked.found.length, 0);

  asked = service();
  arrives(PICTURE);
  await refused(finished({ name: "a.jpg", mime: "image/jpeg" }), "validation", W.wrongType);
  await refused(finished({ name: "a.heic", mime: "image/heic" }), "validation", W.wrongType);

  arrives(squarePng(80));
  await refused(finished(), "validation", W.tooSmall);
  assert.equal(asked.found.length, 0);
});

const HEIC_HEAD = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 0, 0, 0, 0]);
const body = (json, status) =>
  new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
const HEIC = { name: "IMG_4417.HEIC", mime: "image/heic" };

test("a photo whose head can't say its size is asked of Storage's decoder, and one it can draw is kept with no size", async () => {
  const asked = service();
  arrives(HEIC_HEAD);
  assert.deepEqual(await finished(HEIC), { file_id: F, twin: false });
  assert.equal(asked.found[0].p_width, null);
  assert.equal(asked.found[0].p_height, null);
  assert.equal(asked.found[0].p_mime, "image/heic");
  const resize = asked.signed.find((s) => s.transform);
  assert.equal(resize.path, `${A}/${F}/original.heic`);
  assert.equal(resize.transform.width, 320);
});

test("only the decoder's own no refuses it: told while the person is still looking", async () => {
  const asked = service();
  arrives(HEIC_HEAD, async () => body({ statusCode: "400", error: "invalid", message: "source invalid" }, 400));
  await refused(finished(HEIC), "validation", W.unreadable);
  assert.equal(asked.found.length, 0);
});

test("Storage's HTTP 400 over a timeout of its own, a 500 or no answer says nothing of the photo: it is kept, for the look to try", async () => {
  for (const resize of [
    async () => body({ statusCode: "504", error: "timeout" }, 400),
    async () => body({ statusCode: "429", error: "slow down" }, 400),
    async () => new Response("<html>bad gateway</html>", { status: 500 }),
    async () => {
      throw new Error("the line dropped");
    },
  ]) {
    const asked = service();
    arrives(HEIC_HEAD, resize);
    assert.equal((await finished(HEIC)).twin, false);
    assert.equal(asked.found.length, 1);
  }
});

test("only a member who may change settings adds a photo, and an id that isn't one is no file", async () => {
  const asked = service();
  arrives(PICTURE);
  await assert.rejects(done.POST.run(post(DONE), ctxFor({}, {}, { id: F }, "viewer")), (e) => e.status === 403);
  await assert.rejects(done.POST.run(post(DONE), ctxFor({}, {}, { id: "not-a-uuid" })), (e) => e.status === 404);
  assert.equal(asked.found.length, 0);
});

test("the Inbox's press names ids, and says how many moved", async () => {
  service();
  let door = null;
  const ctx = ctxFor({}, { file_keep_many: (a) => ((door = a), 2) });
  assert.deepEqual(await keep.POST.run(post({ ids: [F] }), ctx), { kept: 2 });
  assert.deepEqual(door, { p_tenant_id: A, p_ids: [F] });
  await refused(keep.POST.run(post({ ids: [] }), ctxFor()), "validation");
  await refused(keep.POST.run(post({ ids: ["nope"] }), ctxFor()), "validation");
});

const row = (over = {}) => ({
  id: F,
  tenant_id: A,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: "año-nuevo",
  mime: "image/jpeg",
  bytes: 1000,
  width: 1200,
  height: 900,
  look: null,
  look_status: "done",
  shows: null,
  who_in_it: "not_asked",
  removed_at: null,
  created_at: "2026-11-05T12:00:00Z",
  updated_at: "2026-11-05T12:00:00Z",
  ...over,
});

test("a person says who is in it as no one, or that they agreed, and never that nobody asked", async () => {
  service();
  const patch = (b) => new Request(`http://localhost/api/v1/x${inA}`, { method: "PATCH", body: JSON.stringify(b) });
  const ctx = () => ctxFor({ files: [row()] }, { file_change: () => null }, { id: F });
  assert.deepEqual(await one.PATCH.run(patch({ who_in_it: "agreed" }), ctx()), { ok: true });
  await refused(one.PATCH.run(patch({ who_in_it: "not_asked" }), ctx()), "validation");
  await refused(one.PATCH.run(patch({ ask_may_use: false, who_in_it: "maybe" }), ctx()), "validation");
});

const viewed = (q, file = row()) =>
  view.GET.run(new Request(`http://localhost/api/v1/x${inA}&${q}`), ctxFor({ files: [file] }, {}, { id: F }));

test("a picture's address lasts a week and the browser keeps it six days, so a page of them paints from disk", async () => {
  const asked = service();
  const res = await viewed("w=480");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("cache-control"), "private, max-age=518400");
  assert.equal(asked.signed[0].s, 604_800);
  assert.equal(asked.signed[0].path, `${A}/${F}/original.jpg`);
  assert.equal(asked.signed[0].transform.width, 480);
});

test("one tile width and one sheet width, so one picture is resized a few times and never once per asker", async () => {
  for (const [q, w] of [
    ["w=100", 480],
    ["w=480", 480],
    ["w=640", 1280],
    ["w=1280", 1280],
    ["w=4000", 2000],
  ]) {
    const asked = service();
    await viewed(q);
    assert.equal(asked.signed[0].transform.width, w, q);
  }
});

test("a download is the original under its name, asked for afresh; a HEIC is drawn only as a copy", async () => {
  let asked = service();
  const res = await viewed("download");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(asked.signed[0].download, "año-nuevo.jpg");
  assert.equal(asked.signed[0].transform, undefined);

  asked = service();
  await viewed("", row({ mime: "image/heic" }));
  assert.ok(asked.signed[0].transform, "a browser cannot read one");
  assert.equal(asked.signed[0].path, `${A}/${F}/original.heic`);
});
