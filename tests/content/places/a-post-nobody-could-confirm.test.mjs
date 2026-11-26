/**
 * A post its place never confirmed (the content status review of 24 Nov 2026, A6 and D5). Instagram, or a Page, took the
 * post and was never read holding it: nobody here can say it is up. Before this the open piece showed one long amber
 * sentence with nothing to press, and a post Instagram then said it did not hold stayed "posted" until a later read took
 * it down and rang a take-down for a post that never went up.
 *
 * Its owner can look, so its owner is asked, with two presses: "It's there" and "It's not there" (POST
 * files/[id]/posts). The first says it is up from now; the second that it never went up, which is a post that did not
 * go, to post again, and never a take-down. The tile and the open piece say the same words meanwhile. The edge's own
 * two paths to the same end are in tests/content/places/a-post-goes-up-as-approved.test.mjs and
 * tests/content/results/a-post-gone-from-its-place.test.mjs.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  STANDING_WORDS,
  contentMarkSaid,
  contentPieceMarkOf,
  placementStandingOf,
  postNeverSeen,
} from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import {
  goesLinesOf,
  goesPillOf,
  goesLeadOf,
} from "../../../apps/dashboard/src/surfaces/campaigns/content/model/goes.ts";
import { pieceNextOf, pieceTakesOf } from "../../../apps/dashboard/src/surfaces/campaigns/content/model/piece-open.ts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const posts = await import(at("apps/dashboard/app/api/v1/files/[id]/posts/route.ts"));

beforeEach(() => setRateStore(memoryStore()));
after(() => setServiceClient(null));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-000000000051";
const USER = "11111111-1111-4111-8111-111111111111";
const FILE = "ffffffff-0000-4000-8000-000000000051";
const OTHER_FILE = "ffffffff-0000-4000-8000-000000000052";
const POST = "dddddddd-0000-4000-8000-000000000051";
const ELSEWHERE = "dddddddd-0000-4000-8000-000000000052";
/** Sent an hour ago: well past the time the read that looks for a new post takes. */
const NOW = Date.now();
const SENT = new Date(NOW - 3_600_000).toISOString();

const fileRow = (id, name) => ({
  id,
  tenant_id: T,
  status: "filed",
  source: "made",
  source_ref: null,
  name,
  mime: "image/jpeg",
  bytes: 1000,
  width: 1080,
  height: 1350,
  look: { line: "A post." },
  look_status: "done",
  shows: "graphic",
  who_in_it: "no_one",
  removed_at: null,
  kind: "image",
  seconds: null,
  created_at: SENT,
  updated_at: SENT,
});

const postRow = (id, fileId, over = {}) => ({
  id,
  tenant_id: T,
  file_id: fileId,
  place: "instagram",
  kind: "picture",
  caption: "Open late on Fridays.",
  status: "published",
  held_reason: null,
  held_why: null,
  permalink: null,
  scheduled_for: SENT,
  published_at: SENT,
  verified_at: null,
  good_until: null,
  error: null,
  external_id: "17900000000000051",
  created_at: SENT,
  updated_at: SENT,
  ...over,
});

/** A piece whose post Instagram took an hour ago and was never read holding; each move of a post, in order. */
function world({ role = "owner", post = {} } = {}) {
  const moves = [];
  const tables = {
    memberships: [
      { user_id: USER, tenant_id: T, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: T, name: "Harbor", slug: "harbor", timezone: "UTC", status: "active" }],
    files: [fileRow(FILE, "the-finish"), fileRow(OTHER_FILE, "another")],
    posts: [postRow(POST, FILE, post), postRow(ELSEWHERE, OTHER_FILE)],
  };
  const rpc = {
    // The door as 00681 writes it: moved only from where it stood; what the patch names is kept, the rest stands.
    post_moved: ({ p_post_id, p_from, p_to, p_patch }) => {
      const row = tables.posts.find((p) => p.id === p_post_id);
      if (!row || !p_from.includes(row.status)) return false;
      moves.push([p_post_id, row.status, p_to]);
      row.status = p_to;
      if (p_patch.verified_at) row.verified_at = p_patch.verified_at;
      if ("error" in p_patch) row.error = p_patch.error;
      row.updated_at = new Date().toISOString();
      return true;
    },
    // The owner's word as 00720 writes it (post_seen_say): a post still up, never seen and not Google's moves through
    // post_moved; anything else moves nothing.
    post_seen_say: ({ p_post_id, p_there, p_words }) => {
      const row = tables.posts.find((p) => p.id === p_post_id);
      if (!row || row.status !== "published" || row.place === "google" || row.verified_at) return false;
      return p_there
        ? rpc.post_moved({
            p_post_id,
            p_from: ["published"],
            p_to: "published",
            p_patch: { verified_at: new Date().toISOString() },
          })
        : rpc.post_moved({
            p_post_id,
            p_from: ["published"],
            p_to: "failed",
            p_patch: { error: { code: null, subcode: null, words: p_words } },
          });
    },
  };
  // The member's session reads and says; the door moves. One world behind both, as one database is.
  const db = fakeDb(tables, {}, rpc);
  setServiceClient(db);
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: { id: FILE } };
  const say = (body) =>
    posts.POST.run(
      new Request(`http://localhost/api/v1/files/${FILE}/posts?workspace=${T}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      ctx,
    );
  const kept = () => tables.posts[0];
  /** The post as a page reads it: its refusal in words, never its code. */
  const dto = () => ({ ...kept(), error: kept().error?.words ?? null });
  return { tables, moves, say, post: kept, dto };
}

const picture = { kind: "image", source: "made", status: "filed", shows: null, media_status: null };
const day = () => "Tuesday";
const when = (iso) => `@${iso.slice(11, 16)}`;
const known = { takeDown: null, when, nowMs: NOW, may: true };
/** What the tile, the open piece's status and its line say of the piece, and what its line and its button offer. */
function readersOf(post) {
  const mark = contentPieceMarkOf({ file: picture, posts: [post] }, NOW, true);
  const lines = goesLinesOf([post], known);
  const pill = goesPillOf(lines, goesLeadOf([post], null, NOW));
  const takes = pieceTakesOf([post], {
    instagram: true,
    google: true,
    onGoogle: false,
    facebook: false,
    fileKind: "image",
  });
  const [line] = lines;
  return {
    tile: contentMarkSaid(mark, day),
    status: pill?.said ?? null,
    line: line.said,
    note: line.note,
    tone: line.tone,
    acts: line.acts.map((act) => act.is),
    next: pieceNextOf(picture, [post], takes, NOW).is,
  };
}

test("meanwhile the tile and the open piece say the same words, and the line asks with two presses", () => {
  const w = world();
  assert.equal(placementStandingOf(w.dto(), null, NOW).is, "unconfirmed");
  const read = readersOf(w.dto());
  assert.equal(read.tile, "Couldn't confirm it's on Instagram");
  assert.equal(read.status, read.tile, "one sentence, on the tile and in the open piece");
  assert.equal(read.line, read.tile);
  assert.equal(read.note, "Instagram never said it has this post. Look at the account, then say which.");
  assert.equal(read.tone, "you");
  assert.deepEqual(read.acts, ["there", "not_there"], "the first is the press that leads");
  assert.deepEqual(
    [STANDING_WORDS.unconfirmed.there, STANDING_WORDS.unconfirmed.notThere],
    ["It's there", "It's not there"],
  );
  // A Page's post says the Page.
  assert.equal(
    STANDING_WORDS.unconfirmed.note("facebook"),
    "Facebook never said it has this post. Look at the Page, then say which.",
  );
  // Someone who may not post is asked nothing.
  assert.deepEqual(
    goesLinesOf([w.dto()], { ...known, may: false })[0].acts.map((act) => act.is),
    [],
  );
  // Ten minutes are the read's: until then it is still going up, and nobody is asked.
  const fresh = { ...w.dto(), published_at: new Date(NOW - 60_000).toISOString() };
  assert.deepEqual(readersOf(fresh).acts, []);
  assert.equal(readersOf(fresh).line, "Posting to Instagram");
});

test("It's there: the post is up from now, on its owner's word, and says so everywhere", async () => {
  const w = world();
  assert.deepEqual(await w.say({ post_id: POST, there: true }), { moved: true });
  assert.deepEqual(w.moves, [[POST, "published", "published"]]);
  assert.ok(w.post().verified_at, "seen, by its owner");
  assert.equal(postNeverSeen(w.post()), false);
  const read = readersOf(w.dto());
  assert.equal(read.tile, "On Instagram · Tuesday");
  assert.equal(read.tone, "ok");
  assert.deepEqual(read.acts, [], "nothing more is asked");
  // Pressed again by a page that had not heard: nothing moves, and nothing is refused.
  assert.deepEqual(await w.say({ post_id: POST, there: true }), { moved: false });
  assert.deepEqual(await w.say({ post_id: POST, there: false }), { moved: false }, "a post seen is not un-seen");
  assert.equal(w.post().status, "published");
});

test("It's not there: it never went up, so it is a post that did not go, to post again, and never a take-down", async () => {
  const w = world();
  assert.deepEqual(await w.say({ post_id: POST, there: false }), { moved: true });
  assert.deepEqual(w.moves, [[POST, "published", "failed"]], "never taken_down: nothing was up to take down");
  assert.deepEqual(w.post().error, { code: null, subcode: null, words: "Instagram doesn't have it." });
  const read = readersOf(w.dto());
  assert.equal(read.tile, "Didn't post");
  assert.equal(read.line, "Didn't post · Instagram doesn't have it.");
  assert.equal(read.tone, "you");
  assert.equal(read.next, "again", "Post again");
  assert.equal(placementStandingOf(w.dto(), null, NOW).is, "stopped");
});

test("only a post nobody could confirm is asked about: one seen, one that stopped, and Google's are left as they stand", async () => {
  const seen = world({ post: { verified_at: SENT } });
  assert.deepEqual(await seen.say({ post_id: POST, there: false }), { moved: false });
  assert.equal(seen.post().status, "published");
  const stopped = world({ post: { status: "failed", published_at: null } });
  assert.deepEqual(await stopped.say({ post_id: POST, there: true }), { moved: false });
  assert.equal(stopped.post().status, "failed");
  // Google says a post is up as it takes it: there is no unseen Google post to ask about.
  const google = world({ post: { place: "google" } });
  assert.deepEqual(await google.say({ post_id: POST, there: false }), { moved: false });
  assert.deepEqual(google.moves, []);
});

test("another piece's post, a word that is neither, and someone who may not post are each refused", async () => {
  const w = world();
  await assert.rejects(w.say({ post_id: ELSEWHERE, there: true }), (e) => e.status === 404 && e.code === "not_found");
  await assert.rejects(w.say({ post_id: POST }), (e) => e.code === "validation");
  await assert.rejects(w.say({ post_id: POST, there: "yes" }), (e) => e.code === "validation");
  await assert.rejects(w.say({ post_id: POST, there: true, keep: true }), (e) => e.code === "validation");
  assert.deepEqual(w.moves, []);
  const reader = world({ role: "viewer" });
  await assert.rejects(reader.say({ post_id: POST, there: true }), (e) => e.status === 403);
  assert.deepEqual(reader.moves, []);
});
