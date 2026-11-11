/**
 * GET content, Campaigns › Content's one read, run through route() over a database in memory: what is being made, a page of
 * what was made with each piece's posts, and how the whole stands. It reads a page and counts the rest, never the library.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const route = await import(at("apps/dashboard/app/api/v1/content/route.ts"));
const { CONTENT_PAGE } = await import(at("packages/contracts/src/content/page.ts"));
const { MIN_MS, DAY_MS } = await import(at("packages/contracts/src/shared/time.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";
const idOf = (n) => `ffffffff-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pieceId = (n) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = Date.now();
const minutesAgo = (n) => new Date(NOW - n * MIN_MS).toISOString();
const DAY_MINUTES = DAY_MS / MIN_MS;

/** A file made here, a minute older than the one before it, by its number. */
const made = (n, over = {}) => ({
  id: idOf(n),
  tenant_id: A,
  status: "filed",
  source: "made",
  source_ref: null,
  name: `post-${n}`,
  mime: "image/jpeg",
  bytes: 1000,
  width: 1080,
  height: 1350,
  look: { line: "A post." },
  look_status: "done",
  shows: "graphic",
  who_in_it: "not_asked",
  removed_at: null,
  kind: "image",
  seconds: null,
  media_status: null,
  sound_said: null,
  created_at: minutesAgo(n),
  updated_at: minutesAgo(n),
  ...over,
});

const posted = (n, fileN, place, status, over = {}) => ({
  id: `dddddddd-0000-4000-8000-${String(n).padStart(12, "0")}`,
  tenant_id: A,
  file_id: idOf(fileN),
  place,
  kind: "picture",
  caption: "Open Saturdays.",
  status,
  held_reason: null,
  permalink: status === "published" ? "https://example.com/p/1" : null,
  scheduled_for: minutesAgo(n),
  published_at: status === "published" ? minutesAgo(n) : null,
  error: null,
  external_id: status === "published" ? `ext-${n}` : null,
  created_at: minutesAgo(n),
  ...over,
});

const piece = (n, over = {}) => ({
  id: pieceId(n),
  tenant_id: A,
  shape: "hook_cut",
  plan: {
    shape: "hook_cut",
    cuts: [
      { file_id: idOf(900), from: 0, to: 3 },
      { file_id: idOf(900), from: 4, to: 7 },
    ],
    lines: ["Three years", "of layers."],
    words_at: "high",
    words_hold: "first",
    end_line: null,
    language: "en",
    people_agreed: false,
  },
  look: {},
  status: "making",
  stage: "drawing",
  failed_why: null,
  edition: 1,
  file_id: null,
  machine: null,
  card_key: `card-${n}`,
  created_by: USER,
  created_at: minutesAgo(n),
  updated_at: minutesAgo(n),
  made_at: null,
  ...over,
});

const read = async (tables, query = "") => {
  const ctx = {
    supabase: fakeDb(
      {
        files: [],
        posts: [],
        pieces: [],
        ...tables,
        memberships: [
          {
            user_id: USER,
            tenant_id: A,
            role: "owner",
            tenants: { slug: "harbor" },
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      {},
      {},
    ),
    userId: USER,
    email: "ada@example.com",
    params: {},
  };
  const body = await route.GET.run(
    new Request(`http://localhost/api/v1/content?workspace=${A}${query ? `&${query}` : ""}`),
    ctx,
  );
  return { body };
};

test("a workspace that made nothing reads an empty page, and says so in numbers", async () => {
  const { body } = await read({});
  assert.deepEqual(body, { making: [], made: [], next: null, tally: { made: 0, posted: 0 } });
});

test("what was made comes newest first, each with its own posts, and nothing that is not made here", async () => {
  const { body } = await read({
    files: [made(3), made(1), made(2), made(4, { source: "upload", name: "a-photo" }), made(5, { tenant_id: B })],
    posts: [
      posted(1, 1, "instagram", "published"),
      posted(2, 1, "google", "queued"),
      posted(3, 2, "instagram", "failed"),
      posted(4, 5, "instagram", "published", { tenant_id: B }),
    ],
  });
  assert.deepEqual(
    body.made.map((m) => m.file.name),
    ["post-1", "post-2", "post-3"],
  );
  assert.deepEqual(
    body.made[0].posts.map((p) => `${p.place}:${p.status}`),
    ["instagram:published", "google:queued"],
  );
  assert.deepEqual(
    body.made[1].posts.map((p) => p.status),
    ["failed"],
  );
  assert.deepEqual(body.made[2].posts, []);
  assert.deepEqual(body.tally, { made: 3, posted: 1 });
  assert.equal("external_id" in body.made[0].posts[0], false, "a post's id at the platform stays the server's");
});

test("a page holds a page, says there is more, and the next page starts where it ended", async () => {
  const files = Array.from({ length: CONTENT_PAGE + 5 }, (_, i) => made(i + 1));
  const first = (await read({ files })).body;
  assert.equal(first.made.length, CONTENT_PAGE);
  assert.equal(first.tally.made, CONTENT_PAGE + 5, "the tally is of all of it, not of the page");
  assert.ok(first.next);
  const second = (await read({ files }, `before=${encodeURIComponent(first.next)}`)).body;
  assert.equal(second.made.length, 5);
  assert.equal(second.next, null);
  assert.equal(second.made[0].file.name, `post-${CONTENT_PAGE + 1}`);
});

test("a cursor this route did not give, and a limit past the cap, are refused", async () => {
  await assert.rejects(read({ files: [made(1)] }, "before=nonsense"), (e) => e.code === "validation");
  await assert.rejects(read({ files: [made(1)] }, "limit=100000"), (e) => e.code === "validation");
});

test("videos being made lead the first page, with their opening words and where they are at", async () => {
  const { body } = await read({
    pieces: [
      piece(2, { stage: "queued" }),
      piece(1),
      piece(3, { status: "made", file_id: idOf(7), made_at: minutesAgo(1) }),
      piece(4, { tenant_id: B }),
    ],
    files: [made(7, { kind: "video", mime: "video/mp4", media_status: "ready", seconds: 11.7, name: "three-years" })],
  });
  assert.deepEqual(
    body.making.map((m) => [m.id, m.status, m.stage, m.moments]),
    [
      [pieceId(1), "making", "drawing", 2],
      [pieceId(2), "making", "queued", 2],
    ],
  );
  assert.deepEqual(body.making[0].lines, ["Three years", "of layers."]);
  assert.equal(body.making[0].language, "en");
  assert.equal(body.made.length, 1, "one that was made is its file's tile, and no row among the ones being made");
});

test("one that was not made stays a week, with why, and then goes", async () => {
  const { body } = await read({
    pieces: [
      piece(1, { status: "failed", failed_why: "clips", created_at: minutesAgo(2 * DAY_MINUTES) }),
      piece(2, { status: "failed", failed_why: "draw", created_at: minutesAgo(8 * DAY_MINUTES) }),
    ],
  });
  assert.deepEqual(
    body.making.map((m) => [m.status, m.failed_why]),
    [["failed", "clips"]],
  );
});

test("a video whose file has arrived is drawn once, as its file", async () => {
  const { body } = await read({
    pieces: [piece(1, { stage: "saving", file_id: idOf(7) })],
    files: [made(7, { kind: "video", mime: "video/mp4", media_status: "processing", seconds: 11.7 })],
  });
  assert.equal(body.made.length, 1);
  assert.deepEqual(body.making, []);
});

test("a later page asks for nothing of what is being made again", async () => {
  const files = Array.from({ length: CONTENT_PAGE + 1 }, (_, i) => made(i + 1));
  const first = (await read({ files, pieces: [piece(1)] })).body;
  assert.equal(first.making.length, 1);
  const second = (await read({ files, pieces: [piece(1)] }, `before=${encodeURIComponent(first.next)}`)).body;
  assert.deepEqual(second.making, []);
});
