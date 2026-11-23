/**
 * A made video's version pressed (POST files/[id]/version; 00708, the version board, approved 23 Nov 2026), run through
 * route(): the real route, a database in memory, and a fetch where the edge would be. "Approve version 2" approves the
 * open file for every place its piece was set for, at each one's time and with its words, through the one door that lets
 * the waiting posts go in the same step, never the door that adds posts beside them; "Post this one instead" does the same
 * for an older version's file. A press with nothing waiting, on a file that is no made video, or "Try again" where the
 * newest version was made is refused in the owner's words, and nothing is written.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { madeVideoBytes } from "./_made-bytes.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
delete process.env.VERCEL_ENV;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

// The Meta link is switched on for every workspace here, as the edge says it.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("/api/admin/meta/connection")) return realFetch(input, init);
  const app = { client_id: "1", config_id: "2", redirect_uri: "https://app.example/cb" };
  return new Response(JSON.stringify({ ok: true, ready: true, on: true, app }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const route = await import(at("apps/dashboard/app/api/v1/files/[id]/version/route.ts"));

beforeEach(() => setRateStore(memoryStore()));
after(() => setServiceClient(null));

let seq = 0;
const USER = "11111111-1111-4111-8111-111111111111";
const V1 = "ffffffff-0000-4000-8000-000000000001";
const V2 = "ffffffff-0000-4000-8000-000000000002";
const PHOTO = "ffffffff-0000-4000-8000-000000000003";
const PIECE = "99999999-0000-4000-8000-000000000001";
const DRAWING = "99999999-0000-4000-8000-000000000002";
const LATER = new Date(Date.now() + 6 * 3_600_000).toISOString();
const SOONER = new Date(Date.now() + 2 * 3_600_000).toISOString();

const fileRow = (tenant, over = {}) => ({
  id: V2,
  tenant_id: tenant,
  status: "filed",
  source: "made",
  source_ref: null,
  name: "the-finish",
  mime: "video/mp4",
  bytes: 1000,
  width: 1080,
  height: 1920,
  look: { line: "A reel of the finish." },
  look_status: "done",
  shows: "work",
  who_in_it: "no_one",
  removed_at: null,
  created_at: "2026-11-30T12:00:00Z",
  updated_at: "2026-11-30T12:00:00Z",
  kind: "video",
  seconds: 12,
  media_status: "ready",
  ...over,
});

/** A post approved at version 1, still set to go: its file is version 1's, its piece the root. */
const postRow = (tenant, over = {}) => ({
  id: `00000001-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  tenant_id: tenant,
  file_id: V1,
  piece_id: PIECE,
  revision: 1,
  place: "instagram",
  kind: "reel",
  caption: "Forty-five minutes, one round brush.",
  status: "queued",
  held_reason: null,
  held_why: null,
  permalink: null,
  scheduled_for: LATER,
  published_at: null,
  error: null,
  external_id: null,
  approved_by: USER,
  approved_at: "2026-11-30T14:03:00Z",
  via: "press",
  attempts: 0,
  container_id: null,
  created_at: "2026-11-30T14:03:00Z",
  updated_at: "2026-11-30T14:03:00Z",
  ...over,
});

/** A workspace with a piece at version 2 (its file V2), version 1's file, posts at version 1, and a photo. */
function world({ role = "owner", posts = [{}], drawing = null } = {}) {
  seq += 1;
  const tenant = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, "0")}`;
  const replaced = [];
  const approved = [];
  const begun = [];
  const rows = posts.map((p) => postRow(tenant, p));
  const pieces = [
    {
      id: PIECE,
      tenant_id: tenant,
      revises: null,
      file_id: V2,
      revision: 2,
      shape: "blocks",
      plan: { blocks: [] },
      look: {},
      status: "made",
      stage: "saving",
      edition: 3,
      card_key: "card-1",
      created_at: "2026-11-30T12:00:00Z",
      updated_at: "2026-12-01T16:12:00Z",
    },
    ...(drawing
      ? [
          {
            id: DRAWING,
            tenant_id: tenant,
            revises: PIECE,
            file_id: null,
            revision: 1,
            shape: "blocks",
            plan: { blocks: [] },
            look: {},
            status: drawing,
            stage: "drawing",
            edition: 3,
            card_key: "card-2",
            created_at: "2026-12-01T16:00:00Z",
            updated_at: "2026-12-01T16:00:00Z",
          },
        ]
      : []),
  ];
  const ctx = {
    supabase: fakeDb(
      {
        memberships: [
          { user_id: USER, tenant_id: tenant, role, tenants: { slug: `w${seq}` }, created_at: "2026-01-01T00:00:00Z" },
        ],
        files: [
          fileRow(tenant),
          fileRow(tenant, { id: V1, created_at: "2026-11-30T11:00:00Z" }),
          fileRow(tenant, { id: PHOTO, source: "upload", kind: "image", mime: "image/jpeg", name: "storefront" }),
        ],
        tenants: [{ id: tenant, name: "Harbor", slug: `w${seq}`, timezone: "UTC", status: "active" }],
        google_connections: [],
        posts: rows,
        pieces,
        // Each version's standing shape, kept as it was drawn (00708 piece_version_kept; version 1's at its approval).
        piece_renditions: [
          { tenant_id: tenant, piece_id: PIECE, revision: 1, shape: "9x16", file_id: V1 },
          { tenant_id: tenant, piece_id: PIECE, revision: 2, shape: "9x16", file_id: V2 },
        ],
      },
      {},
      {
        // 00708's door: the waiting posts let go and this file approved in their place, in one step.
        piece_posts_replace: ({ p_tenant_id, p_file_id, p_approval }) => {
          replaced.push({ p_tenant_id, p_file_id, approval: p_approval });
          return {
            fate: "approved",
            approval_id: "abab0000-0000-4000-8000-000000000001",
            posts: p_approval.placements.map((p, i) => ({
              place: p.place,
              kind: p.kind,
              post_id: `00000002-0000-4000-8000-00000000000${i}`,
            })),
          };
        },
        // 00681's door, which adds posts beside the waiting ones: a version's press never asks it.
        post_approve: (a) => {
          approved.push(a);
          return { fate: "approved", approval_id: "x", posts: [] };
        },
        piece_words_keep: () => ({ revision: 2, followed: 0 }),
        piece_version_begin: (a) => {
          begun.push(a);
          return { fate: "begun", piece_id: "99999999-0000-4000-8000-000000000003" };
        },
      },
    ),
    userId: USER,
    email: "ada@example.com",
    params: { id: V2 },
  };
  const channels = [
    {
      id: `cccccccc-cccc-4ccc-8ccc-${String(seq).padStart(12, "0")}`,
      tenant_id: tenant,
      kind: "instagram",
      external_id: "17841400000000001",
      status: "active",
      credentials_ref: "ref",
      config: { login: "meta", scopes: ["instagram_basic", "instagram_manage_messages", "instagram_content_publish"] },
      created_at: "2026-11-01T00:00:00Z",
    },
  ];
  const made = { plan: { blocks: [] }, caption: null };
  const kept = [V1, V2].map((id) => ({ id, tenant_id: tenant, source: "made", made, removed_at: null }));
  const service = fakeDb({ tenant_channels: channels, files: kept, events: [], posts: rows, pieces }, {}, {});
  // Each version's own MP4, as the bucket holds it: read, measured and summed for the press.
  service.storage = {
    from: () => ({
      download: async () => ({ data: new Blob([madeVideoBytes({ seconds: 12, tag: tenant })]), error: null }),
    }),
  };
  setServiceClient(service);
  return { ctx, tenant, rows, replaced, approved, begun };
}
const press = (w, to) =>
  route.POST.run(
    new Request(`http://localhost/api/v1/x?workspace=${w.tenant}`, { method: "POST", body: JSON.stringify({ to }) }),
    w.ctx,
  );

test("Approve version 2 approves it for every place still waiting, at each one's time, through the door that replaces", async () => {
  const w = world({ posts: [{}, { caption: "Thursday has openings.", scheduled_for: SOONER }] });
  assert.deepEqual(await press(w, "approve"), { fate: "approved" });
  assert.equal(w.approved.length, 0, "never the door that adds posts beside the waiting ones");
  assert.equal(w.replaced.length, 1);
  const [{ p_tenant_id, p_file_id, approval }] = w.replaced;
  assert.deepEqual([p_tenant_id, p_file_id, approval.via], [w.tenant, V2, "press"]);
  assert.deepEqual(
    approval.placements.map((p) => [p.place, p.kind, p.at, p.caption]).sort(),
    [
      ["instagram", "reel", LATER, "Forty-five minutes, one round brush."],
      ["instagram", "reel", SOONER, "Thursday has openings."],
    ].sort(),
  );
  // The bytes that go are version 2's own, read and summed now.
  assert.equal(approval.renditions.length, 1);
  assert.equal(approval.renditions[0].shape, "9x16");
  assert.match(approval.renditions[0].checksum, /^[0-9a-f]{64}$/);
});

test("Post this one instead approves the older version's own file in the same way", async () => {
  const w = world();
  w.ctx.params = { id: V1 };
  assert.deepEqual(await press(w, "approve"), { fate: "approved" });
  assert.equal(w.replaced[0].p_file_id, V1);
});

test("a press with nothing waiting, on a file that is no made video, or by a reader is refused, and nothing is written", async () => {
  const none = world({ posts: [{ status: "published", published_at: "2026-11-30T18:00:00Z" }] });
  await assert.rejects(press(none, "approve"), (e) => e.message === "Nothing of this video waits to go up.");
  const photo = world();
  photo.ctx.params = { id: PHOTO };
  await assert.rejects(press(photo, "approve"), (e) => e.message === "This isn't one of a made video's versions.");
  const reader = world({ role: "viewer" });
  await assert.rejects(press(reader, "approve"));
  assert.deepEqual(
    [none, photo, reader].map((w) => [w.replaced.length, w.approved.length]),
    [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  );
});

test("Try again is refused where the newest version was made, none was asked, or one is being made now", async () => {
  for (const drawing of [null, "made"]) {
    const w = world({ drawing });
    await assert.rejects(press(w, "again"), (e) => e.message === "Nothing to try again: its newest version was made.");
    assert.equal(w.begun.length, 0);
  }
  const making = world({ drawing: "making" });
  await assert.rejects(press(making, "again"), (e) => e.message.startsWith("Its new version is being made now."));
  assert.equal(making.begun.length, 0);
});
