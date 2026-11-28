/**
 * What a week's plan remembers of what went out (the content loop PRD's 9.4 and 10.2, step 1; the outside review of
 * 28 Nov 2026, R3.14), over tests/_fake-db.mjs. What goes out is always a made file: a drawn picture, a made video. What a
 * plan picks from is the footage under it. So "posted in the last three weeks" follows each made file to the photo or
 * the clips it was made from, and a post's "what it shows" is what its footage's look said. Before, the plan was told the
 * made files' own ids, which no footage ever has, so a clip that went out last week read as never posted; and each post
 * "showed" its made file's own line ("A post saying ..."), which no two posts share, so nothing was ever learned from it.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dayInZone, mondayOf, shiftKey } from "@chanlytics/contracts";
import { listPostOutcomes, readRecentlyPosted } from "@chanlytics/db/files";
import { fakeDb } from "../../_fake-db.mjs";

for (const k of ["RESEND_API_KEY", "SUPABASE_URL"]) delete process.env[k];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { planTheWeek } = await import(at("apps/edge/lib/content/plan.ts"));
after(() => setPg(null));

const T = "aaaa1111-0005-4000-8000-0000000000d1";
const OTHER = "aaaa1111-0005-4000-8000-0000000000d9";
const PLAN = "bbbb2222-0005-4000-8000-0000000000d2";
/** Footage the business added: a clip and a photo. */
const CLIP = "cccc3333-0005-4000-8000-0000000000d3";
const PHOTO = "cccc3333-0005-4000-8000-0000000000d4";
/** What was made from them, and went out: a reel from the clip, a picture from the photo. */
const REEL = "dddd4444-0005-4000-8000-0000000000d5";
const PICTURE = "dddd4444-0005-4000-8000-0000000000d6";
const REEL_PIECE = "eeee5555-0005-4000-8000-0000000000d7";
const PICTURE_PIECE = "eeee5555-0005-4000-8000-0000000000d8";
const ZONE = "America/New_York";
const WEEK = shiftKey(mondayOf(dayInZone(ZONE, Date.now()).key), 7);
const DAY = 86_400_000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

const file = (id, over) => ({
  id,
  tenant_id: T,
  name: `file-${id.slice(-2)}`,
  status: "filed",
  removed_at: null,
  copy_state: "here",
  look_status: "done",
  created_at: ago(30),
  seconds: null,
  made: null,
  ...over,
});
const post = (id, over) => ({
  id,
  tenant_id: T,
  place: "instagram",
  status: "published",
  caption: "Warm colour.",
  scheduled_for: ago(8),
  published_at: ago(8),
  created_at: ago(8),
  updated_at: ago(8),
  ...over,
});

/** A workspace whose clip went out as a reel and whose photo went out as a picture, eight days ago. */
function world({ posted = true } = {}) {
  const written = [];
  const tables = {
    tenants: [{ id: T, timezone: ZONE, slug: "studio", name: "Studio", sending_stopped_at: null }],
    tenant_config: [{ tenant_id: T, config: { features: { content_preview: true, content_plan: true } }, version: 1 }],
    content_plans: [{ id: PLAN, tenant_id: T, week_of: WEEK, status: "drafting", asked_by: "clock" }],
    owner_claims: [],
    content_goals: [],
    files: [
      file(CLIP, {
        kind: "video",
        source: "upload",
        seconds: 12,
        look: { use: "finished colour result", moments: [{ at: 4, what: "the finished colour" }], issues: [] },
      }),
      file(PHOTO, { kind: "image", source: "upload", look: { use: "the front of the shop", moments: [], issues: [] } }),
      // What a made file's own look says: that it is a post, never what its footage shows.
      file(REEL, { kind: "video", source: "made", seconds: 8, look: null, made: { piece: REEL_PIECE } }),
      file(PICTURE, {
        kind: "image",
        source: "made",
        look: { line: 'A post saying "Open late", made from file-d4.' },
        made: { from: PHOTO, plan: { line: "Open late" } },
      }),
    ],
    pieces: posted
      ? [
          {
            id: REEL_PIECE,
            tenant_id: T,
            file_id: REEL,
            shape: "blocks",
            plan: { blocks: [{ is: "clip", file_id: CLIP, from: 0, to: 8 }], lines: ["The finish"] },
            intent: { opportunity_id: "offer:winter" },
            created_at: ago(9),
          },
          {
            id: PICTURE_PIECE,
            tenant_id: T,
            file_id: PICTURE,
            shape: "picture",
            plan: {},
            intent: null,
            created_at: ago(9),
          },
        ]
      : [],
    posts: posted
      ? [
          post("ffff6666-0005-4000-8000-0000000000da", { kind: "reel", file_id: REEL, piece_id: REEL_PIECE }),
          post("ffff6666-0005-4000-8000-0000000000db", { kind: "picture", file_id: PICTURE, piece_id: PICTURE_PIECE }),
        ]
      : [],
    post_observations: [],
    file_moments: [],
    google_reviews: [],
    google_connections: [],
    tenant_channels: [
      {
        id: "abab7777-0005-4000-8000-0000000000dc",
        tenant_id: T,
        kind: "instagram",
        external_id: "17841400000000051",
        credentials_ref: "ref",
        status: "active",
        config: { login: "meta", scopes: ["instagram_basic", "instagram_content_publish"], username: "studio" },
        created_at: ago(60),
      },
    ],
    notifications: [],
    jobs: [],
    policies: [
      {
        id: "abab7777-0005-4000-8000-0000000000dd",
        tenant_id: T,
        class: "plan_approve",
        mode: "ask",
        subject_type: null,
        subject_id: null,
        limits: {},
      },
    ],
  };
  const db = fakeDb(
    tables,
    {},
    {
      content_plan_write: (args) => {
        written.push(args);
        return { fate: "ready", slots: args.p_slots.length };
      },
      file_moments_keep: (args) => args.p_moments.length,
      content_weeks_start: () => 1,
      content_week_hold: () => ({ fate: "asks" }),
    },
  );
  setPg(db);
  return { db, tables, written };
}

test("what went out in the last three weeks names the footage it was made from, a reel's clip and a picture's photo", async () => {
  const w = world();
  const lately = await readRecentlyPosted(w.db, T, ago(21));
  assert.equal(lately.files.has(CLIP), true, "the clip the reel was made from");
  assert.equal(lately.files.has(PHOTO), true, "the photo the picture was drawn from");
  assert.deepEqual([...lately.reasons], ["offer:winter"], "and the reason it was made for, as before");
  // Another workspace's rows say nothing of this one.
  const other = await readRecentlyPosted(w.db, OTHER, ago(21));
  assert.equal(other.files.size, 0);
});

test("what a post showed is what its footage's look said, never its made file's own line", async () => {
  const w = world();
  const outcomes = await listPostOutcomes(w.db, T, ago(90));
  const reel = outcomes.find((o) => o.kind === "reel");
  const picture = outcomes.find((o) => o.kind === "picture");
  assert.deepEqual([...reel.shows], ["finished colour result", "the finished colour"]);
  assert.deepEqual([...picture.shows], ["the front of the shop"]);
  assert.equal(reel.seconds, 8, "its length is the made video's own");
  assert.equal(picture.seconds, null);
});

test("the week knows a clip went out last week: its row says so, where it said never posted", async () => {
  const novelty = async (shape) => {
    const w = world(shape);
    await planTheWeek(w.db, {
      id: "job-1",
      tenant_id: T,
      kind: "content_plan",
      payload: { plan_id: PLAN },
      attempts: 1,
    });
    const slot = w.written[0].p_slots.find((s) => s.file_id === CLIP);
    return slot?.score.parts.novelty.why ?? null;
  };
  assert.equal(await novelty({ posted: false }), "Not posted in the last three weeks");
  assert.equal(await novelty({ posted: true }), "It went out in the last three weeks");
});
