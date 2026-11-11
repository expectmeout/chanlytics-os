/**
 * A video asked of Ask (decision 0122): the act that plans it, the storyboard it looks at before any card is made, the card, and
 * the press. The storyboard is drawn for real (sharp and the app's own face), so where the opening words sit on it is where the
 * video will show them; the act holds the words to what the owner said and the clips to what the checker allows; the card shows
 * one press, and the press writes the video's row with the business's look as it stood.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const sharp = createRequire(path.join(ROOT, "apps/dashboard/package.json"))("sharp");

const { composeBoard } = await import(at("apps/dashboard/src/server/posts/compose.ts"));
const { beginPieceFor } = await import(at("apps/dashboard/src/server/content/piece.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { PIECE_FRAME, pieceWordsBoxOf } = await import(at("packages/contracts/src/content/piece-frame.ts"));
const { piecePlanOf } = await import(at("packages/contracts/src/content/pieces.ts"));
const { PIECE_TEMPLATE } = await import(at("packages/contracts/src/content/piece-making.ts"));
const { PIECE_WORDS } = await import(at("packages/contracts/src/content/piece-words.ts"));
const { pieceSpec } = await import(at("packages/contracts/src/content/piece-spec.ts"));
const { askTraitsOf } = await import(at("packages/contracts/src/ask/proposals/shapes.ts"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const CLIP = "ffffffff-0000-4000-8000-000000000001";
const TZ = "America/New_York";
const OWNER = "Make me a video from the new clip. She asked for volume and she got it.";

/** A frame of one flat grey, so anything drawn over it shows. */
const flat = (grey = 128) =>
  sharp({ create: { width: 720, height: 1280, channels: 3, background: { r: grey, g: grey, b: grey } } })
    .jpeg()
    .toBuffer();
const FRAME = {
  width: PIECE_FRAME.width,
  height: PIECE_FRAME.height,
  pad: PIECE_FRAME.wordsPad,
  padSide: PIECE_FRAME.wordsPadSide,
  gap: PIECE_FRAME.wordsGap,
  leading: PIECE_FRAME.wordsLeading,
};
/** How light a patch of a picture is, on average. */
async function lightOf(jpeg, left, top, width, height) {
  const { data } = await sharp(jpeg)
    .extract({ left, top, width, height })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data.reduce((sum, v) => sum + v, 0) / data.length;
}

test("the storyboard is each cut's first frame side by side, and the words' backing sits where the video will draw it", async () => {
  const lines = ["I asked for volume", "Did I get it?"];
  const box = pieceWordsBoxOf(lines, "low");
  const frame = await flat();
  const tile = (words, i) => ({ frame, label: `${i + 1} · 0:02.3 to 0:04.8`, words });
  const board = await composeBoard({
    tiles: [tile(true, 0), tile(false, 1), tile(false, 2), tile(false, 3)],
    words: { lines, top: box.top, size: box.size },
    frame: FRAME,
  });
  const meta = await sharp(board).metadata();
  assert.equal(meta.format, "jpeg");
  assert.deepEqual([meta.width, meta.height], [4 * 360 + 3 * 12, 640 + 44]);
  // A third of the video's frame: the backing's middle on the first tile is dark, and the same place on the second is the frame.
  const k = 360 / PIECE_FRAME.width;
  const y = Math.round((box.top + box.height / 2) * k) - 6;
  const backed = await lightOf(board, 180 - 60, y, 120, 12);
  const bare = await lightOf(board, 372 + 180 - 60, y, 120, 12);
  assert.ok(Math.abs(bare - 128) < 6, `the frame as it is: ${bare}`);
  // Above the backing the frame is untouched, so the words cover what they will cover in the video and no more.
  const above = await lightOf(board, 180 - 60, Math.round(box.top * k) - 30, 120, 12);
  assert.ok(Math.abs(above - 128) < 6, `clear above the words: ${above}`);
  assert.notEqual(Math.round(backed), Math.round(bare), "the words and their backing are drawn");
  // The card's own stills are plain: no captions under them and no gaps between, so the page can stand each on its own.
  const plain = await composeBoard({
    tiles: [tile(true, 0), tile(false, 1), tile(false, 2), tile(false, 3)],
    words: { lines, top: box.top, size: box.size },
    frame: FRAME,
    plain: true,
  });
  const plainMeta = await sharp(plain).metadata();
  assert.deepEqual([plainMeta.width, plainMeta.height], [4 * 360, 640]);
  assert.notEqual(Math.round(await lightOf(plain, 180 - 60, y, 120, 12)), 128, "the words are on it all the same");
  assert.ok(
    Math.abs((await lightOf(plain, 360 + 180 - 60, y, 120, 12)) - 128) < 6,
    "the second still starts where the first ends",
  );
  // High words on every tile, where they stay for the whole video.
  const high = pieceWordsBoxOf(lines, "high");
  const held = await composeBoard({
    tiles: [tile(true, 0), tile(true, 1)],
    words: { lines, top: high.top, size: high.size },
    frame: FRAME,
  });
  const hy = Math.round((high.top + 12) * k);
  for (const left of [40, 372 + 40])
    assert.ok((await lightOf(held, left + 40, hy, 60, 6)) < 110, "the backing's edge is dark on each tile it is on");
});

/* ------------------------------------------------------------------------- the act */

const clipRow = (over = {}) => ({
  id: CLIP,
  tenant_id: A,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: "salon-chair-reveal",
  mime: "video/mp4",
  bytes: 3_000_000,
  width: 720,
  height: 1280,
  look: { line: "A client shows her finished curls.", people: { count: 1, recognizable: 0 } },
  look_status: "done",
  shows: "work",
  who_in_it: "not_asked",
  removed_at: null,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
  kind: "video",
  seconds: 11.8,
  media_status: "ready",
  sound_said: null,
  ...over,
});
const INPUT = {
  cuts: [
    { file: "salon-chair-reveal", from: "0:02.3", to: "0:04.8" },
    { file: "salon-chair-reveal", from: 4.8, to: 6.8 },
    { file: "salon-chair-reveal", from: 7.3, to: 9.3 },
    { file: "salon-chair-reveal", from: "0:09.8", to: "0:11.9" },
  ],
  lines: ["I asked for volume", "Did I get it?"],
  words_at: "low",
  words_hold: "all",
  end_line: "Same chair. New me.",
};

function tablesOf({ clip = {}, videos = true, phone = "(555) 010-0100", accent = "#336699" } = {}) {
  const config = {
    features: { video_preview: videos },
    brain: {
      business_name: "Harbor",
      system_prompt: "Answer as the front desk of Harbor: brief and warm, never a price.",
      fallbacks: { greeting: "g", error: "e", non_text: "n" },
      ...(phone ? { phone_display: phone } : {}),
    },
  };
  return {
    files: [clipRow(clip)],
    memberships: [],
    tenants: [{ id: A, name: "Harbor", slug: "harbor", timezone: TZ, status: "active", accent, logo_path: null }],
    tenant_config: [{ tenant_id: A, config, version: 1 }],
  };
}

function askedOnce(input, opts = {}) {
  readerCache.clear();
  const ctx = { supabase: fakeDb(tablesOf(opts), {}, {}), userId: USER, email: "ada@example.com", params: {} };
  const tc = {
    ...newToolContext(ctx, A, "owner", TZ, new Date("2026-11-10T12:00:00Z")),
    question: opts.question ?? OWNER,
    askedEarlier: [],
    language: "en",
  };
  return buildProposal(tc, "propose_piece", { ...INPUT, ...input });
}

/** The edge's door as the act knocks it: a cut's first frame cut into its folder, and the storyboard held as a copy. */
const frameKnocks = [];
const shown = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (!String(url).includes("/api/admin/files/copies")) return realFetch(url, init);
  const body = JSON.parse(init.body);
  if (body.frames) {
    frameKnocks.push(...body.frames.map((f) => f.at));
    return new Response(
      JSON.stringify({
        ok: true,
        copies: [],
        frames: body.frames.map((f) => ({ key: f.key, kept: true, width: 720, height: 1280 })),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  const pictures = [];
  for (const p of body.pictures ?? []) {
    const meta = await sharp(Buffer.from(p.bytes, "base64")).metadata();
    shown.push({ name: p.name, format: meta.format, width: meta.width, height: meta.height });
    pictures.push({ key: p.key, file_id: "file_board", width: meta.width, height: meta.height });
  }
  return new Response(JSON.stringify({ ok: true, copies: [], pictures }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
  setServiceClient(null);
});

/** The clip's folder in Storage: a frame is there once the edge has cut it. */
let frame = null;
function framesInStorage() {
  const service = fakeDb({ files: [] }, {}, {});
  service.storage = {
    from: () => ({
      download: async () =>
        frameKnocks.length
          ? { data: new Blob([(frame ??= await flat(90))]), error: null }
          : { data: null, error: { message: "no" } },
    }),
  };
  setServiceClient(service);
}

/** The act as a turn runs it: the first call draws the storyboard for a look, and the second, with its key, makes the card. */
async function asked(input, opts) {
  framesInStorage();
  const first = await askedOnce(input, opts);
  if (first.proposal || first.isError) return first;
  return askedOnce({ ...input, looked: JSON.parse(first.result).look_key }, opts);
}

test("the first call makes no card: it draws the storyboard and shows it to Ask, with the key a second call carries", async () => {
  framesInStorage();
  frameKnocks.length = 0;
  shown.length = 0;
  const first = await askedOnce({});
  assert.equal(first.proposal, null);
  assert.equal(first.isError, false, first.result);
  const said = JSON.parse(first.result);
  assert.equal(said.drawn, true);
  assert.match(said.look_key, /^[0-9a-f]{10}$/);
  assert.match(said.note, /cover a face/);
  // Each cut's first frame, a tenth of a second inside it, asked of the clip's own folder.
  assert.deepEqual(frameKnocks, [2.4, 4.9, 7.4, 9.9]);
  assert.deepEqual(shown, [{ name: "video-storyboard.jpg", format: "jpeg", width: 4 * 360 + 3 * 12, height: 684 }]);
  assert.equal(first.pictures?.length, 1);
});

test("the card is made by the call that carries the look's key: the plan its press will send, by each clip's id", async () => {
  const out = await asked({});
  assert.equal(out.proposal?.kind, "piece", out.result);
  assert.equal(out.proposal.needs, "partner");
  assert.equal(out.proposal.title, "Video: I asked for volume");
  // How long, which way up, what from: one clip here.
  assert.equal(out.proposal.summary, PIECE_WORDS.summary(4, 10.4, 1));
  assert.equal(out.proposal.summary, "10 seconds, vertical. 4 moments from your clip.");
  assert.deepEqual(piecePlanOf(out.proposal.payload), {
    shape: "hook_cut",
    cuts: [
      { file_id: CLIP, from: 2.3, to: 4.8 },
      { file_id: CLIP, from: 4.8, to: 6.8 },
      { file_id: CLIP, from: 7.3, to: 9.3 },
      { file_id: CLIP, from: 9.8, to: 11.9 },
    ],
    lines: ["I asked for volume", "Did I get it?"],
    words_at: "low",
    words_hold: "all",
    end_line: "Same chair. New me.",
    language: "en",
    people_agreed: false,
  });
  assert.equal(out.proposal.undo, null, "a press spends the drawing: there is no Undo");
  assert.deepEqual(askTraitsOf("piece"), { shape: "make", reach: "keeps", row: null, alone: "press", press: "make" });
});

test("a plan changed since the look is looked at again: its old key makes no card", async () => {
  framesInStorage();
  const first = await askedOnce({});
  const key = JSON.parse(first.result).look_key;
  const moved = await askedOnce({ words_at: "high", looked: key });
  assert.equal(moved.proposal, null);
  assert.match(moved.refusal, /the plan changed since you looked/);
});

test("the words are held to what the owner said: a price, a promise or a number of Ask's own never reaches a video", async () => {
  assert.match((await asked({ lines: ["Blowouts from $45", "Did I get it?"] })).refusal, /^line 1: .*price/);
  assert.match((await asked({ end_line: "Guaranteed to last" })).refusal, /^end_line: .*promise/);
  assert.equal((await asked({ lines: ["Asked for volume."] })).proposal?.kind, "piece");
});

test("the clips are held to what a video may be cut from, and the refusal names the cut", async () => {
  assert.match(
    (await asked({ cuts: [{ file: "no-such-clip", from: 0, to: 3 }, ...INPUT.cuts.slice(1)] })).refusal,
    /^cut 1: no file named no-such-clip/,
  );
  const far = [...INPUT.cuts.slice(0, 3), { file: "salon-chair-reveal", from: 10, to: 13.5 }];
  assert.match((await asked({ cuts: far })).refusal, /^cut 4: it runs past the end of its clip/);
  assert.match(
    (await asked({}, { clip: { media_status: "processing" } })).refusal,
    /^cut 1: its clip is still being made ready/,
  );
  assert.match((await asked({}, { clip: { status: "inbox" } })).refusal, /^cut 1: its clip waits in the Inbox/);
  assert.match((await asked({ cuts: INPUT.cuts.slice(0, 2) })).refusal, /the cuts together run 8 to 15 seconds/);
  assert.match(
    (await asked({ cuts: [{ ...INPUT.cuts[0], from: "soon" }, ...INPUT.cuts.slice(1)] })).refusal,
    /^cut 1: from and to are moments/,
  );
});

test("a clip that shows someone recognizable waits for the owner's word that they agreed", async () => {
  const seen = { clip: { look: { line: "x", people: { count: 1, recognizable: 1 } } } };
  assert.match((await asked({}, seen)).refusal, /^cut 1: its clip shows someone recognizable/);
  const agreed = await asked({ people_agreed: true }, seen);
  assert.equal(agreed.proposal?.kind, "piece", agreed.result);
  assert.equal(piecePlanOf(agreed.proposal.payload).people_agreed, true);
});

test("a workspace that keeps no videos is offered none", async () => {
  assert.match((await asked({}, { videos: false })).refusal, /does not keep videos yet/);
});

/* ------------------------------------------------------------------------- the press */

const PLAN = {
  shape: "hook_cut",
  cuts: [
    { file_id: CLIP, from: 2.3, to: 4.8 },
    { file_id: CLIP, from: 4.8, to: 6.8 },
    { file_id: CLIP, from: 7.3, to: 9.3 },
    { file_id: CLIP, from: 9.8, to: 11.9 },
  ],
  lines: ["I asked for volume", "Did I get it?"],
  words_at: "low",
  words_hold: "all",
  end_line: null,
  language: "en",
  people_agreed: false,
};

function pressed(plan, { fate = "begun", ...opts } = {}) {
  readerCache.clear();
  const knocks = [];
  const supabase = fakeDb(
    tablesOf(opts),
    {},
    {
      piece_begin: (a) => (knocks.push(["piece_begin", a]), { fate, piece_id: fate === "busy" ? null : "pc-1" }),
      file_change: (a) => (knocks.push(["file_change", a]), null),
    },
  );
  const ctx = { supabase, userId: USER, email: "ada@example.com", params: {} };
  const member = { tenantId: A, role: "owner", userId: USER };
  return beginPieceFor(ctx, member, { ...plan, key: "p-card-1" }).then(
    (answer) => ({ answer, knocks }),
    (refused) => ({ refused, knocks }),
  );
}

test("the press writes the video's row: its plan, the business's look as it stands, the card's key and the template's edition", async () => {
  const { answer, knocks } = await pressed(PLAN);
  assert.deepEqual(answer, { piece_id: "pc-1", fate: "begun" });
  assert.deepEqual(knocks, [
    [
      "piece_begin",
      {
        p_tenant_id: A,
        p_plan: PLAN,
        p_look: { accent: "#336699", logo_path: null, name: "Harbor", book: "Book · (555) 010-0100", address: null },
        p_key: "p-card-1",
        p_edition: PIECE_TEMPLATE.edition,
      },
    ],
  ]);
  // Pressed again, it is the one video.
  assert.deepEqual((await pressed(PLAN, { fate: "here" })).answer, { piece_id: "pc-1", fate: "here" });
});

test("a brand colour that would not read on the end card's dark ground is not worn: the name is set in white", async () => {
  // Navy on near-black is lost, as it is on a post's scrim (posts/layout.ts colourOn): the one rule, the card's own ground.
  const navy = await pressed(PLAN, { accent: "#0b1f3a" });
  assert.equal(navy.knocks[0][1].p_look.accent, "#ffffff");
  // A colour that reads is the business's own; a workspace with none is white too.
  assert.equal((await pressed(PLAN, { accent: "#e8b84a" })).knocks[0][1].p_look.accent, "#e8b84a");
  assert.equal((await pressed(PLAN, { accent: null })).knocks[0][1].p_look.accent, "#ffffff");
});

test("a clip is this workspace's own: one the person may see in another of their workspaces is no clip of this plan", async () => {
  // Their session reads both workspaces' files; the plan is this one's.
  const theirs = await pressed(PLAN, { clip: { tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } });
  assert.equal(theirs.refused?.message, PIECE_WORDS.wont.file);
  assert.deepEqual(theirs.knocks, []);
});

test("a workspace that keeps no videos is told so at the press, in a video's own words", async () => {
  const off = await pressed(PLAN, { videos: false });
  assert.equal(off.refused?.message, PIECE_WORDS.off);
  assert.deepEqual(off.knocks, []);
});

test("a press is checked afresh: a clip gone since the card is refused in a person's words, and nothing is written", async () => {
  const gone = await pressed(PLAN, { clip: { removed_at: "2026-11-10T00:00:00Z" } });
  assert.equal(gone.refused?.message, PIECE_WORDS.wont.file);
  assert.deepEqual(gone.knocks, []);
  const off = await pressed(PLAN, { videos: false });
  assert.ok(off.refused, "videos off");
  assert.deepEqual(off.knocks, []);
});

test("the owner's word that those in the clips agreed goes on each clip first, through its own door", async () => {
  const { knocks } = await pressed(
    { ...PLAN, people_agreed: true },
    { clip: { look: { people: { count: 1, recognizable: 1 } } } },
  );
  assert.deepEqual(
    knocks.map(([door]) => door),
    ["file_change", "piece_begin"],
  );
  assert.equal(knocks[0][1].p_id, CLIP);
  // Without their word, a recognizable face stops the press too.
  const unasked = await pressed(PLAN, { clip: { look: { people: { count: 1, recognizable: 1 } } } });
  assert.equal(unasked.refused?.message, PIECE_WORDS.wont.people);
});

test("three being made is the most: a fourth press is told so, and can be pressed again", async () => {
  const { refused } = await pressed(PLAN, { fate: "busy" });
  assert.equal(refused?.message, PIECE_WORDS.busy);
});

test("the card commits by its own id, so one press is one video, and says where the video lands", () => {
  const card = { id: "p-card-9", kind: "piece", payload: { ...PLAN, extra: 1 }, summary: "s" };
  assert.deepEqual(pieceSpec.commit(card, {}), { route: "POST files/video", body: { ...PLAN, key: "p-card-9" } });
  assert.equal(pieceSpec.receipt(card, {}), PIECE_WORDS.making);
  assert.equal(pieceSpec.made(card, { piece_id: "pc-1" }), "pc-1");
  assert.equal(pieceSpec.open(card, null), "admin/files");
  assert.equal(pieceSpec.undo, undefined);
});

/* ---------------------------------------------------------------- the card's read, once pressed */

test("a card reads where its video stands: its row, and its file once it has one", async () => {
  const { pieceScope, readPiece } = await import(at("apps/dashboard/src/server/content/piece-read.ts"));
  const PIECE = "99999999-0000-4000-8000-000000000001";
  const row = (over = {}) => ({
    id: PIECE,
    tenant_id: A,
    status: "making",
    stage: "drawing",
    failed_why: null,
    file_id: null,
    ...over,
  });
  const world = (piece, files = []) => ({
    supabase: fakeDb({ pieces: piece ? [piece] : [], files }, {}, {}),
    userId: USER,
    email: "ada@example.com",
    params: { id: PIECE },
  });
  // Being made: where it is at, and no file yet.
  let ctx = world(row());
  assert.deepEqual(await readPiece(ctx, await pieceScope.load(ctx, ctx.params)), {
    status: "making",
    stage: "drawing",
    failed_why: null,
    file: null,
  });
  // Made: its file as every page reads one, so the card can say Ask is still looking, or that it is ready.
  const made = clipRow({ id: CLIP, source: "made", name: "i-asked-for-volume", look_status: "waiting" });
  ctx = world(row({ status: "made", stage: "saving", file_id: CLIP }), [made]);
  const read = await readPiece(ctx, await pieceScope.load(ctx, ctx.params));
  assert.deepEqual(
    [read.status, read.file?.id, read.file?.name, read.file?.look_status],
    ["made", CLIP, "i-asked-for-volume", "waiting"],
  );
  // Not made: why, from the closed set.
  ctx = world(row({ status: "failed", failed_why: "draw" }));
  assert.equal((await readPiece(ctx, await pieceScope.load(ctx, ctx.params))).failed_why, "draw");
  // A word this build does not know reads as the one before anything happened, never as a state of its own.
  ctx = world(row({ stage: "polishing" }));
  assert.equal((await readPiece(ctx, await pieceScope.load(ctx, ctx.params))).stage, "queued");
  // Not theirs to see, or gone with its file: a 404, in a video's words.
  ctx = world(null);
  await assert.rejects(pieceScope.load(ctx, ctx.params), (e) => e.code === "not_found" && e.status === 404);
  await assert.rejects(pieceScope.load(ctx, { id: "not-an-id" }), (e) => e.code === "not_found");
});
