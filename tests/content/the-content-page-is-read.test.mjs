/**
 * GET content, Campaigns › Content's one read, run through route() over a database in memory: what is being made, a page of
 * what was made with each piece's posts, and how the whole stands. It reads a page and counts the rest, never the library.
 * And each view of Made: what needs the owner, what is being made, what waits for its time, what is up.
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
        google_reviews: [],
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

const NOTHING = { made: 0, posted: 0, needs: 0, making: 0, scheduled: 0, library: 0, aside: 0 };
/** Ask's three ideas of what it can make, each with the files it would start from: none, where the Library holds none. */
/** With nothing kept, no idea has what it is made from: none is offered (contracts contentIdeasReady). */
const IDEAS_NONE = ["before_after", "review", "video", "photo_post"].map((key) => ({ key, files: [], ready: false }));

test("a workspace that made nothing reads an empty page, and says so in numbers", async () => {
  const { body } = await read({});
  assert.deepEqual(body, {
    view: "all",
    making: [],
    made: [],
    lines: [],
    next: null,
    ideas: IDEAS_NONE,
    about: null,
    needsOne: null,
    tally: NOTHING,
  });
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
  // The Library holds the photo uploaded here, apart from what was made.
  assert.deepEqual(body.tally, { made: 3, posted: 1, needs: 1, making: 0, scheduled: 0, library: 1, aside: 0 });
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

const minutesAhead = (n) => new Date(NOW + n * MIN_MS).toISOString();

test("Needs you is the posts that stopped and are still the newest at their place, and the videos not made", async () => {
  const { body } = await read(
    {
      files: [made(1), made(2), made(3)],
      posts: [
        // File 1: refused on Instagram, then sent again and up: no longer the owner's to mend.
        posted(9, 1, "instagram", "failed"),
        posted(2, 1, "instagram", "published"),
        // File 2: held on Instagram and nothing since; up on Google, which is not a stop.
        posted(5, 2, "instagram", "held", { held_reason: "It waits for the Meta link." }),
        posted(6, 2, "google", "published"),
        // File 3: refused on Google, the newest there.
        posted(7, 3, "google", "failed", { error: { words: "Google is busy right now." } }),
      ],
      pieces: [piece(1, { status: "failed", failed_why: "clips" }), piece(2)],
    },
    "view=needs",
  );
  assert.equal(body.view, "needs");
  assert.deepEqual(
    body.lines.map((l) => [l.file.name, l.post.place, l.post.status]),
    [
      ["post-2", "instagram", "held"],
      ["post-3", "google", "failed"],
    ],
  );
  assert.equal(body.lines[1].post.error, "Google is busy right now.");
  assert.deepEqual(
    body.making.map((m) => m.status),
    ["failed"],
    "a video not made needs the owner; one being made does not",
  );
  assert.deepEqual(body.made, []);
  assert.equal(body.tally.needs, 3);
  assert.equal(body.tally.making, 1);
});

test("Scheduled is the posts that wait for their time, soonest first, and not the ones going up now", async () => {
  const { body } = await read(
    {
      files: [made(1), made(2), made(3)],
      posts: [
        posted(1, 1, "instagram", "queued", { scheduled_for: minutesAhead(600) }),
        posted(2, 2, "instagram", "queued", { scheduled_for: minutesAhead(60) }),
        posted(3, 3, "instagram", "queued", { scheduled_for: minutesAgo(0) }),
      ],
    },
    "view=scheduled",
  );
  assert.deepEqual(
    body.lines.map((l) => l.file.name),
    ["post-2", "post-1"],
  );
  assert.equal(body.tally.scheduled, 2);
});

test("Posted is the posts that are up, newest first, each with its piece, and none of a piece that is gone", async () => {
  const { body } = await read(
    {
      files: [made(1), made(2), made(3, { removed_at: minutesAgo(1) })],
      posts: [
        posted(30, 1, "google", "published"),
        posted(10, 2, "instagram", "published"),
        posted(20, 3, "instagram", "published"),
        posted(5, 2, "google", "queued"),
      ],
    },
    "view=posted",
  );
  assert.deepEqual(
    body.lines.map((l) => [l.file.name, l.post.place]),
    [
      ["post-2", "instagram"],
      ["post-1", "google"],
    ],
  );
  assert.equal(body.lines[0].post.permalink, "https://example.com/p/1");
});

test("Posted comes a page at a time, and the next page starts where it ended", async () => {
  const files = Array.from({ length: 30 }, (_, i) => made(i + 1));
  const posts = files.map((_, i) => posted(i + 1, i + 1, "instagram", "published"));
  const first = (await read({ files, posts }, "view=posted")).body;
  assert.equal(first.lines.length, 24);
  assert.ok(first.next);
  const second = (await read({ files, posts }, `view=posted&before=${encodeURIComponent(first.next)}`)).body;
  assert.equal(second.lines.length, 6);
  assert.equal(second.next, null);
  assert.equal(second.lines[0].file.name, "post-25");
});

test("Being made is what is being made and what was not, and a view this build does not know is refused", async () => {
  const { body } = await read(
    { pieces: [piece(1), piece(2, { status: "failed", failed_why: "draw" })] },
    "view=making",
  );
  assert.equal(body.making.length, 2);
  await assert.rejects(read({}, "view=everything"), (e) => e.code === "validation");
});

test("an idea is ready only where what it is made from is there: a photo for a post, a review that says something for its video", async () => {
  const none = await read({});
  assert.deepEqual(
    none.body.ideas.map((i) => [i.key, i.ready]),
    [
      ["before_after", false],
      ["review", false],
      ["video", false],
      ["photo_post", false],
    ],
  );
  const { body } = await read({
    files: [made(4, { source: "upload", name: "a-photo" })],
    google_reviews: [
      { id: "r-1", tenant_id: A, body: "They were on time and careful.", published_at: "2026-11-01T12:00:00Z" },
      { id: "r-2", tenant_id: B, body: "Another workspace's.", published_at: "2026-11-02T12:00:00Z" },
    ],
  });
  const ready = Object.fromEntries(body.ideas.map((i) => [i.key, i.ready]));
  assert.deepEqual(ready, { before_after: false, review: true, video: false, photo_post: true });
  assert.deepEqual(
    body.ideas.find((i) => i.key === "photo_post").files.map((f) => f.name),
    ["a-photo"],
    "the photo its row shows is the one Ask is asked to use",
  );
});

test("a post its owner put up by hand is read with its piece, apart from what was sent, and Posted leaves it out", async () => {
  const hand = (n, over = {}) => posted(n, 1, "hand", "published", { permalink: null, ...over });
  const { body } = await read({
    files: [made(1), made(2)],
    posts: [
      hand(1, { permalink: "https://www.tiktok.com/@harbor/video/1", published_at: "2026-11-10T15:00:00.000Z" }),
      posted(2, 1, "google", "published"),
      posted(3, 2, "hand", "pulled"),
    ],
  });
  const [first, second] = body.made;
  assert.equal(first.file.name, "post-1");
  assert.deepEqual(
    first.posts.map((p) => p.place),
    ["google"],
    "never drawn as a post at a place of ours",
  );
  assert.equal(first.by_hand.link, "https://www.tiktok.com/@harbor/video/1");
  assert.equal(first.by_hand.at, "2026-11-10T15:00:00.000Z");
  assert.equal(second.by_hand, null, "one taken back says nothing");
  assert.equal(body.tally.posted, 1, "Posted counts what a press sent");
  const up = await read({ files: [made(1)], posts: [hand(1), posted(2, 1, "google", "published")] }, "view=posted");
  assert.deepEqual(
    up.body.lines.map((l) => l.post.place),
    ["google"],
  );
});
