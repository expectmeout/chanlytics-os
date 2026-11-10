/**
 * A made post approved for Instagram from its sheet (apps/dashboard/src/server/posts/instagram.ts, decision 0121), run through
 * route(): the real routes, a database in memory, and a fetch where the edge would be. The press is offered and taken only where
 * the Meta link is switched on and the account allows posting; it writes the post through its door and answers at once; a story
 * takes no caption; a caption past Instagram's limits is refused in words; a second press while one is on its way is the first;
 * Don't post stops it until it is sent; and the sheet reads where each post stands, in the owner's words.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ON_INSTAGRAM } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
delete process.env.VERCEL_ENV;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

/** Workspaces whose Meta link is switched on, as the edge says it. */
const ON = new Set();
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("/api/admin/meta/connection")) return realFetch(input, init);
  const body = JSON.parse(init.body);
  const on = ON.has(body.tenant_id);
  const app = on ? { client_id: "1", config_id: "2", redirect_uri: "https://app.example/cb" } : null;
  return new Response(JSON.stringify({ ok: true, ready: on, on, app }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const route = await import(at("apps/dashboard/app/api/v1/files/[id]/instagram/route.ts"));
const one = await import(at("apps/dashboard/app/api/v1/files/[id]/route.ts"));

beforeEach(() => setRateStore(memoryStore()));
after(() => setServiceClient(null));

let seq = 0;
const USER = "11111111-1111-4111-8111-111111111111";
const POST_ID = "ffffffff-0000-4000-8000-000000000002";
const PHOTO_ID = "ffffffff-0000-4000-8000-000000000001";
const ALL = ["instagram_basic", "instagram_manage_messages", "instagram_content_publish"];

const fileRow = (tenant, over = {}) => ({
  id: POST_ID,
  tenant_id: tenant,
  status: "filed",
  source: "made",
  source_ref: null,
  name: "open-late-on-fridays",
  mime: "image/jpeg",
  bytes: 1000,
  width: 1080,
  height: 1350,
  look: { line: "A post saying Open late on Fridays." },
  look_status: "done",
  shows: "graphic",
  who_in_it: "no_one",
  removed_at: null,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
  ...over,
});

const postRow = (tenant, over = {}) => ({
  id: "00000001-0000-4000-8000-000000000000",
  tenant_id: tenant,
  file_id: POST_ID,
  place: "instagram",
  kind: "picture",
  caption: "Open late on Fridays.",
  status: "queued",
  held_reason: null,
  permalink: null,
  scheduled_for: "2026-11-10T09:00:00.000Z",
  published_at: null,
  error: null,
  external_id: null,
  approved_by: USER,
  approved_at: "2026-11-10T09:00:00.000Z",
  via: "press",
  attempts: 0,
  container_id: null,
  created_at: "2026-11-10T09:00:00.000Z",
  updated_at: "2026-11-10T09:00:00.000Z",
  ...over,
});

/** A workspace of its own each time (the switch is kept a while per workspace), with a made post and a photo. */
function world({ on = true, scopes = ALL, connected = true, role = "owner", posts = [] } = {}) {
  seq += 1;
  const tenant = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, "0")}`;
  if (on) ON.add(tenant);
  const begun = [];
  const pulled = [];
  const rows = posts.map((p) => postRow(tenant, p));
  const ctx = {
    supabase: fakeDb(
      {
        memberships: [
          { user_id: USER, tenant_id: tenant, role, tenants: { slug: `w${seq}` }, created_at: "2026-01-01T00:00:00Z" },
        ],
        files: [fileRow(tenant), fileRow(tenant, { id: PHOTO_ID, source: "upload", name: "storefront" })],
        tenants: [{ id: tenant, name: "Harbor", slug: `w${seq}`, timezone: "UTC", status: "active" }],
        google_connections: [],
        posts: rows,
      },
      {},
      {
        post_begin: (a) => {
          begun.push(a);
          if (rows.some((p) => ["queued", "preparing", "publishing", "checking"].includes(p.status)))
            return { fate: "busy", post_id: rows[0].id };
          return { fate: "begun", post_id: "00000002-0000-4000-8000-000000000000" };
        },
        post_pull: ({ p_post_id }) => {
          pulled.push(p_post_id);
          const p = rows.find((r) => r.id === p_post_id);
          if (p && ["queued", "preparing"].includes(p.status)) {
            p.status = "pulled";
            return { fate: "pulled" };
          }
          return { fate: "late", status: p?.status ?? null };
        },
      },
    ),
    userId: USER,
    email: "ada@example.com",
    params: { id: POST_ID },
  };
  const channels = connected
    ? [
        {
          id: `cccccccc-cccc-4ccc-8ccc-${String(seq).padStart(12, "0")}`,
          tenant_id: tenant,
          kind: "instagram",
          external_id: "17841400000000001",
          status: "active",
          credentials_ref: "ref",
          config: { login: "meta", scopes },
          created_at: "2026-11-01T00:00:00Z",
        },
      ]
    : [];
  const service = fakeDb(
    { tenant_channels: channels, files: [{ id: POST_ID, tenant_id: tenant, source: "made", made: null }], events: [] },
    {},
    {},
  );
  setServiceClient(service);
  return { ctx, tenant, begun, pulled, rows };
}
const send = (w, method, body) =>
  new Request(`http://localhost/api/v1/x?workspace=${w.tenant}`, { method, body: JSON.stringify(body) });

test("the press writes the post through its door and answers at once, with the caption as written", async () => {
  const w = world();
  const said = await route.POST.run(send(w, "POST", { as: "picture", caption: "  Open late on Fridays.  " }), w.ctx);
  assert.deepEqual(said, { post_id: "00000002-0000-4000-8000-000000000000", status: "queued" });
  assert.equal(w.begun.length, 1);
  const [a] = w.begun;
  assert.deepEqual(
    [a.p_tenant_id, a.p_file_id, a.p_place, a.p_kind, a.p_caption, a.p_via],
    [w.tenant, POST_ID, "instagram", "picture", "Open late on Fridays.", "press"],
  );
});

test("a story takes no caption", async () => {
  const w = world();
  await route.POST.run(send(w, "POST", { as: "story", caption: "Ignored on a story." }), w.ctx);
  assert.equal(w.begun[0].p_kind, "story");
  assert.equal(w.begun[0].p_caption, "", "none kept");
});

test("a caption past Instagram's limits is refused in words, and nothing is written", async () => {
  const w = world();
  const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
  await assert.rejects(route.POST.run(send(w, "POST", { as: "picture", caption: tags }), w.ctx), /up to 30 hashtags/);
  assert.equal(w.begun.length, 0);
});

test("only where the Meta link is switched on, connected, and allowed to post", async () => {
  const off = world({ on: false });
  await assert.rejects(route.POST.run(send(off, "POST", { as: "picture", caption: "Hi." }), off.ctx), (e) => {
    assert.equal(e.message, ON_INSTAGRAM.notConnected);
    return true;
  });
  const none = world({ connected: false });
  await assert.rejects(
    route.POST.run(send(none, "POST", { as: "picture", caption: "Hi." }), none.ctx),
    (e) => e.message === ON_INSTAGRAM.notConnected,
  );
  const line = world({ scopes: ["instagram_basic", "instagram_manage_messages"] });
  await assert.rejects(
    route.POST.run(send(line, "POST", { as: "picture", caption: "Hi." }), line.ctx),
    (e) => e.message === ON_INSTAGRAM.lineOff,
  );
  assert.deepEqual([off.begun, none.begun, line.begun], [[], [], []]);
});

test("only a made post goes, only on a press by whoever may save one, and a second press while one goes is the first", async () => {
  const photo = world();
  photo.ctx.params = { id: PHOTO_ID };
  await assert.rejects(
    route.POST.run(send(photo, "POST", { as: "picture", caption: "Hi." }), photo.ctx),
    (e) => e.message === ON_INSTAGRAM.notAPost,
  );
  for (const role of ["viewer", "operator"]) {
    const w = world({ role });
    await assert.rejects(
      route.POST.run(send(w, "POST", { as: "picture", caption: "Hi." }), w.ctx),
      (e) => e.code === "forbidden",
    );
  }
  const busy = world({ posts: [{ status: "preparing" }] });
  await assert.rejects(
    route.POST.run(send(busy, "POST", { as: "picture", caption: "Hi." }), busy.ctx),
    (e) => e.message === ON_INSTAGRAM.busy,
  );
});

test("Don't post stops it until it is sent, and says so once it is too late", async () => {
  const w = world({ posts: [{ status: "queued" }] });
  assert.deepEqual(await route.DELETE.run(send(w, "DELETE", { post_id: w.rows[0].id }), w.ctx), { pulled: true });
  assert.equal(w.rows[0].status, "pulled");
  const late = world({ posts: [{ status: "publishing" }] });
  await assert.rejects(
    route.DELETE.run(send(late, "DELETE", { post_id: late.rows[0].id }), late.ctx),
    (e) => e.message === ON_INSTAGRAM.pullLate,
  );
  const other = world();
  await assert.rejects(
    route.DELETE.run(send(other, "DELETE", { post_id: "00000005-0000-4000-8000-000000000000" }), other.ctx),
    (e) => e.code === "not_found",
  );
  assert.deepEqual(other.pulled, [], "another file's post is never asked after");
});

test("the sheet reads whether Instagram takes a post, and where each one stands, in words", async () => {
  const read = (w) => one.GET.run(new Request(`http://localhost/api/v1/x?workspace=${w.tenant}`), w.ctx);
  const w = world({
    posts: [
      {
        status: "failed",
        error: { code: 36003, subcode: 2207009, words: ON_INSTAGRAM.refused.picture },
        created_at: "2026-11-10T10:00:00.000Z",
      },
    ],
  });
  const said = await read(w);
  assert.equal(said.instagram.can, "yes");
  assert.equal(said.instagram.posts.length, 1);
  const [p] = said.instagram.posts;
  assert.equal(p.status, "failed");
  assert.equal(p.error, ON_INSTAGRAM.refused.picture, "the words, never the code");
  assert.equal("container_id" in p, false);
  assert.equal((await read(world({ on: false }))).instagram, null, "nothing offered where the switch is off");
  assert.equal((await read(world({ connected: false }))).instagram.can, "not_connected");
});
