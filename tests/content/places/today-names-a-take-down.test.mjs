/**
 * Today names a take-down that is still open (the content loop's pass 1b; the canvas's Today 2 and 5): GET content/note,
 * run through route() over a database in memory, answers the posts still up that a place left to the owner to delete,
 * and those a place has not answered about in a day, each with its piece. One that is still being asked is not named:
 * nothing is late and nothing is the owner's. A post that came down since, a piece set aside, and another workspace's
 * are never named. The owner's to finish comes before one that only waits, and a piece is named once.
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
const { CONTENT_TODAY_DOWN, CONTENT_TODAY_WORDS, HOUR_MS, TAKE_DOWN_UNCONFIRMED_MS, contentDownOf } =
  await import("@chanlytics/contracts");

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";
const REM = "99999999-0000-4000-8000-000000000001";
const idOf = (kind, n) => `${kind.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = Date.now();
const hoursAgo = (n) => new Date(NOW - n * HOUR_MS).toISOString();

const piece = (n, over = {}) => ({
  id: idOf("f", n),
  tenant_id: A,
  status: "filed",
  source: "made",
  source_ref: null,
  name: `piece-${n}`,
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
  // Older than the week: the note's own week stays empty, so only the take-downs speak.
  created_at: hoursAgo(24 * 30),
  updated_at: hoursAgo(24 * 30),
  ...over,
});

const up = (n, fileN, place, over = {}) => ({
  id: idOf("d", n),
  tenant_id: A,
  file_id: idOf("f", fileN),
  place,
  kind: "picture",
  caption: "Open Saturdays.",
  status: "published",
  held_reason: null,
  permalink: "https://example.com/p/1",
  scheduled_for: hoursAgo(72),
  published_at: hoursAgo(72),
  error: null,
  external_id: `ext-${n}`,
  created_at: hoursAgo(72),
  ...over,
});

/** A take-down's action on a post, begun so many hours ago. */
const action = (n, postN, outcome, hours, over = {}) => ({
  id: idOf("c", n),
  tenant_id: A,
  remediation_id: REM,
  target_type: "post",
  target_id: idOf("d", postN),
  act: "take_down",
  outcome,
  said: null,
  started_at: hoursAgo(hours),
  finished_at: outcome === "pending" ? null : hoursAgo(hours),
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
const said = (down) => down.map((d) => [d.file.name, d.place, d.is]);

test("where an open take-down stands for Today: the owner's, late, or still being asked", () => {
  const begun = (ms) => new Date(NOW - ms).toISOString();
  for (const outcome of ["needs_person", "blocked", "not_possible"])
    assert.equal(contentDownOf({ outcome, started_at: begun(0) }, NOW), "by_hand", outcome);
  assert.equal(contentDownOf({ outcome: "pending", started_at: begun(HOUR_MS) }, NOW), null, "being asked: not named");
  assert.equal(
    contentDownOf({ outcome: "pending", started_at: begun(TAKE_DOWN_UNCONFIRMED_MS + 1000) }, NOW),
    "unconfirmed",
    "past a day with no answer",
  );
  assert.equal(
    contentDownOf({ outcome: "left_up", started_at: begun(0) }, NOW),
    null,
    "left up by the owner's own word: nothing is asked of anyone",
  );
});

test("a post its owner chose to leave up is never named, whatever an older take-down of it says", async () => {
  const today = await read({
    files: [piece(1), piece(2)],
    posts: [up(1, 1, "instagram"), up(2, 2, "google")],
    remediation_actions: [
      // "Keep it up" answers every ask of that post a place left to the owner (00688).
      action(1, 1, "left_up", 2),
      action(3, 1, "left_up", 9),
      action(2, 2, "needs_person", 5),
    ],
  });
  assert.deepEqual(said(today.down), [["piece-2", "google", "by_hand"]]);
});

test("many posts left up never crowd out the one still to delete", async () => {
  const kept = Array.from({ length: 12 }, (_, i) => i + 10);
  const today = await read({
    files: [piece(1), ...kept.map((n) => piece(n))],
    posts: [up(1, 1, "instagram"), ...kept.map((n) => up(n, n, "instagram"))],
    // Every one left up was begun after the one that still waits on its owner, so each is read before it.
    remediation_actions: [action(1, 1, "needs_person", 48), ...kept.map((n) => action(n, n, "left_up", 1))],
  });
  assert.deepEqual(said(today.down), [["piece-1", "instagram", "by_hand"]]);
});

test("a post its place left to the owner is named with its piece, and one still being asked is not", async () => {
  const today = await read({
    files: [piece(1), piece(2)],
    posts: [up(1, 1, "instagram"), up(2, 2, "google")],
    remediation_actions: [action(1, 1, "needs_person", 2), action(2, 2, "pending", 2)],
  });
  assert.deepEqual(said(today.down), [["piece-1", "instagram", "by_hand"]]);
  assert.equal(today.stopped, null, "a take-down is no post that did not go");
});

test("a place that has not answered in a day is named after the owner's own, whatever was begun last", async () => {
  const today = await read({
    files: [piece(1), piece(2)],
    posts: [up(1, 1, "instagram"), up(2, 2, "google")],
    // The late one was begun after the refused one, so it is read first.
    remediation_actions: [action(1, 1, "needs_person", 40), action(2, 2, "pending", 30)],
  });
  assert.deepEqual(said(today.down), [
    ["piece-1", "instagram", "by_hand"],
    ["piece-2", "google", "unconfirmed"],
  ]);
});

test("a piece is named once, and no more pieces than Today names", async () => {
  const many = [1, 2, 3, 4];
  const today = await read({
    files: many.map((n) => piece(n)),
    posts: [...many.map((n) => up(n, n, "instagram")), up(9, 1, "google")],
    remediation_actions: [...many.map((n) => action(n, n, "needs_person", n)), action(9, 9, "needs_person", 1)],
  });
  assert.equal(today.down.length, CONTENT_TODAY_DOWN);
  assert.equal(
    new Set(today.down.map((d) => d.file.id)).size,
    today.down.length,
    "piece-1 is up at two places, named once",
  );
});

test("a post that came down since, a piece set aside, and another workspace's are never named", async () => {
  const today = await read({
    files: [piece(1), piece(2, { status: "set_aside" }), piece(3, { tenant_id: B })],
    posts: [
      up(1, 1, "instagram", { status: "taken_down" }),
      up(2, 2, "instagram"),
      up(3, 3, "instagram", { tenant_id: B }),
    ],
    remediation_actions: [
      // Refused once, then taken down by a later press: the older action still says needs_person.
      action(1, 1, "needs_person", 5),
      action(2, 2, "needs_person", 5),
      action(3, 3, "needs_person", 5, { tenant_id: B }),
    ],
  });
  assert.deepEqual(today.down, []);
});

test("the line's words: what to do and where, or that nothing is asked of the owner", () => {
  assert.equal(
    CONTENT_TODAY_WORDS.down({ is: "by_hand", place: "instagram" }),
    "Delete it in Instagram · Chanlytics couldn't",
  );
  assert.equal(
    CONTENT_TODAY_WORDS.down({ is: "unconfirmed", place: "google" }),
    "Google hasn't confirmed it's gone · Chanlytics is on it",
  );
});
