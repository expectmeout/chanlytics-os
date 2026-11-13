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
const posts = await import(at("apps/dashboard/app/api/v1/files/[id]/posts/route.ts"));
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
function world({ on = true, scopes = ALL, connected = true, lapsed = false, role = "owner", posts = [] } = {}) {
  seq += 1;
  const tenant = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, "0")}`;
  if (on) ON.add(tenant);
  const begun = [];
  const pulled = [];
  const moved = [];
  // Every door asked, in order: a post let go before its piece is set aside.
  const doors = [];
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
        file_change: (a) => {
          doors.push(["file_change", a.p_status ?? null]);
          return null;
        },
        file_remove: () => {
          doors.push(["file_remove"]);
          return null;
        },
        // 00620's door: said once a piece, and said again it is the same record with the link it now has.
        post_report: ({ p_file_id, p_link }) => {
          doors.push(["post_report", p_link ?? null]);
          const kept = rows.find((r) => r.file_id === p_file_id && r.place === "hand" && r.status === "published");
          if (kept) {
            kept.permalink = p_link ?? kept.permalink;
            return { fate: "kept", post_id: kept.id };
          }
          const row = postRow(tenant, {
            id: "00000009-0000-4000-8000-000000000000",
            file_id: p_file_id,
            place: "hand",
            kind: "picture",
            caption: null,
            status: "published",
            permalink: p_link ?? null,
            published_at: "2026-11-12T12:00:00.000Z",
          });
          rows.push(row);
          return { fate: "kept", post_id: row.id };
        },
        post_pull: ({ p_post_id }) => {
          pulled.push(p_post_id);
          doors.push(["post_pull", p_post_id]);
          const p = rows.find((r) => r.id === p_post_id);
          // One kept by hand is its owner's to take back (00620).
          if (p && (["queued", "preparing"].includes(p.status) || (p.place === "hand" && p.status === "published"))) {
            p.status = "pulled";
            return { fate: "pulled" };
          }
          return { fate: "late", status: p?.status ?? null };
        },
        // Change time (00621): a queued post moves; one being made ready is late.
        post_move: ({ p_post_id, p_when }) => {
          moved.push({ p_post_id, p_when });
          const p = rows.find((r) => r.id === p_post_id);
          if (!p) return { fate: "unknown" };
          if (p.status !== "queued") return { fate: "late", status: p.status };
          p.scheduled_for = p_when;
          return { fate: "moved" };
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
          config: { login: "meta", scopes, ...(lapsed ? { token_lapsed_at: "2026-11-09T06:00:00Z" } : {}) },
          created_at: "2026-11-01T00:00:00Z",
        },
      ]
    : [];
  // How the post was made, as every made post keeps it: its words are kept here as it is posted (posts/caption.ts).
  const made = { plan: { line: "Open late on Fridays", under: null }, caption: null };
  const kept = [{ id: POST_ID, tenant_id: tenant, source: "made", made, removed_at: null }];
  const service = fakeDb({ tenant_channels: channels, files: kept, events: [], posts: rows }, {}, {});
  setServiceClient(service);
  return { ctx, tenant, begun, pulled, moved, rows, kept, doors };
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
  // A connection Meta no longer accepts would only be held a minute later: the press is refused before anything is written.
  const lapsed = world({ lapsed: true });
  await assert.rejects(
    route.POST.run(send(lapsed, "POST", { as: "picture", caption: "Hi." }), lapsed.ctx),
    (e) => e.message === ON_INSTAGRAM.notConnected,
  );
  assert.deepEqual([off.begun, none.begun, line.begun, lapsed.begun], [[], [], [], []]);
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

test("Change time moves the same post in one step, until Instagram is making it ready", async () => {
  const when = "2099-03-01T15:00:00.000Z";
  const w = world({ posts: [{ status: "queued" }] });
  assert.deepEqual(await posts.PATCH.run(send(w, "PATCH", { post_id: w.rows[0].id, when }), w.ctx), { moved: true });
  assert.deepEqual([w.rows[0].status, w.rows[0].scheduled_for], ["queued", when], "the same post, at its new time");
  assert.deepEqual(w.pulled, [], "never stopped and posted again");
  const late = world({ posts: [{ status: "preparing" }] });
  await assert.rejects(
    posts.PATCH.run(send(late, "PATCH", { post_id: late.rows[0].id, when }), late.ctx),
    (e) => e.message === ON_INSTAGRAM.moveLate,
  );
  const other = world();
  await assert.rejects(
    posts.PATCH.run(send(other, "PATCH", { post_id: "00000005-0000-4000-8000-000000000000", when }), other.ctx),
    (e) => e.code === "not_found",
  );
  assert.deepEqual(other.moved, [], "another file's post is never asked after");
});

test("the press keeps its words on the piece in the same step, and a story keeps none", async () => {
  const w = world();
  await route.POST.run(send(w, "POST", { as: "picture", caption: "Open late on Fridays, all winter." }), w.ctx);
  assert.equal(w.kept[0].made.caption, "Open late on Fridays, all winter.", "what went is what the piece says now");
  const story = world();
  await route.POST.run(send(story, "POST", { as: "story" }), story.ctx);
  assert.equal(story.kept[0].made.caption, null);
});

test("a piece set aside is not posted: what still waits to go out is let go first, and what went stays", async () => {
  const WAITING = "00000003-0000-4000-8000-000000000000";
  const UP = "00000004-0000-4000-8000-000000000000";
  const w = world({
    posts: [
      { id: WAITING, status: "queued" },
      { id: UP, status: "published" },
    ],
  });
  // The answer names where a post was let go, which the page's note says ("Its post to Instagram won't go out").
  assert.deepEqual(await one.PATCH.run(send(w, "PATCH", { status: "set_aside" }), w.ctx), {
    ok: true,
    stopped: ["instagram"],
  });
  assert.deepEqual(w.doors, [
    ["post_pull", WAITING],
    ["file_change", "set_aside"],
  ]);
  assert.equal(w.rows.find((p) => p.id === UP).status, "published");
  // One that began going up between the read and the pull goes: the database says late, and the answer names no place, so the
  // note never says a post that went up was stopped.
  const late = world({ posts: [{ id: WAITING, status: "queued" }] });
  const rpc = late.ctx.supabase.rpc.bind(late.ctx.supabase);
  late.ctx.supabase.rpc = (name, args) =>
    name === "post_pull"
      ? Promise.resolve({ data: { fate: "late", status: "publishing" }, error: null })
      : rpc(name, args);
  assert.deepEqual(await one.PATCH.run(send(late, "PATCH", { status: "set_aside" }), late.ctx), {
    ok: true,
    stopped: [],
  });
  // Kept again, nothing is let go: there is nothing to let go of.
  const kept = world({ posts: [{ id: WAITING, status: "queued" }] });
  assert.deepEqual(await one.PATCH.run(send(kept, "PATCH", { status: "filed" }), kept.ctx), { ok: true, stopped: [] });
  assert.deepEqual(kept.doors, [["file_change", "filed"]]);
  // Deleted, the same: its waiting post is let go before the piece goes, so its time never sends it nor rings the bell.
  const gone = world({ posts: [{ id: WAITING, status: "queued" }] });
  await one.DELETE.run(send(gone, "DELETE", {}), gone.ctx);
  assert.deepEqual(gone.doors, [["post_pull", WAITING], ["file_remove"]]);
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
  assert.equal(
    (await read(world({ lapsed: true }))).instagram.can,
    "not_connected",
    "a lapsed connection offers no press",
  );
});

test("I posted it: the owner's word is kept by its door, with its link or none, and taken back by Don't post's", async () => {
  const w = world();
  await one.PATCH.run(send(w, "PATCH", { posted: {} }), w.ctx);
  assert.deepEqual(w.doors, [["post_report", null]]);
  const [hand] = w.rows;
  assert.deepEqual([hand.place, hand.status, hand.permalink], ["hand", "published", null]);
  // Its link, added after: the same record.
  await one.PATCH.run(send(w, "PATCH", { posted: { link: " https://www.tiktok.com/@harbor/video/1 " } }), w.ctx);
  assert.equal(w.rows.length, 1);
  assert.equal(hand.permalink, "https://www.tiktok.com/@harbor/video/1");
  // The record a piece read on its own takes it from says so, and never as a post at a place of ours.
  const record = await one.GET.run(send(w, "GET"), w.ctx);
  assert.equal(record.by_hand.link, "https://www.tiktok.com/@harbor/video/1");
  assert.deepEqual(record.posts, []);
  // Not posted after all.
  await one.PATCH.run(send(w, "PATCH", { posted: null }), w.ctx);
  assert.equal(hand.status, "pulled");
  assert.equal((await one.GET.run(send(w, "GET"), w.ctx)).by_hand, null);
  // Taken back with none said is what was asked for: nothing is asked of any door.
  const none = world();
  await one.PATCH.run(send(none, "PATCH", { posted: null }), none.ctx);
  assert.deepEqual(none.doors, []);
});

test("a link that is no https address is refused before any door, and a photo of the Library is marked by no one", async () => {
  const w = world();
  for (const link of [
    "http://example.com/x",
    "tiktok.com/x",
    "https://exa mple.com",
    `https://example.com/${"x".repeat(500)}`,
  ])
    await assert.rejects(one.PATCH.run(send(w, "PATCH", { posted: { link } }), w.ctx), (e) => e.status === 400, link);
  assert.deepEqual(w.doors, []);
  const photo = { ...w.ctx, params: { id: PHOTO_ID } };
  await assert.rejects(
    one.PATCH.run(send(w, "PATCH", { posted: {} }), photo),
    /Only a piece Ask made is marked as posted/,
  );
  assert.deepEqual(w.doors, []);
});
