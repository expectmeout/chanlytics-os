/**
 * A post already set for its time, asked of Ask at another (Ruben, 12 Nov 2026): "move Saturday's post to Sunday" had no road
 * through Ask, whose card could only set a second post and be refused as busy. The tool finds the post waiting at a place
 * asked (apps/dashboard/src/server/ask/tools/act/files/publish-move.ts movesOf) and the card moves it through the file's one
 * door for it (contracts content/publish.ts, PATCH files/[id]/posts, 00621), in place of a second post there.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DAY_MS, postPublishOf, publishCardWords, publishSpec } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
delete process.env.VERCEL_ENV;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

/** The Meta link, switched on for every workspace here, as the edge says it. */
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

const { movesOf } = await import(at("apps/dashboard/src/server/ask/tools/act/files/publish-move.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
after(() => setServiceClient(null));

const NOW = Date.parse("2026-11-12T15:00:00Z");
const SATURDAY = "2026-11-14T15:00:00.000Z";
const SUNDAY = Date.parse("2026-11-15T15:00:00Z");
const set = (over = {}) => ({
  id: "11111111-0000-4000-8000-000000000001",
  place: "instagram",
  kind: "picture",
  status: "queued",
  scheduled_for: SATURDAY,
  ...over,
});
const asked = (over = {}) => ({ places: ["instagram"], as: "picture", at: SUNDAY, ...over });

test("a post waiting at a place asked, as what it is asked as, is moved to the time named", () => {
  assert.deepEqual(movesOf([set()], asked(), NOW), { moves: [{ place: "instagram", post_id: set().id }] });
  const google = set({ id: "11111111-0000-4000-8000-000000000002", place: "google" });
  assert.deepEqual(movesOf([set(), google], asked({ places: ["instagram", "google"] }), NOW), {
    moves: [
      { place: "instagram", post_id: set().id },
      { place: "google", post_id: google.id },
    ],
  });
});

test("nothing moves that was not asked to: no time named, another kind, another place, or a post going up now", () => {
  assert.deepEqual(movesOf([set()], asked({ at: null }), NOW), { moves: [] }, "no time named is no move");
  assert.deepEqual(movesOf([set()], asked({ as: "story" }), NOW), { moves: [] }, "a story is not the post");
  assert.deepEqual(movesOf([set({ kind: "story" })], asked({ as: "story" }), NOW).moves.length, 1);
  assert.deepEqual(movesOf([set()], asked({ places: ["google"] }), NOW), { moves: [] }, "only the places asked");
  const goingNow = set({ scheduled_for: new Date(NOW + 30_000).toISOString() });
  assert.deepEqual(movesOf([goingNow], asked(), NOW), { moves: [] }, "one going up now has no time to move");
  for (const status of ["published", "pulled", "failed", "held", "publishing"])
    assert.deepEqual(movesOf([set({ status })], asked(), NOW), { moves: [] }, status);
});

test("a post Instagram is already making ready keeps its time, and Ask is told to say so", () => {
  const said = movesOf([set({ status: "preparing" })], asked(), NOW);
  assert.match(said.refused, /^Instagram is already making this post ready/);
});

const card = (over = {}) =>
  postPublishOf({
    file_id: "f1",
    places: [],
    moves: [{ place: "instagram", post_id: set().id }],
    as: "story",
    when: "2026-11-15T15:00:00.000Z",
    when_said: "Sunday at 10:00 AM",
    caption: "Saturdays fill first.",
    caption_new: false,
    language: "en",
    ...over,
  });
const callsOf = (payload) => publishSpec.commit({ payload });

test("a card that only moves says so, and its press moves the same post through the file's one door for it", () => {
  const moved = card();
  assert.deepEqual(publishCardWords(moved, "Silk press Saturday"), {
    title: "Move Silk press Saturday",
    summary: "On your Instagram story, to Sunday at 10:00 AM.",
  });
  assert.deepEqual(callsOf(moved), [
    {
      route: "PATCH files/[id]/posts",
      params: { id: "f1" },
      body: { post_id: set().id, when: "2026-11-15T15:00:00.000Z" },
    },
  ]);
  assert.equal(publishSpec.receipt({ payload: moved }), "Now set for Sunday at 10:00 AM on your Instagram story.");
  assert.deepEqual(
    publishCardWords(card({ language: "es", when_said: "domingo, 15 nov, 10:00" }), "Silk press").title,
    "Mover Silk press",
  );
});

test("a card that posts to one place and moves another does both, the caption kept first where it is new", () => {
  const both = card({ places: ["google"], as: "picture", caption_new: true });
  assert.equal(
    publishCardWords(both, "Silk press").summary,
    "To Google, Sunday at 10:00 AM. Instagram moves to it.",
    "what goes up, then what moves",
  );
  assert.deepEqual(
    callsOf(both).map((call) => call.route),
    ["PATCH files/[id]", "PATCH files/[id]/posts", "POST files/[id]/google"],
  );
  assert.equal(
    publishSpec.receipt({ payload: both }),
    "Set for Sunday at 10:00 AM on Google. Now set for Sunday at 10:00 AM on Instagram.",
  );
});

test("a card read back keeps only moves that name a place and a post, and one with no time moves nothing", () => {
  const read = postPublishOf({
    file_id: "f1",
    places: ["google"],
    moves: [{ place: "tiktok", post_id: "x" }, { place: "google" }, "x"],
  });
  assert.deepEqual(read.moves, []);
  assert.deepEqual(postPublishOf({ file_id: "f1", places: ["google"] }).moves, [], "a card from before moves has none");
  const timeless = card({ when: null, when_said: null, places: ["google"], as: "picture" });
  assert.deepEqual(
    callsOf(timeless).map((call) => call.route),
    ["POST files/[id]/google"],
    "a move is to a time: with none, nothing moves",
  );
});

/* ------------------------------------------------------------------------- the act, over a database in memory */

const USER = "11111111-1111-4111-8111-111111111111";
const MADE = "ffffffff-0000-4000-8000-000000000002";
const WAITING = "00000001-0000-4000-8000-000000000000";
let seq = 0;

/** A minute of the business's clock (UTC here), as Ask names a time: YYYY-MM-DD HH:MM. */
const minuteSaid = (ms) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
const minuteOf = (ms) => Math.floor(ms / 60_000) * 60_000;

/**
 * Ask asked to put the made post up, in a workspace of its own (the Meta link's switch is kept a while per workspace) whose
 * Instagram is connected and may post, holding the posts given: the real act, its readers and the posts' own repository.
 */
function askedToPublish(input, posts = []) {
  seq += 1;
  const tenant = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, "0")}`;
  const rows = posts.map((p) => ({
    id: WAITING,
    tenant_id: tenant,
    file_id: MADE,
    place: "instagram",
    kind: "picture",
    caption: "Open late on Fridays.",
    status: "queued",
    held_reason: null,
    permalink: null,
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
    ...p,
  }));
  const made = { plan: { line: "Open late on Fridays", under: null }, caption: "Open late on Fridays." };
  const file = {
    id: MADE,
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
    made,
    removed_at: null,
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
  };
  const tables = {
    memberships: [],
    files: [file],
    tenants: [{ id: tenant, name: "Harbor", slug: `w${seq}`, timezone: "UTC", status: "active" }],
    tenant_config: [],
    google_connections: [],
    posts: rows,
  };
  const channel = {
    id: `cccccccc-cccc-4ccc-8ccc-${String(seq).padStart(12, "0")}`,
    tenant_id: tenant,
    kind: "instagram",
    external_id: "17841400000000001",
    status: "active",
    credentials_ref: "ref",
    config: { login: "meta", scopes: ["instagram_basic", "instagram_manage_messages", "instagram_content_publish"] },
    created_at: "2026-11-01T00:00:00Z",
  };
  setServiceClient(fakeDb({ tenant_channels: [channel], files: [file], events: [], posts: rows }, {}, {}));
  const ctx = { supabase: fakeDb(tables, {}, {}), userId: USER, email: "ada@example.com", params: {} };
  const tc = {
    ...newToolContext(ctx, tenant, "owner", "UTC", new Date()),
    question: "Move the Fridays post to that time.",
    askedEarlier: [],
    language: "en",
  };
  return buildProposal(tc, "propose_publish", { file: "open-late-on-fridays", places: ["instagram"], ...input });
}

test("asked for another time, Ask's card moves the post that waits there, and sets no second one", async () => {
  const sunday = minuteOf(Date.now() + 3 * DAY_MS);
  const out = await askedToPublish({ when: minuteSaid(sunday) }, [
    { scheduled_for: new Date(Date.now() + 2 * DAY_MS).toISOString() },
  ]);
  assert.equal(out.proposal?.kind, "publish", out.refusal ?? out.result);
  const card = postPublishOf(out.proposal.payload);
  assert.deepEqual(card.places, [], "nowhere new: the post is on its way there already");
  assert.deepEqual(card.moves, [{ place: "instagram", post_id: WAITING }]);
  assert.equal(card.when, new Date(sunday).toISOString());
  assert.match(out.proposal.title, /^Move /);
  assert.deepEqual(
    publishSpec.commit({ payload: out.proposal.payload }).map((call) => [call.route, call.body]),
    [["PATCH files/[id]/posts", { post_id: WAITING, when: new Date(sunday).toISOString() }]],
  );
});

test("with nothing waiting there, the same ask sets the post for its time, as before", async () => {
  const sunday = minuteOf(Date.now() + 3 * DAY_MS);
  const out = await askedToPublish({ when: minuteSaid(sunday) });
  assert.equal(out.proposal?.kind, "publish", out.refusal ?? out.result);
  const card = postPublishOf(out.proposal.payload);
  assert.deepEqual([card.places, card.moves], [["instagram"], []]);
  assert.doesNotMatch(out.proposal.title, /^Move /);
});

test("one Instagram is already making ready is not moved: Ask is told why, and makes no card", async () => {
  const out = await askedToPublish({ when: minuteSaid(Date.now() + 3 * DAY_MS) }, [
    { status: "preparing", scheduled_for: new Date(Date.now() + 2 * DAY_MS).toISOString() },
  ]);
  assert.equal(out.proposal ?? null, null);
  assert.match(out.refusal ?? out.result, /already making this post ready/);
});
