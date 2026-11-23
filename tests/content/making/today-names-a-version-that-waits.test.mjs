/**
 * Today names a post that waits for a new version's approval (00708; the version board, cell 5): GET content/note, run through
 * route() over a database in memory, answers the soonest post set to go whose piece has moved to a newer version since it
 * was approved, with the piece's own file (the version that asks) and that version's number. A post approved at the
 * version its piece stands at, one already up or let go, and another workspace's are never named.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const route = await import(at("apps/dashboard/app/api/v1/content/note/route.ts"));
const { CONTENT_TODAY_WORDS, HOUR_MS } = await import("@chanlytics/contracts");

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";
const idOf = (kind, n) => `${kind.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = Date.now();
const hoursFrom = (n) => new Date(NOW + n * HOUR_MS).toISOString();

const video = (n, over = {}) => ({
  id: idOf("f", n),
  tenant_id: A,
  status: "filed",
  source: "made",
  source_ref: null,
  name: `video-${n}`,
  mime: "video/mp4",
  bytes: 1000,
  width: 1080,
  height: 1920,
  look: { line: "A reel." },
  look_status: "done",
  shows: "work",
  who_in_it: "not_asked",
  removed_at: null,
  kind: "video",
  seconds: 12,
  media_status: "ready",
  sound_said: null,
  // Older than the week: the note's own week stays empty, so only the version speaks.
  created_at: hoursFrom(-24 * 30),
  updated_at: hoursFrom(-24 * 30),
  ...over,
});

/** A piece standing at `revision`, its file the newest version's. */
const pieceAt = (n, fileN, revision, over = {}) => ({
  id: idOf("e", n),
  tenant_id: A,
  revises: null,
  file_id: idOf("f", fileN),
  revision,
  shape: "blocks",
  plan: { blocks: [] },
  look: {},
  status: "made",
  stage: "saving",
  edition: 3,
  card_key: `card-${n}`,
  created_at: hoursFrom(-24 * 30),
  updated_at: hoursFrom(-1),
  made_at: hoursFrom(-24 * 30),
  failed_reason: null,
  ...over,
});

/** A post of a piece, approved at `revision`, set for so many hours from now. */
const post = (n, pieceN, fileN, revision, hours, over = {}) => ({
  id: idOf("d", n),
  tenant_id: A,
  file_id: idOf("f", fileN),
  piece_id: idOf("e", pieceN),
  revision,
  place: "instagram",
  kind: "reel",
  caption: "The finish.",
  status: "queued",
  held_reason: null,
  held_why: null,
  permalink: null,
  scheduled_for: hoursFrom(hours),
  published_at: null,
  error: null,
  external_id: null,
  created_at: hoursFrom(-24),
  ...over,
});

const read = async (tables) => {
  const ctx = {
    supabase: fakeDb(
      {
        files: [],
        posts: [],
        pieces: [],
        remediation_actions: [],
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
  const body = await route.GET.run(new Request(`http://localhost/api/v1/content/note?workspace=${A}`), ctx);
  return body.today;
};

test("the soonest post approved at an older version is named, with the version that asks and its number", async () => {
  const today = await read({
    // The finish stands at version 2 (its file video-2); video-1 is version 1's own file.
    files: [video(1), video(2), video(3)],
    pieces: [pieceAt(1, 2, 2), pieceAt(2, 3, 3)],
    posts: [post(1, 1, 1, 1, 6), post(2, 2, 3, 2, 3), post(3, 1, 1, 1, 9)],
  });
  assert.equal(today.version?.file.name, "video-3");
  assert.equal(today.version?.n, 3);
  assert.equal(today.version?.at, hoursFrom(3));
  assert.equal(CONTENT_TODAY_WORDS.versionWaits(3, "Tue, 6:00 PM"), "Approve version 3 · goes up Tue, 6:00 PM");
});

test("a post approved at the version its piece stands at, one up or let go, and another workspace's are never named", async () => {
  const today = await read({
    files: [video(1), video(2)],
    pieces: [pieceAt(1, 2, 2), pieceAt(2, 1, 1, { tenant_id: B })],
    posts: [
      post(1, 1, 2, 2, 2),
      post(2, 1, 1, 1, 4, { status: "published", published_at: hoursFrom(-1) }),
      post(3, 1, 1, 1, 5, { status: "pulled" }),
      post(4, 2, 1, 0, 1, { tenant_id: B }),
    ],
  });
  assert.equal(today.version, null);
});
