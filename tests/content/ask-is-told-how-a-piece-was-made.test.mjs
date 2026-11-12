/**
 * Ask is told how a piece made here was made as it opens one (server posts/made-as.ts, through the files tool's view), so a
 * change the owner asks for in their own words is a new one made from the same material with that changed, never a guess from
 * the finished picture. The real files tool runs over a database in memory and an edge that answers from memory: a post says
 * the photo it came from and what it was asked to be, a video its blocks with each file by its name, in the words the acts
 * that make one take (propose_post, propose_piece), so the plan goes back as it is. A file that is gone is said as gone, and
 * no id is ever among the words.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

/** The edge's door for copies, answered from memory: every file asked for has a copy to show. */
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("/api/admin/files/copies")) return realFetch(input, init);
  const { ids } = JSON.parse(init.body);
  const copies = ids.map((id) => ({ id, file_id: `copy_${id.slice(-1)}`, width: 1080, height: 1350 }));
  return new Response(JSON.stringify({ ok: true, copies }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
  setServiceClient(null);
});

const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { runTool, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { postAct } = await import(at("apps/dashboard/src/server/ask/tools/act/files/post.ts"));
const { pieceAct } = await import(at("apps/dashboard/src/server/ask/tools/act/files/piece.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const TZ = "America/New_York";
const ID = (n) => `ffffffff-0000-4000-8000-00000000000${n}`;
/** What the business added: two photos and a clip, and a photo it has since deleted. */
const PHOTO = ID(1);
const AFTER = ID(2);
const CLIP = ID(3);
const DELETED = ID(4);
/** What Ask made of them: a post from a photo, one from a moment of the clip, one whose photo is gone, and two videos. */
const POST = ID(5);
const MOMENT_POST = ID(6);
const ORPHAN_POST = ID(7);
const REEL = ID(8);
const THIN_REEL = ID(9);

const row = (id, name, over = {}) => ({
  id,
  tenant_id: A,
  status: "filed",
  source: "upload",
  source_ref: null,
  name,
  mime: "image/jpeg",
  bytes: 1000,
  width: 1080,
  height: 1350,
  look: { line: "A client in the chair.", people: { count: 0, recognizable: 0 } },
  look_status: "done",
  shows: "work",
  who_in_it: "not_asked",
  removed_at: null,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
  kind: "image",
  seconds: null,
  media_status: null,
  sound_said: null,
  ...over,
});
const VIDEO = { kind: "video", mime: "video/mp4", width: 720, height: 1280, seconds: 11.8, media_status: "ready" };

/** A post's plan as its file keeps it (contracts PostPlan): its photo by id, and what the act works out for itself. */
const postPlan = (over = {}) => ({
  file_id: PHOTO,
  line: "Saturdays fill first",
  over: "Harbor",
  under: null,
  book: true,
  words_at: "bottom",
  voice: "classic",
  layout: "band",
  language: "es",
  people_agreed: true,
  at: null,
  ...over,
});
const madePost = (id, name, from, plan) => row(id, name, { source: "made", shows: "graphic", made: { from, plan } });

/** A video's plan as its row keeps it (contracts PiecePlan): every kind of block, each file by its id. */
const REEL_PLAN = {
  shape: "blocks",
  blocks: [
    { is: "clip", file_id: CLIP, from: 2.3, to: 4.8, label: "Silk press" },
    { is: "photo", file_id: PHOTO, seconds: 2.5, label: null },
    { is: "pair", before: { file_id: PHOTO, at: null }, after: { file_id: CLIP, at: 9.5 }, seconds: 3 },
    { is: "words", lines: ["Same chair.", "New you."], seconds: 2 },
    {
      is: "quote",
      text: "Best blowout in Brooklyn",
      from: "Google review",
      over: { file_id: AFTER, at: null },
      seconds: 3,
    },
  ],
  lines: ["I asked for volume", "Did I get it?"],
  words_at: "low",
  words_hold: "first",
  end_line: "Same chair. New me.",
  language: "es",
  people_agreed: true,
  caption: "She asked for volume, and got it.",
};
/** One drawn from the clip and from the photo deleted since. */
const THIN_PLAN = {
  shape: "blocks",
  blocks: [
    { is: "clip", file_id: CLIP, from: 1, to: 4, label: null },
    { is: "photo", file_id: DELETED, seconds: 3, label: null },
  ],
  lines: ["Before the big day"],
  words_at: "high",
  words_hold: "all",
  end_line: null,
  language: "en",
  people_agreed: false,
  caption: null,
};
const pieceRow = (n, fileId, plan) => ({
  id: `eeeeeeee-0000-4000-8000-00000000000${n}`,
  tenant_id: A,
  file_id: fileId,
  status: "made",
  plan,
  created_at: "2026-11-10T12:00:00Z",
});

const tables = () => ({
  files: [
    row(PHOTO, "sams-chair"),
    row(AFTER, "after-curls"),
    row(CLIP, "salon-chair-reveal", VIDEO),
    row(DELETED, "old-storefront", { removed_at: "2026-11-09T12:00:00Z" }),
    madePost(POST, "saturdays-fill-first", PHOTO, postPlan()),
    madePost(MOMENT_POST, "the-reveal", CLIP, postPlan({ file_id: CLIP, over: null, book: false, at: 3.2 })),
    madePost(ORPHAN_POST, "open-late", DELETED, postPlan({ file_id: DELETED })),
    row(REEL, "i-asked-for-volume", { ...VIDEO, source: "made" }),
    row(THIN_REEL, "before-the-big-day", { ...VIDEO, source: "made" }),
  ],
  pieces: [pieceRow(1, REEL, REEL_PLAN), pieceRow(2, THIN_REEL, THIN_PLAN)],
  memberships: [],
});

beforeEach(() => {
  readerCache.clear();
  setServiceClient(fakeDb(tables(), {}, {}));
});

/** The files tool's view of these names, as the model reads it: each file shown, by its name. */
async function viewed(names) {
  const ctx = { supabase: fakeDb(tables(), {}, {}), userId: USER, email: "ada@example.com", params: {} };
  const tc = newToolContext(ctx, A, "owner", TZ, new Date("2026-11-11T12:00:00Z"));
  const out = await runTool(tc, { name: "files", input: { action: "view", names } });
  assert.equal(out.isError, false, out.result);
  const shown = Object.fromEntries(JSON.parse(out.result).shown.map((file) => [file.name, file]));
  return { out, shown };
}
/** What an act takes, as its own schema says it, with nothing let through that it does not name. */
const takenBy = (act) => Object.values(act.actions)[0].input.strict();

test("a post says the photo it came from by its name and what it was asked to be, in the words propose_post takes", async () => {
  const { out, shown } = await viewed(["saturdays-fill-first"]);
  const made = shown["saturdays-fill-first"].made_as;
  assert.equal(made.what, "a post made here, with its words on it");
  assert.deepEqual(made.plan, {
    file: "sams-chair",
    line: "Saturdays fill first",
    over: "Harbor",
    book: true,
    words_at: "bottom",
    voice: "classic",
    layout: "band",
  });
  assert.equal(made.gone, undefined);
  assert.match(made.to_change, /call propose_post with this plan with the change made/);
  assert.match(made.to_change, /The one they have stays/);
  // The plan goes back as it is: every word in it is one the act names, and the act asks for nothing it lacks.
  const back = takenBy(postAct).safeParse({ ...made.plan, words_at: "top" });
  assert.equal(back.success, true, JSON.stringify(back.error?.issues));
  assert.doesNotMatch(out.result, /ffffffff-0000/, "a file is named, never told by its id");
});

test("a post drawn from a moment of a video names the clip and the moment", async () => {
  const { shown } = await viewed(["the-reveal"]);
  const made = shown["the-reveal"].made_as;
  assert.deepEqual(made.plan, {
    file: "salon-chair-reveal",
    at: 3.2,
    line: "Saturdays fill first",
    book: false,
    words_at: "bottom",
    voice: "classic",
    layout: "band",
  });
  assert.equal(takenBy(postAct).safeParse(made.plan).success, true);
});

test("a post whose photo is gone names no file, and says it cannot be made again from it", async () => {
  const { out, shown } = await viewed(["open-late"]);
  const made = shown["open-late"].made_as;
  assert.equal("file" in made.plan, false, "a photo deleted since is no photo to name");
  assert.equal(made.plan.line, "Saturdays fill first", "what it said is still told");
  assert.equal(made.gone, 1);
  assert.match(made.to_change, /no longer in the Library/);
  assert.doesNotMatch(made.to_change, /propose_post/, "nothing says to make it again from what is gone");
  assert.doesNotMatch(out.result, /old-storefront/, "and the deleted photo's name is not said");
});

test("a video says its blocks in play order with each file by its name, in the words propose_piece takes", async () => {
  const { out, shown } = await viewed(["i-asked-for-volume"]);
  const made = shown["i-asked-for-volume"].made_as;
  assert.equal(made.what, "a video made here");
  assert.deepEqual(made.plan, {
    blocks: [
      { is: "clip", file: "salon-chair-reveal", from: 2.3, to: 4.8, label: "Silk press" },
      { is: "photo", file: "sams-chair", seconds: 2.5 },
      { is: "pair", before: "sams-chair", after: "salon-chair-reveal", after_at: 9.5, seconds: 3 },
      { is: "words", lines: ["Same chair.", "New you."], seconds: 2 },
      { is: "quote", text: "Best blowout in Brooklyn", over: "after-curls", seconds: 3 },
    ],
    lines: ["I asked for volume", "Did I get it?"],
    words_at: "low",
    words_hold: "first",
    end_line: "Same chair. New me.",
    // Its language goes with it, so a change to anything else keeps it (the act takes one: propose_piece `language`).
    language: "es",
    caption: "She asked for volume, and got it.",
  });
  assert.equal(made.gone, undefined);
  assert.match(made.to_change, /call propose_piece with this plan with the change made/);
  // The plan goes back as it is, and so does each block: no word in either is one the act does not name.
  const taken = takenBy(pieceAct);
  const back = taken.safeParse({ ...made.plan, lines: ["I asked for volume"] });
  assert.equal(back.success, true, JSON.stringify(back.error?.issues));
  const block = taken.shape.blocks.element.strict();
  for (const told of made.plan.blocks) {
    const parsed = block.safeParse(told);
    assert.equal(parsed.success, true, `${told.is}: ${JSON.stringify(parsed.error?.issues)}`);
  }
  assert.doesNotMatch(out.result, /ffffffff-0000/, "a file is named, never told by its id");
});

test("a video drawn from a file that is gone says which block lost it and how many are gone", async () => {
  const { out, shown } = await viewed(["before-the-big-day"]);
  const made = shown["before-the-big-day"].made_as;
  assert.deepEqual(made.plan.blocks, [
    { is: "clip", file: "salon-chair-reveal", from: 1, to: 4 },
    { is: "photo", file: null, seconds: 3 },
  ]);
  assert.equal(made.gone, 1);
  assert.match(made.to_change, /no longer in the Library/);
  assert.match(made.to_change, /what is still there/);
  assert.doesNotMatch(out.result, /old-storefront/);
});

test("only a piece made here says how it was made", async () => {
  const { shown } = await viewed(["sams-chair", "salon-chair-reveal", "saturdays-fill-first"]);
  assert.equal(shown["sams-chair"].made_as, undefined, "a photo the business added was not made");
  assert.equal(shown["salon-chair-reveal"].made_as, undefined);
  assert.ok(shown["saturdays-fill-first"].made_as, "the post beside them still says its own");
});

test("a making that cannot be read is not told, and the piece is opened all the same", async () => {
  // The service role's read of what a post keeps fails: nothing is guessed in its place.
  setServiceClient({
    from() {
      throw new Error("the database did not answer");
    },
  });
  const { out, shown } = await viewed(["saturdays-fill-first"]);
  assert.equal(shown["saturdays-fill-first"].made_as, undefined);
  assert.equal(out.pictures.length, 1, "Ask still sees the picture");
});
