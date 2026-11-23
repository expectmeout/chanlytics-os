/**
 * "Keep it up" (the content loop PRD's 8.3, taken on 23 November 2026; 00688): where a place left a post to its owner to
 * delete, the owner's word that it stays, through PUT files/[id]/posts run by route() over a database in memory. The
 * press goes through its own door on the member's session and asks nothing of the place; "I deleted it" keeps its
 * door, and a page that had not heard cannot undo the owner's word. A take-down job that arrives late for a post left
 * up asks nothing.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ON_INSTAGRAM, TAKE_DOWN_BELL, warningsMendedBy } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const posts = await import(at("apps/dashboard/app/api/v1/files/[id]/posts/route.ts"));
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { takePostDown } = await import(at("apps/edge/lib/content/take-down.ts"));
const { readPieceTakeDown } = await import(at("apps/dashboard/src/server/posts/take-down.ts"));

beforeEach(() => setRateStore(memoryStore()));
after(() => setPg(null));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-000000000041";
const USER = "11111111-1111-4111-8111-111111111111";
const FILE = "ffffffff-0000-4000-8000-000000000041";
const OTHER_FILE = "ffffffff-0000-4000-8000-000000000042";
const POST = "dddddddd-0000-4000-8000-000000000041";
const ELSEWHERE = "dddddddd-0000-4000-8000-000000000042";
const ACTION = "cccccccc-0000-4000-8000-000000000041";
const NOW = "2026-12-01T18:00:00.000Z";

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
  created_at: NOW,
  updated_at: NOW,
});

const postRow = (id, fileId) => ({
  id,
  tenant_id: T,
  file_id: fileId,
  place: "instagram",
  kind: "picture",
  caption: "Open late on Fridays.",
  status: "published",
  held_reason: null,
  held_why: null,
  permalink: "https://www.instagram.com/p/abc/",
  scheduled_for: NOW,
  published_at: NOW,
  error: null,
  external_id: "17900000000000041",
  created_at: NOW,
  updated_at: NOW,
});

/** A piece up on Instagram whose take-down Instagram left to the owner, and each door asked, in order. */
function world({ role = "owner", outcome = "needs_person" } = {}) {
  const doors = [];
  const action = {
    id: ACTION,
    tenant_id: T,
    remediation_id: "99999999-0000-4000-8000-000000000041",
    target_type: "post",
    target_id: POST,
    act: "take_down",
    outcome,
    said: ON_INSTAGRAM.takeDown.byHand,
    started_at: NOW,
    finished_at: outcome === "pending" ? null : NOW,
    left_up_by: null,
  };
  const tables = {
    memberships: [
      { user_id: USER, tenant_id: T, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
    ],
    tenants: [{ id: T, name: "Harbor", slug: "harbor", timezone: "UTC", status: "active" }],
    files: [fileRow(FILE, "the-finish"), fileRow(OTHER_FILE, "another")],
    posts: [postRow(POST, FILE), postRow(ELSEWHERE, OTHER_FILE)],
    remediation_actions: [action],
    jobs: [],
  };
  const db = fakeDb(
    tables,
    {},
    {
      // The door as 00688 writes it: said once, of a post still up that a place left to its owner.
      post_take_down_keep: ({ p_tenant_id, p_post_id }) => {
        doors.push(["post_take_down_keep", p_tenant_id, p_post_id]);
        if (action.target_id !== p_post_id) return { fate: "unknown" };
        if (action.outcome === "done") return { fate: "done" };
        if (action.outcome === "pending") return { fate: "asking" };
        if (action.outcome !== "left_up")
          Object.assign(action, { outcome: "left_up", finished_at: NOW, left_up_by: USER });
        return { fate: "left_up", post_id: POST, file_id: FILE, place: "instagram" };
      },
      // The door as 00688 re-made it: a post left up is not asked about.
      post_take_down_by_hand: ({ p_tenant_id, p_post_id }) => {
        doors.push(["post_take_down_by_hand", p_tenant_id, p_post_id]);
        if (action.target_id !== p_post_id) return { fate: "unknown" };
        if (action.outcome === "left_up") return { fate: "left_up" };
        Object.assign(action, { outcome: "pending", finished_at: null });
        return { fate: "asking" };
      },
    },
  );
  const ctx = { supabase: db, userId: USER, email: "ada@example.com", params: { id: FILE } };
  const put = (body) =>
    posts.PUT.run(
      new Request(`http://localhost/api/v1/files/${FILE}/posts?workspace=${T}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
      ctx,
    );
  return { db, tables, action, doors, put };
}

test("Keep it up goes through its own door, on the member's session, and the post is left up", async () => {
  const w = world();
  assert.deepEqual(await w.put({ post_id: POST, keep: true }), { asking: false, left_up: true });
  assert.deepEqual(w.doors, [["post_take_down_keep", T, POST]], "its own door, once, and nothing else");
  assert.equal(w.action.outcome, "left_up");
  assert.equal(w.tables.jobs.length, 0, "nothing is asked of the place");
  // Pressed again: the same answer, by the same door.
  assert.deepEqual(await w.put({ post_id: POST, keep: true }), { asking: false, left_up: true });
});

test("I deleted it keeps its door, and says so when the owner has already chosen to leave the post up", async () => {
  const w = world();
  assert.deepEqual(await w.put({ post_id: POST }), { asking: true, left_up: false });
  assert.deepEqual(w.doors, [["post_take_down_by_hand", T, POST]]);
  const kept = world({ outcome: "left_up" });
  assert.deepEqual(await kept.put({ post_id: POST }), { asking: false, left_up: true }, "a page that had not heard");
  assert.equal(kept.action.outcome, "left_up", "the owner's word stands");
});

test("while the place is still being asked there is nothing to keep: the answer says it is asking", async () => {
  const w = world({ outcome: "pending" });
  assert.deepEqual(await w.put({ post_id: POST, keep: true }), { asking: true, left_up: false });
  assert.equal(w.action.outcome, "pending");
});

test("a post of another piece, a post never asked down, and a word that is not a yes are each refused", async () => {
  const w = world();
  await assert.rejects(w.put({ post_id: ELSEWHERE, keep: true }), (e) => e.status === 404 && e.code === "not_found");
  assert.deepEqual(w.doors, [], "another piece's post never reaches the door");
  await assert.rejects(w.put({ post_id: POST, keep: false }), (e) => e.code === "validation");
  await assert.rejects(w.put({ post_id: POST, keep: "yes" }), (e) => e.code === "validation");
  await assert.rejects(w.put({ post_id: POST, stays: true }), (e) => e.code === "validation");
  assert.equal(w.action.outcome, "needs_person");
});

test("someone who may not take a post down may not say it stays", async () => {
  const w = world({ role: "viewer" });
  await assert.rejects(w.put({ post_id: POST, keep: true }), (e) => e.status === 403);
  assert.deepEqual(w.doors, []);
});

test("a take-down job that arrives late for a post left up asks nothing of the place", async () => {
  const w = world({ outcome: "left_up" });
  setPg(w.db);
  const asked = [];
  const job = { id: "job-1", tenant_id: T, kind: "post_take_down", payload: { action_id: ACTION, attempt: "2" } };
  const answer = await takePostDown(w.db, job, async (post) => {
    asked.push(post.id);
    return { cant: "never asked" };
  });
  assert.deepEqual(answer, { skipped: "left_up" });
  assert.deepEqual(asked, []);
  assert.equal(w.action.outcome, "left_up");
});

test("the bell's line for that place is closed by the door itself, by the words the bell wrote", () => {
  const [warns, ...more] = warningsMendedBy({ change: "post.left_up" });
  assert.deepEqual(more, [], "one warning, and no other, ends with the owner's word");
  assert.equal(warns?.kind, "post_by_hand");
  assert.equal(warns.sameSubject, true, "one piece's word never closes another's line");
  // post_take_down_keep (00688) closes the line in SQL, by its title: 'Delete it in ' || the place || ' · %'. The
  // words and that literal agree, at either place and for a piece with no name.
  assert.equal(TAKE_DOWN_BELL.byHand("instagram", "The finish"), "Delete it in Instagram · The finish");
  assert.equal(TAKE_DOWN_BELL.byHand("google", ""), "Delete it in Google · A post");
  for (const place of ["instagram", "google"]) assert.match(TAKE_DOWN_BELL.byHand(place, "The finish"), warns.title);
});

test("the piece's record names who kept the post up: the reader is you, a teammate goes by the roster's name", async () => {
  const MATE = "22222222-2222-4222-8222-222222222222";
  const REM = "99999999-0000-4000-8000-000000000041";
  let rosterReads = 0;
  const record = (action) => {
    const db = fakeDb(
      {
        remediations: [
          {
            id: REM,
            tenant_id: T,
            cause: "owner_removed",
            subject_type: "file",
            subject_id: FILE,
            created_at: NOW,
            finished_at: NOW,
          },
        ],
        remediation_actions: [
          {
            id: ACTION,
            tenant_id: T,
            remediation_id: REM,
            target_type: "post",
            target_id: POST,
            act: "take_down",
            outcome: "left_up",
            said: ON_INSTAGRAM.takeDown.byHand,
            started_at: NOW,
            finished_at: NOW,
            left_up_by: USER,
            ...action,
          },
        ],
      },
      {},
      {
        team_roster: () => {
          rosterReads += 1;
          return [
            { member_user_id: USER, display_name: " Ada ", email: "ada@example.com" },
            { member_user_id: MATE, display_name: "", email: "sofia@example.com" },
          ];
        },
      },
    );
    const as = (userId) => readPieceTakeDown({ supabase: db, userId }, { tenantId: T }, { id: FILE, postIds: [POST] });
    return { as };
  };
  const whoOf = (takeDown) => takeDown.actions.map((a) => [a.outcome, a.left_up_by]);

  const kept = record({});
  assert.deepEqual(whoOf(await kept.as(USER)), [["left_up", { you: true, name: "Ada" }]], "the member reading");
  assert.deepEqual(whoOf(await kept.as(MATE)), [["left_up", { you: false, name: "Ada" }]], "a teammate reads the name");
  // A member who gave no name is not named by their sign-in address; one who left since has no id at all.
  assert.deepEqual(whoOf(await record({ left_up_by: MATE }).as(USER)), [["left_up", { you: false, name: null }]]);
  assert.deepEqual(whoOf(await record({ left_up_by: null }).as(USER)), [["left_up", { you: false, name: null }]]);

  // Nothing left up: nobody is named, and the roster is never read for it.
  rosterReads = 0;
  const byHand = await record({ outcome: "needs_person", left_up_by: null }).as(USER);
  assert.deepEqual(whoOf(byHand), [["needs_person", null]]);
  assert.equal(rosterReads, 0);
});
