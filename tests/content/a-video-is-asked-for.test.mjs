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
const { beginPieceFor, pieceBeginInput, pieceBoardInput } = await import(
  at("apps/dashboard/src/server/content/piece.ts")
);
const { drawPieceBoard } = await import(at("apps/dashboard/src/server/content/storyboard.ts"));
const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { buildProposal, newToolContext, toApiTools } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { pieceAct } = await import(at("apps/dashboard/src/server/ask/tools/act/files/piece.ts"));
const { PIECE_RECIPES } = await import(at("apps/dashboard/src/server/content/piece-recipes.ts"));
const { PIECE_CARD, PIECE_FRAME, PIECE_SIDE, pieceWordsBoxOf } = await import(
  at("packages/contracts/src/content/piece-frame.ts")
);
const { compilePiece } = await import(at("packages/contracts/src/content/piece-timeline.ts"));
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
  side: PIECE_SIDE,
  clearBottom: PIECE_FRAME.clearBottom,
  caption: {
    size: PIECE_FRAME.labelSize,
    pad: PIECE_FRAME.labelPad,
    padSide: PIECE_FRAME.labelPadSide,
    lift: PIECE_FRAME.labelLift,
  },
  rule: PIECE_FRAME.pairRule,
  card: { lift: PIECE_CARD.lift, dim: PIECE_CARD.dim, fromSize: PIECE_CARD.fromSize },
  ink: PIECE_FRAME.ink,
  paper: PIECE_FRAME.paper,
  accent: "#e8b84a",
};
/** A still as a tile is handed one: held at its middle. */
const shot = (bytes) => ({ bytes, heldAt: 0.5 });
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
  const tile = (words, i) => ({
    kind: "picture",
    shot: shot(frame),
    label: `${i + 1} · 0:02.3 to 0:04.8`,
    words,
    caption: null,
  });
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

test("a pair is one picture over the other under their names, a card is its words on the dark ground, a quote dims its picture", async () => {
  const [light, dark] = await Promise.all([flat(200), flat(60)]);
  const board = await composeBoard({
    tiles: [
      { kind: "pair", before: shot(light), after: shot(dark), names: ["Before", "After"], label: "1", words: false },
      { kind: "card", lines: ["Same chair.", "New you."], size: 120, label: "2" },
      {
        kind: "quote",
        lines: ["Best blowout", "in Brooklyn"],
        size: 72,
        from: "Maria G.",
        over: shot(light),
        label: "3",
      },
      { kind: "quote", lines: ["Best blowout", "in Brooklyn"], size: 72, from: null, over: null, label: "4" },
      { kind: "picture", shot: shot(light), label: "5", words: false, caption: "Silk press" },
    ],
    words: { lines: [], top: 0, size: 96 },
    frame: FRAME,
    plain: true,
  });
  const meta = await sharp(board).metadata();
  assert.deepEqual([meta.width, meta.height], [5 * 360, 640]);
  const k = 360 / PIECE_FRAME.width;
  const near = (seen, wanted, name) => assert.ok(Math.abs(seen - wanted) < 8, `${name}: ${seen}`);
  // The pair: before fills the upper half and after the lower, the paper's rule between them at the frame's middle.
  near(await lightOf(board, 200, 60, 100, 40), 200, "before, above");
  near(await lightOf(board, 200, 420, 100, 40), 60, "after, below");
  assert.ok((await lightOf(board, 200, 319, 100, 2)) > 215, "the rule between them is the paper");
  // Each under its own name, at the captions' left edge: the upper one stands off the rule, the lower off the app's own caption.
  const upperFoot = 640 - Math.round((PIECE_FRAME.height / 2 + PIECE_FRAME.pairRule / 2 + PIECE_FRAME.labelLift) * k);
  const lowerFoot = 640 - Math.round(PIECE_FRAME.clearBottom * k);
  const left = Math.round(PIECE_SIDE * k) + 4;
  assert.ok((await lightOf(board, left, upperFoot - 14, 30, 8)) < 170, "Before, on its backing");
  assert.notEqual(Math.round(await lightOf(board, left, lowerFoot - 14, 30, 8)), 60, "After, on its backing");
  // A words card: the end card's ground to its corners, and its words about its middle.
  near(await lightOf(board, 360 + 10, 10, 40, 40), 14, "the card's ground");
  assert.ok((await lightOf(board, 360 + 60, 250, 240, 90)) > 30, "the card's words");
  // A quote over a picture: the picture, darkened by the card's own share, and words on it. With no picture, the ground.
  near(await lightOf(board, 720 + 10, 10, 40, 40), 200 * (1 - PIECE_CARD.dim), "a quote's picture, dimmed");
  assert.ok((await lightOf(board, 720 + 30, 250, 220, 90)) > 200 * (1 - PIECE_CARD.dim) + 10, "the quote's words");
  near(await lightOf(board, 1080 + 10, 10, 40, 40), 14, "a quote with no picture");
  // Ask's look keeps each tile's number under it: a card fills its tile and no more, so the strip under it is the page's.
  const numbered = await composeBoard({
    tiles: [{ kind: "quote", lines: ["Best blowout"], size: 72, from: null, over: shot(light), label: "1" }],
    words: { lines: [], top: 0, size: 96 },
    frame: FRAME,
  });
  assert.ok(Math.abs((await lightOf(numbered, 4, 640 + 4, 40, 10)) - 17) < 4, "the strip under a card is not dimmed");
  // A picture's own caption stands where a pair's lower name does.
  assert.ok((await lightOf(board, 1440 + left, lowerFoot - 14, 30, 8)) < 170, "a caption, on its backing");
  near(await lightOf(board, 1440 + 200, lowerFoot - 14, 100, 8), 200, "and nothing beside it");
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
const PHOTO = "ffffffff-0000-4000-8000-000000000002";
const PHOTO_2 = "ffffffff-0000-4000-8000-000000000003";
const PHOTO_3 = "ffffffff-0000-4000-8000-000000000004";
/** A photo kept in Files, named for its id's last figure: photo-2, photo-3, photo-4. */
const photoRow = (id) =>
  clipRow({ id, kind: "image", mime: "image/jpeg", name: `photo-${id.slice(-1)}`, seconds: null, media_status: null });
const PHOTOS = [photoRow(PHOTO), photoRow(PHOTO_2), photoRow(PHOTO_3)];
const INPUT = {
  blocks: [
    { is: "clip", file: "salon-chair-reveal", from: "0:02.3", to: "0:04.8" },
    { is: "clip", file: "salon-chair-reveal", from: 4.8, to: 6.8 },
    { is: "clip", file: "salon-chair-reveal", from: 7.3, to: 9.3 },
    { is: "clip", file: "salon-chair-reveal", from: "0:09.8", to: "0:11.9" },
  ],
  lines: ["I asked for volume", "Did I get it?"],
  words_at: "low",
  words_hold: "all",
  end_line: "Same chair. New me.",
};

function tablesOf({
  clip = {},
  more = [],
  reviews = [],
  videos = true,
  phone = "(555) 010-0100",
  accent = "#336699",
} = {}) {
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
    files: [clipRow(clip), ...more],
    // What clients wrote of the business, newest first.
    google_reviews: reviews.map((body, i) => ({
      id: `rv-${i}`,
      tenant_id: A,
      body,
      published_at: `2026-11-0${9 - i}T12:00:00Z`,
    })),
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
  assert.equal(out.proposal.summary, PIECE_WORDS.summary({ blocks: 4, moments: 4, clips: 1, photos: 0 }, 10.4));
  assert.equal(out.proposal.summary, "10 seconds, vertical. 4 moments from your clip.");
  // Kept in blocks, each naming its file by id: what the card's stills are asked with and what its press sends.
  assert.deepEqual(
    piecePlanOf(out.proposal.payload).blocks.map((b) => [b.is, b.file_id, b.from, b.to, b.label]),
    [
      ["clip", CLIP, 2.3, 4.8, null],
      ["clip", CLIP, 4.8, 6.8, null],
      ["clip", CLIP, 7.3, 9.3, null],
      ["clip", CLIP, 9.8, 11.9, null],
    ],
  );
  assert.deepEqual(out.proposal.payload, {
    shape: "blocks",
    blocks: [
      { is: "clip", file_id: CLIP, from: 2.3, to: 4.8, label: null },
      { is: "clip", file_id: CLIP, from: 4.8, to: 6.8, label: null },
      { is: "clip", file_id: CLIP, from: 7.3, to: 9.3, label: null },
      { is: "clip", file_id: CLIP, from: 9.8, to: 11.9, label: null },
    ],
    lines: ["I asked for volume", "Did I get it?"],
    words_at: "low",
    words_hold: "all",
    end_line: "Same chair. New me.",
    language: "en",
    people_agreed: false,
  });
  assert.equal(
    pieceBeginInput.safeParse({ ...out.proposal.payload, key: "p-card-1" }).success,
    true,
    "its press takes it",
  );
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

test("the clips are held to what a video may be cut from, and the refusal names the block", async () => {
  const [first, ...rest] = INPUT.blocks;
  assert.match(
    (await asked({ blocks: [{ is: "clip", file: "no-such-clip", from: 0, to: 3 }, ...rest] })).refusal,
    /^block 1: no file named no-such-clip/,
  );
  const far = [...INPUT.blocks.slice(0, 3), { is: "clip", file: "salon-chair-reveal", from: 10, to: 13.5 }];
  assert.match((await asked({ blocks: far })).refusal, /^block 4: it runs past the end of its clip/);
  assert.match(
    (await asked({}, { clip: { media_status: "processing" } })).refusal,
    /^block 1: its clip is still being made ready/,
  );
  assert.match((await asked({}, { clip: { status: "inbox" } })).refusal, /^block 1: its file waits in the Inbox/);
  assert.match((await asked({ blocks: INPUT.blocks.slice(0, 2) })).refusal, /the blocks together run 8 to 15 seconds/);
  assert.match(
    (await asked({ blocks: [{ ...first, from: "soon" }, ...rest] })).refusal,
    /^block 1: from and to are moments/,
  );
});

test("a clip that shows someone recognizable waits for the owner's word that they agreed", async () => {
  const seen = { clip: { look: { line: "x", people: { count: 1, recognizable: 1 } } } };
  assert.match((await asked({}, seen)).refusal, /^block 1: its file shows someone recognizable/);
  const agreed = await asked({ people_agreed: true }, seen);
  assert.equal(agreed.proposal?.kind, "piece", agreed.result);
  assert.equal(piecePlanOf(agreed.proposal.payload).people_agreed, true);
});

test("a workspace that keeps no videos is offered none", async () => {
  assert.match((await asked({}, { videos: false })).refusal, /does not keep videos yet/);
});

/* ------------------------------------------------------------------------- what Ask arranges */

/** The act where every picture a block shows is in its folder already: a photo, or a clip's frame. */
async function arranged(input, opts) {
  const service = fakeDb({ files: [] }, {}, {});
  service.storage = {
    from: () => ({ download: async () => ({ data: new Blob([(frame ??= await flat(90))]), error: null }) }),
  };
  setServiceClient(service);
  const first = await askedOnce(input, opts);
  if (first.proposal || first.isError) return first;
  return askedOnce({ ...input, looked: JSON.parse(first.result).look_key }, opts);
}

test("a video from photos alone makes a card: each photo by the name files says, a label where one is given", async () => {
  const blocks = [
    { is: "photo", file: "photo-2", seconds: 3, label: "Silk press" },
    { is: "photo", file: "photo-3", seconds: 3 },
    { is: "photo", file: "photo-4", seconds: 3 },
  ];
  const out = await arranged({ blocks }, { more: PHOTOS });
  assert.equal(out.proposal?.kind, "piece", out.result);
  assert.deepEqual(out.proposal.payload.blocks, [
    { is: "photo", file_id: PHOTO, seconds: 3, label: "Silk press" },
    { is: "photo", file_id: PHOTO_2, seconds: 3, label: null },
    { is: "photo", file_id: PHOTO_3, seconds: 3, label: null },
  ]);
  assert.equal(out.proposal.title, "Video: I asked for volume");
  // Nine seconds of photos and the end card after them.
  assert.equal(out.proposal.summary, "11 seconds, vertical. 3 parts from 3 of your photos.");
});

test("a quote is a client's own words: found in a review the workspace holds or in what the owner wrote, never Ask's", async () => {
  const reviews = ["Came in for a silk press. Best blowout in Brooklyn, hands down! Will be back.", "Lovely place."];
  const blocks = [
    { is: "clip", file: "salon-chair-reveal", from: 2.3, to: 4.8 },
    {
      is: "quote",
      text: "\u201CBest blowout in Brooklyn, hands down!\u201D",
      over: "photo-2",
      seconds: 3.5,
    },
    { is: "pair", before: "photo-3", after: "salon-chair-reveal", after_at: "0:07.6", seconds: 3 },
  ];
  const out = await arranged({ blocks }, { more: PHOTOS, reviews });
  assert.equal(out.proposal?.kind, "piece", out.result);
  // A client's "best" is theirs to say, where the owner's opening words are held to the owner's own.
  assert.deepEqual(out.proposal.payload.blocks, [
    { is: "clip", file_id: CLIP, from: 2.3, to: 4.8, label: null },
    {
      is: "quote",
      text: "\u201CBest blowout in Brooklyn, hands down!\u201D",
      // Where it was said, which code reads from where it was found, and never who said it.
      from: "Google review",
      over: { file_id: PHOTO, at: null },
      seconds: 3.5,
    },
    { is: "pair", before: { file_id: PHOTO_2, at: null }, after: { file_id: CLIP, at: 7.6 }, seconds: 3 },
  ]);
  assert.equal(out.proposal.summary, "11 seconds, vertical. 3 parts from your clips and photos.");
  // Reworded, it is no one's words: no review says it.
  const reworded = blocks.map((b) => (b.is === "quote" ? { ...b, text: "The best blowout in all of Brooklyn" } : b));
  const refused = await arranged({ blocks: reworded }, { more: PHOTOS, reviews });
  assert.equal(refused.proposal, null);
  assert.match(refused.refusal, /^block 2: the quote is not in a review this workspace holds/);
  // What the owner wrote in this thread is theirs to pass on.
  const pasted = await arranged(
    { blocks: reworded },
    { more: PHOTOS, question: "Make a video from this review: The best blowout in all of Brooklyn" },
  );
  assert.equal(pasted.proposal?.kind, "piece", pasted.result);
  assert.equal(pasted.proposal.payload.blocks[1].from, "A client");
  // A clip held still says which moment.
  const unsaid = blocks.map(({ after_at: _unsaid, ...b }) => b);
  assert.match(
    (await arranged({ blocks: unsaid }, { more: PHOTOS, reviews })).refusal,
    /^block 3: salon-chair-reveal is a clip: say after_at/,
  );
});

test("a refusal names its block and says what to do", async () => {
  const opts = { more: PHOTOS };
  const [first, second, ...rest] = INPUT.blocks;
  const asPhoto = [{ is: "photo", file: "salon-chair-reveal", seconds: 2.5 }, second, ...rest];
  assert.match((await arranged({ blocks: asPhoto }, opts)).refusal, /^block 1: its file is a video: a photo block/);
  const asClip = [first, { is: "clip", file: "photo-2", from: 0, to: 2 }, ...rest];
  assert.match((await arranged({ blocks: asClip }, opts)).refusal, /^block 2: its file is a picture: a clip block/);
  const longCard = [first, second, { is: "words", lines: ["This line runs far too long to read"], seconds: 2 }];
  assert.match((await arranged({ blocks: longCard }, opts)).refusal, /^block 3: it is over 22 characters/);
  const held = [{ is: "photo", file: "photo-2", seconds: 6 }, second, ...rest];
  assert.match(
    (await arranged({ blocks: held }, opts)).refusal,
    /^block 1: it runs shorter or longer than its kind may/,
  );
  // A block gives the fields of its kind.
  const bare = [{ is: "photo", seconds: 2.5 }, second, ...rest];
  assert.match((await arranged({ blocks: bare }, opts)).refusal, /^block 1: a photo block gives file and seconds/);
  const half = [first, { is: "pair", before: "photo-2", seconds: 3 }, ...rest];
  assert.match((await arranged({ blocks: half }, opts)).refusal, /^block 2: a pair gives before and after/);
  // A label is the owner's words, as the opening words are.
  const priced = [{ ...first, label: "From $45" }, second, ...rest];
  assert.match((await arranged({ blocks: priced }, opts)).refusal, /^block 1: .*price/);
});

test("a video may open on a card: it has no opening words, and is known by its first card's", async () => {
  const cards = [
    { is: "words", lines: ["New in town?"], seconds: 2.5 },
    { is: "words", lines: ["Harbor does", "silk presses"], seconds: 2.5 },
    { is: "words", lines: ["Walk-ins", "welcome"], seconds: 2.5 },
    { is: "words", lines: ["Come see us"], seconds: 2.5 },
  ];
  const out = await arranged({ blocks: cards, lines: [] });
  assert.equal(out.proposal?.kind, "piece", out.result);
  assert.equal(out.proposal.title, "Video: New in town?");
  assert.equal(out.proposal.summary, "12 seconds, vertical. 4 cards of words.");
  assert.deepEqual(out.proposal.payload.lines, []);
  assert.match((await arranged({ blocks: cards })).refusal, /^block 1: the opening words sit over a picture/);
  // A card's words are held to the owner's, as the opening words are.
  const priced = [{ is: "words", lines: ["Blowouts $45"], seconds: 2.5 }, ...cards.slice(1)];
  assert.match((await arranged({ blocks: priced, lines: [] })).refusal, /^block 1: .*price/);
  // A video that opens on a picture says something over it.
  assert.match((await arranged({ lines: [] })).refusal, /a video that opens on a picture has opening words/);
});

test("Ask is offered blocks and the ways to arrange them: the cuts it took before are no input of the tool", async () => {
  assert.ok(pieceAct.description.includes(PIECE_RECIPES), "the recipes are said where the model fills the plan");
  for (const way of ["Hook first:", "Before and after:", "Steps:", "A review:", "From photos:", "Words only"])
    assert.ok(PIECE_RECIPES.includes(way), way);
  assert.match(PIECE_RECIPES, /advice, not forms/);
  // One flat block, each field said once: no union of objects, and no word the tools have not sent the API before.
  const sent = toApiTools("owner", true).find((tool) => tool.name === "propose_piece").input_schema;
  assert.equal(/"oneOf"|"const"/.test(JSON.stringify(sent)), false);
  assert.deepEqual(sent.properties.blocks.items.properties.is.enum, ["clip", "photo", "pair", "words", "quote"]);
  assert.deepEqual(sent.properties.blocks.items.required, ["is"]);
  assert.equal("cuts" in sent.properties, false);
  const cuts = INPUT.blocks.map(({ file, from, to }) => ({ file, from, to }));
  const out = await askedOnce({ blocks: undefined, cuts });
  assert.equal(out.proposal, null);
  assert.equal(out.isError, true);
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

/** A plan in blocks: one of each kind, under opening words that leave with the first picture. */
const BLOCKS_PLAN = {
  shape: "blocks",
  blocks: [
    { is: "clip", file_id: CLIP, from: 2.3, to: 4.8, label: "Silk press" },
    { is: "photo", file_id: PHOTO, seconds: 2.5, label: null },
    { is: "pair", before: { file_id: PHOTO_2, at: null }, after: { file_id: CLIP, at: 7.6 }, seconds: 3 },
    { is: "words", lines: ["Same chair.", "New you."], seconds: 1.8 },
    { is: "quote", text: "Best blowout in Brooklyn", from: "Maria G.", over: { file_id: PHOTO, at: null }, seconds: 3 },
  ],
  lines: ["I asked for volume", "Did I get it?"],
  words_at: "high",
  words_hold: "first",
  end_line: null,
  language: "en",
  people_agreed: false,
};

test("the stills of a plan in blocks are each block's own pictures: a clip's first frame, a photo, a pair's two, a quote's ground", async () => {
  const files = [clipRow(), photoRow(PHOTO), photoRow(PHOTO_2)];
  const sources = files.map((f) => ({
    id: f.id,
    kind: f.kind,
    status: f.status,
    source: f.source,
    media_status: f.media_status,
    seconds: f.seconds,
    people_unasked: false,
  }));
  const look = { accent: "#e8b84a", logo: false, name: "Harbor", book: null, address: null };
  const compiled = compilePiece(piecePlanOf(BLOCKS_PLAN), sources, look);
  assert.equal(compiled.ok, true, JSON.stringify(compiled));
  // The folders in Storage: every still asked for is there, and each read is kept by what it was of.
  const reads = [];
  const still = await flat(150);
  const service = fakeDb({ files: [] }, {}, {});
  service.storage = {
    from: () => ({
      download: async (where, how) => {
        const [, id, name] = where.split("/");
        reads.push(`${id.slice(-1)}:${name}${how?.transform ? ":sized" : ""}`);
        return { data: new Blob([still]), error: null };
      },
    }),
  };
  setServiceClient(service);
  const ctx = { supabase: fakeDb({ files }, {}, {}), userId: USER, email: "ada@example.com", params: {} };
  const board = await drawPieceBoard(ctx, A, { timeline: compiled.timeline, look, files }, true);
  const meta = await sharp(board).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["jpeg", 5 * 360, 640]);
  // The clip a tenth of a second inside its cut; the photo; the pair's photo and its clip's moment; nothing for the words
  // card; the quote's ground. A photo is read at the size a drawing needs, a clip's moment as its folder keeps it.
  assert.deepEqual(reads.sort(), [
    "1:frame-240.jpg",
    "1:frame-760.jpg",
    "2:original.jpg:sized",
    "2:original.jpg:sized",
    "3:original.jpg:sized",
  ]);
  // The opening words leave with the first picture: their backing is on the first still and not on the second.
  const box = pieceWordsBoxOf(BLOCKS_PLAN.lines, "high");
  const y = Math.round((box.top + box.height / 2) * (360 / PIECE_FRAME.width)) - 6;
  assert.ok((await lightOf(board, 14, y, 20, 12)) < 120, "the words' backing on the first still");
  assert.ok(Math.abs((await lightOf(board, 360 + 14, y, 20, 12)) - 150) < 8, "the second still as it is");
});

test("a card's stills and its press take its plan as it is kept: in blocks, or as Hook first for a card made before", () => {
  assert.equal(pieceBoardInput.safeParse(PLAN).success, true);
  assert.equal(pieceBoardInput.safeParse(BLOCKS_PLAN).success, true);
  // A plan that opens on a card has no opening words.
  const onCard = { ...BLOCKS_PLAN, blocks: [BLOCKS_PLAN.blocks[3], ...BLOCKS_PLAN.blocks.slice(0, 3)], lines: [] };
  assert.equal(pieceBoardInput.safeParse(onCard).success, true);
  // A block of no known kind, or more blocks than a video holds, is not a plan.
  const odd = { ...BLOCKS_PLAN, blocks: [{ is: "sticker", seconds: 2 }, ...BLOCKS_PLAN.blocks.slice(1)] };
  assert.equal(pieceBoardInput.safeParse(odd).success, false);
  const many = { ...BLOCKS_PLAN, blocks: [...BLOCKS_PLAN.blocks, ...BLOCKS_PLAN.blocks] };
  assert.equal(pieceBoardInput.safeParse(many).success, false);
  assert.equal(pieceBeginInput.safeParse({ ...PLAN, key: "p-card-1" }).success, true);
  assert.equal(pieceBeginInput.safeParse({ ...BLOCKS_PLAN, key: "p-card-1" }).success, true);
  assert.equal(pieceBeginInput.safeParse({ ...onCard, key: "p-card-1" }).success, true);
  // A press names its card, and a plan one shape or the other.
  assert.equal(pieceBeginInput.safeParse(BLOCKS_PLAN).success, false);
  assert.equal(pieceBeginInput.safeParse({ ...PLAN, shape: "reel", key: "p-card-1" }).success, false);
  assert.equal(pieceBeginInput.safeParse({ ...odd, key: "p-card-1" }).success, false);
});

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

test("a plan in blocks is written as its card sent it, every file it names read afresh", async () => {
  const { answer, knocks } = await pressed(BLOCKS_PLAN, { more: PHOTOS });
  assert.deepEqual(answer, { piece_id: "pc-1", fate: "begun" });
  assert.deepEqual(
    knocks.map(([door]) => door),
    ["piece_begin"],
  );
  assert.deepEqual(knocks[0][1].p_plan, BLOCKS_PLAN);
  // A photo gone since the card is refused in a person's words, and nothing is written.
  const gone = await pressed(BLOCKS_PLAN, { more: [photoRow(PHOTO)] });
  assert.equal(gone.refused?.message, PIECE_WORDS.wont.file);
  assert.deepEqual(gone.knocks, []);
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

test("the card commits its plan as it is kept, by its own id, so one press is one video, and says where the video lands", () => {
  const card = { id: "p-card-9", kind: "piece", payload: PLAN, summary: "s" };
  assert.deepEqual(pieceSpec.commit(card, {}), { route: "POST files/video", body: { ...PLAN, key: "p-card-9" } });
  // In whichever shape it is kept: the door reads it, and a row holds what came.
  const inBlocks = { id: "p-card-8", kind: "piece", payload: BLOCKS_PLAN, summary: "s" };
  assert.deepEqual(pieceSpec.commit(inBlocks, {}).body, { ...BLOCKS_PLAN, key: "p-card-8" });
  assert.equal(pieceSpec.receipt(card, {}), PIECE_WORDS.making);
  assert.equal(pieceSpec.made(card, { piece_id: "pc-1" }), "pc-1");
  assert.equal(pieceSpec.open(card, null), "campaigns/content");
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
