/**
 * A video made from a business's clips starts as a plan (the video maker's first shape, "Hook first"): which clip, from which
 * second to which, the words that open it and where they sit. Code checks the plan before anything is spent and works out
 * everything the template draws, so the template draws its props and nothing else.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const { PIECE_LIMITS, PIECE_SHAPES, pieceCountOf, pieceFileIdsOf, pieceOpeningOf, piecePlanOf } = await import(
  at("packages/contracts/src/content/pieces.ts")
);
const { pieceWordsOnBlocks } = await import(at("packages/contracts/src/content/piece-timeline.ts"));
const { pieceStandsOf, pieceStillMoving, pieceWantsStills } = await import(
  at("packages/contracts/src/content/piece-card.ts")
);
const { PIECE_WORDS, pieceWordsIn } = await import(at("packages/contracts/src/content/piece-words.ts"));
const { compilePiece } = await import(at("packages/contracts/src/content/piece-timeline.ts"));
const { PIECE_CARD, PIECE_FRAME, pieceCardSizeOf, pieceLineWidthOf, pieceQuoteLinesOf, pieceWordsBoxOf } = await import(
  at("packages/contracts/src/content/piece-frame.ts")
);
const { PIECE_FACE_ADVANCES, PIECE_FACE_WIDEST } = await import(
  at("packages/contracts/src/content/piece-face.generated.ts")
);
const { FACE_FILE, OUT: FACE_OUT, faceAdvances, faceModule } = await import(at("tooling/scripts/gen/piece-face.mjs"));

const CLIP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const clip = (over = {}) => ({
  id: CLIP,
  kind: "video",
  status: "filed",
  source: "upload",
  media_status: "ready",
  seconds: 11.69,
  people_unasked: false,
  ...over,
});
const plan = (over = {}) => ({
  shape: "hook_cut",
  cuts: [
    { file_id: CLIP, from: 2.3, to: 4.8 },
    { file_id: CLIP, from: 4.8, to: 6.8 },
    { file_id: CLIP, from: 7.3, to: 9.3 },
    { file_id: CLIP, from: 9.8, to: 11.6 },
  ],
  lines: ["I asked for volume", "Did I get it?"],
  words_at: "low",
  words_hold: "all",
  end_line: "Same chair. New me.",
  language: "en",
  people_agreed: false,
  ...over,
});
const look = (over = {}) => ({
  accent: "#336699",
  logo: true,
  name: "Harbor Studio",
  book: "Book · (646) 555-0175",
  address: "12 Example St, Springfield",
  ...over,
});
const PHOTO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const photo = (over = {}) => clip({ id: PHOTO, kind: "image", media_status: null, seconds: null, ...over });
// A stored hook-first payload and a blocks payload are read by the one reader, as a press and the job read them.
const compiled = (p = plan(), sources = [clip()], l = look()) => compilePiece(piecePlanOf(p), sources, l);
const timelineOf = (p, sources, l) => {
  const out = compiled(p, sources, l);
  assert.equal(out.ok, true, out.ok ? "" : `refused: ${out.wont}`);
  return out.timeline;
};

test("a good plan becomes a timeline: each cut's place in its clip and its frames, then the end card", () => {
  const t = timelineOf();
  assert.deepEqual(
    t.blocks.map((c) => [c.source, c.trim, c.frames]),
    [
      [CLIP, 2.3, 75],
      [CLIP, 4.8, 60],
      [CLIP, 7.3, 60],
      [CLIP, 9.8, 54],
    ],
  );
  assert.equal(t.fps, 30);
  assert.deepEqual([t.width, t.height], [1080, 1920]);
  // The end card fades in over the reel's last frames, so the two overlap by the fade.
  assert.equal(t.frames, 75 + 60 + 60 + 54 + PIECE_FRAME.end - PIECE_FRAME.fade);
  assert.equal(t.accent, "#336699");
});

test("the words never wrap: a line is as large as it can be and still fit, measured in the template's own face", () => {
  // Eighteen characters as a person writes them fit at the largest size.
  assert.equal(pieceWordsBoxOf(["I asked for volume", "Did I get it?"], "low").size, PIECE_FRAME.wordsSizeMax);
  assert.equal(pieceWordsBoxOf(["Short"], "high").size, PIECE_FRAME.wordsSizeMax);
  // Wide capitals come down until the line fits, and no further.
  const wide = "W".repeat(PIECE_LIMITS.line);
  const { size } = pieceWordsBoxOf([wide, "x"], "high");
  assert.ok(size < PIECE_FRAME.wordsSizeMax / 2, `${size}`);
  assert.ok(pieceLineWidthOf(wide, size) <= PIECE_FRAME.wordsWidth);
  assert.ok(pieceLineWidthOf(wide, size + 1) > PIECE_FRAME.wordsWidth);
});

test("a character the face's table does not hold is taken at its widest, so a line can only come out smaller", () => {
  assert.equal(pieceLineWidthOf("中", 100), PIECE_FACE_WIDEST / 10);
  assert.equal(pieceLineWidthOf("ab", 100), (PIECE_FACE_ADVANCES.a + PIECE_FACE_ADVANCES.b) / 10);
});

test("the face's table is the font file's own, as its generator writes it", () => {
  const advances = faceAdvances();
  assert.deepEqual(PIECE_FACE_ADVANCES, advances);
  assert.ok(fs.existsSync(path.join(ROOT, FACE_FILE)));
  const written = fs.readFileSync(path.join(ROOT, FACE_OUT), "utf8").split(String.fromCharCode(13, 10));
  assert.equal(written.join(String.fromCharCode(10)), faceModule(), "stale: node tooling/scripts/gen/piece-face.mjs");
  // What a post's words may hold (post-check DRAWABLE) is what the table holds.
  for (const ch of ["A", "z", "0", "?", "é", "ñ", "¿", "’", "€"]) assert.ok(advances[ch] > 0, ch);
});

test("the words sit high or low, where the plan put them, and inside what a phone's own buttons leave clear", () => {
  const high = pieceWordsBoxOf(["Asked for layers.", "Left with these."], "high");
  const low = pieceWordsBoxOf(["Asked for layers.", "Left with these."], "low");
  assert.ok(high.top >= PIECE_FRAME.clearTop, "under the phone app's top bar");
  assert.ok(low.top > high.top + high.height, "low is under high");
  assert.ok(low.top + low.height <= PIECE_FRAME.height - PIECE_FRAME.clearBottom, "over the caption and the buttons");
  assert.ok(high.height > pieceWordsBoxOf(["Asked for layers."], "high").height, "a second line takes its room");
  // Low words end where high words would never reach: one line or two, they sit on the same floor.
  assert.equal(
    low.top + low.height,
    pieceWordsBoxOf(["Asked for layers."], "low").top + pieceWordsBoxOf(["Asked for layers."], "low").height,
  );
});

test("the timeline carries the words' box, so the template and the storyboard draw them in one place", () => {
  const t = timelineOf();
  const box = pieceWordsBoxOf(plan().lines, "low");
  assert.deepEqual([t.words.top, t.words.size], [box.top, box.size]);
  assert.deepEqual(t.words.lines, ["I asked for volume", "Did I get it?"]);
});

test("words held for the whole reel never leave it; held for the first cut they leave with it, after two seconds at least", () => {
  assert.equal(timelineOf().words.frames, null);
  assert.equal(timelineOf(plan({ words_hold: "first" })).words.frames, 75);
  const shortFirst = plan({
    words_hold: "first",
    cuts: [
      { file_id: CLIP, from: 0, to: 1.5 },
      { file_id: CLIP, from: 2, to: 6 },
      { file_id: CLIP, from: 6, to: 9 },
    ],
  });
  assert.equal(timelineOf(shortFirst).words.frames, 60);
});

test("a stretch a fraction past its clip's end is trimmed to the end; a real overrun is refused, naming the cut", () => {
  const over = plan({ cuts: [...plan().cuts.slice(0, 3), { file_id: CLIP, from: 9.8, to: 11.9 }] });
  const t = timelineOf(over);
  assert.equal(t.blocks[3].frames, Math.round((11.69 - 9.8) * 30), "trimmed to the clip's 11.69 s");
  const far = plan({ cuts: [...plan().cuts.slice(0, 3), { file_id: CLIP, from: 9.8, to: 12.5 }] });
  assert.deepEqual(compiled(far), { ok: false, wont: "past_end", cut: 4 });
});

test("a cut trimmed at its clip's end must still be long enough to see", () => {
  const stub = plan({ cuts: [...plan().cuts.slice(0, 3), { file_id: CLIP, from: 10.4, to: 11.9 }] });
  assert.deepEqual(compiled(stub), { ok: false, wont: "block_length", cut: 4 });
});

test("the shape's limits hold: how many cuts, how long each is, how long they are together", () => {
  const cut = (from, to) => ({ file_id: CLIP, from, to });
  assert.deepEqual(compiled(plan({ cuts: [cut(0, 4)] })), { ok: false, wont: "blocks" });
  assert.deepEqual(compiled(plan({ cuts: [0, 1, 2, 3, 4, 5, 6].map((n) => cut(n, n + 1.5)) })), {
    ok: false,
    wont: "blocks",
  });
  assert.deepEqual(compiled(plan({ cuts: [cut(0, 4), cut(4, 8), cut(8, 9)] })), {
    ok: false,
    wont: "block_length",
    cut: 3,
  });
  assert.deepEqual(compiled(plan({ cuts: [cut(0, 4.5), cut(5, 9)] })), { ok: false, wont: "block_length", cut: 1 });
  assert.deepEqual(compiled(plan({ cuts: [cut(0, 2), cut(2, 4), cut(4, 6)] })), { ok: false, wont: "length" });
  assert.deepEqual(compiled(plan({ cuts: [cut(5, 3), cut(0, 4), cut(4, 8)] })), { ok: false, wont: "stretch", cut: 1 });
  assert.equal(PIECE_LIMITS.blocksMin, 2);
  assert.equal(PIECE_LIMITS.blocksMax, 6);
});

test("a cut is drawn only from the business's own ready, kept video, and never from a video made here", () => {
  const wont = (source) => compiled(plan(), source ? [source] : []);
  assert.deepEqual(wont(null), { ok: false, wont: "file", cut: 1 });
  assert.deepEqual(wont(clip({ kind: "image" })), { ok: false, wont: "not_video", cut: 1 });
  assert.deepEqual(wont(clip({ source: "made" })), { ok: false, wont: "made", cut: 1 });
  assert.deepEqual(wont(clip({ status: "inbox" })), { ok: false, wont: "unkept", cut: 1 });
  assert.deepEqual(wont(clip({ media_status: "processing" })), { ok: false, wont: "not_ready", cut: 1 });
  assert.deepEqual(wont(clip({ seconds: null })), { ok: false, wont: "not_ready", cut: 1 });
});

test("a clip that shows someone recognizable waits for the word that they agreed", () => {
  const seen = [clip({ people_unasked: true })];
  assert.deepEqual(compiled(plan(), seen), { ok: false, wont: "people", cut: 1 });
  assert.equal(compiled(plan({ people_agreed: true }), seen).ok, true);
});

test("the opening words are one or two short lines", () => {
  assert.deepEqual(compiled(plan({ lines: [] })), { ok: false, wont: "lines" });
  assert.deepEqual(compiled(plan({ lines: ["One", "Two", "Three"] })), { ok: false, wont: "lines" });
  assert.deepEqual(compiled(plan({ lines: ["This line is far too long to read"] })), { ok: false, wont: "lines" });
  assert.deepEqual(compiled(plan({ lines: ["   "] })), { ok: false, wont: "lines" });
  assert.equal(compiled(plan({ lines: ["x".repeat(PIECE_LIMITS.line)] })).ok, true);
});

test("cuts may come from more than one of the business's clips", () => {
  const two = plan({
    cuts: [
      { file_id: CLIP, from: 0, to: 3 },
      { file_id: OTHER, from: 1, to: 4 },
      { file_id: CLIP, from: 5, to: 8 },
    ],
  });
  const t = timelineOf(two, [clip(), clip({ id: OTHER, seconds: 20 })]);
  assert.deepEqual(
    t.blocks.map((c) => c.source),
    [CLIP, OTHER, CLIP],
  );
});

test("the end card says the business's own: its last line split at the first middle dot, its name, booking line and address", () => {
  const t = timelineOf(plan({ end_line: "Book your visit · Hablamos español" }));
  assert.deepEqual(t.end, {
    line: "Book your visit",
    under: "Hablamos español",
    logo: true,
    name: "Harbor Studio",
    book: "Book · (646) 555-0175",
    address: "12 Example St, Springfield",
  });
  assert.deepEqual(
    [timelineOf(plan({ end_line: null })).end.line, timelineOf(plan({ end_line: null })).end.under],
    [null, null],
  );
});

test("a business with no colour of its own gets its words in white", () => {
  assert.equal(timelineOf(plan(), [clip()], look({ accent: null })).accent, "#ffffff");
});

test("a card's payload reads back as the plan, and nothing else rides along", () => {
  const read = piecePlanOf({ ...plan(), extra: "x", cuts: [...plan().cuts, { file_id: 7, from: "a" }] });
  const { cuts, ...rest } = plan();
  assert.deepEqual(read, {
    ...rest,
    shape: "blocks",
    blocks: cuts.map((cut) => ({ is: "clip", ...cut, label: null })),
  });
  assert.deepEqual(Object.keys(read).sort(), [
    "blocks",
    "end_line",
    "language",
    "lines",
    "people_agreed",
    "shape",
    "words_at",
    "words_hold",
  ]);
  assert.deepEqual(piecePlanOf({}), {
    shape: "blocks",
    blocks: [],
    lines: [],
    words_at: "high",
    words_hold: "first",
    end_line: null,
    language: "en",
    people_agreed: false,
  });
});

test("every reason a plan is refused has its words for a person, in both languages", () => {
  const wonts = [
    "blocks",
    "file",
    "not_video",
    "not_photo",
    "made",
    "unkept",
    "not_ready",
    "stretch",
    "past_end",
    "block_length",
    "length",
    "people",
    "lines",
    "opens_on_card",
    "card",
    "quote",
    "label",
  ];
  for (const language of ["en", "es"]) {
    const says = pieceWordsIn(language);
    assert.deepEqual(Object.keys(says.wont).sort(), [...wonts].sort(), language);
    for (const w of wonts) assert.ok(says.wont[w].length > 10, `${language} ${w}`);
  }
  assert.equal(pieceWordsIn("en"), PIECE_WORDS);
});

test("a video not made says why once: its card over Try again, its bell with what to do, in both languages", () => {
  const whys = ["clips", "draw", "store", "unknown"];
  for (const language of ["en", "es"]) {
    const says = pieceWordsIn(language);
    assert.deepEqual(Object.keys(says.failed).sort(), [...whys].sort(), language);
    for (const why of whys) {
      const fact = says.failed[why];
      // The card's line stands over a press that says Try again: it never says it a second time.
      assert.ok(!/try again|inténtalo/i.test(fact), `${language} ${why}: the card's line is the fact alone`);
      // The bell's row has no such press: the same fact, then what to do.
      const rung = says.bell.failedBody(why);
      assert.ok(rung.startsWith(`${fact} `) && rung.length > fact.length + 10, `${language} ${why}: ${rung}`);
      assert.ok(/ask for it again|pídelo de nuevo/i.test(rung), `${language} ${why}: the bell says what to do`);
    }
  }
});

test("a card is titled by its opening line, without the comma that leads into the next one", () => {
  // Seen on production 11 Nov 2026: "Long layers," / "all the bounce" made "Video: Long layers," and Ask's line over it
  // "Here it is: Video: Long layers,."
  for (const language of ["en", "es"]) {
    const says = pieceWordsIn(language);
    assert.equal(says.cardTitle("Long layers,"), "Video: Long layers");
    assert.equal(says.cardTitle("  Pedí volumen.  "), "Video: Pedí volumen.");
    assert.equal(says.cardTitle("Did I get it?"), "Video: Did I get it?");
    assert.equal(says.cardTitle("Same chair —"), "Video: Same chair");
  }
});

test("the bell names a made video as Content shows it, never by its file name", () => {
  // Seen on production 11 Nov 2026: "long-layers is in Files, under Made by Ask."
  assert.equal(PIECE_WORDS.bell.readyBody("long-layers"), "Long layers is in Content, under Made.");
  assert.equal(pieceWordsIn("es").bell.readyBody("pedi-volumen"), "Pedi volumen está en Contenido, en Hecho.");
});

test("a card asks for its stills before the press, while its video is made or was not, and for a ready one whose poster did not come", () => {
  const ready = { is: "ready", file: { id: "f1" } };
  // Before the press the stills are the card.
  assert.equal(pieceWantsStills(false, null, false), true);
  // Pressed, and nothing read of its video yet: the stills it has stand, and none are asked for.
  assert.equal(pieceWantsStills(true, null, false), false);
  assert.equal(pieceWantsStills(true, { is: "making", stage: "drawing" }, false), true);
  assert.equal(pieceWantsStills(true, { is: "failed", why: "draw" }, false), true);
  // A video that is ready shows itself, by its poster.
  assert.equal(pieceWantsStills(true, ready, false), false);
  // A poster is cut some seconds after its video can be played: one that did not come leaves the first still to stand in.
  assert.equal(pieceWantsStills(true, ready, true), true);
  assert.equal(pieceWantsStills(true, { is: "gone" }, true), false);
});

test("the stills wear the words wherever the video will: a first moment under two seconds leaves them on the second", () => {
  const at = (cuts, frames) =>
    pieceWordsOnBlocks({ blocks: cuts.map((f) => ({ is: "clip", frames: f })), words: { frames } });
  // Words that stay are on every moment.
  assert.deepEqual(at([75, 60, 60, 63], null), [true, true, true, true]);
  // Words that leave with a first moment of two seconds or more are on it alone.
  assert.deepEqual(at([75, 60, 60], 75), [true, false, false]);
  assert.deepEqual(at([60, 60, 60], 60), [true, false, false]);
  // A first moment of a second and a half: the words stay their two seconds, so the second moment opens under them.
  assert.deepEqual(at([45, 60, 60], 60), [true, true, false]);
});

/* ------------------------------------------------------------------------------------------------- blocks -- */

/** What the checker answered for this hook-first plan before a plan was blocks (main 1e27bb9d7a, 11 Nov 2026). */
const HOOK_FIRST_PAYLOAD = {
  shape: "hook_cut",
  cuts: [
    { file_id: "a", from: 9.3, to: 12 },
    { file_id: "a", from: 3, to: 5.8 },
    { file_id: "a", from: 6.3, to: 9 },
  ],
  lines: ["Straight hair in,", "curls out"],
  words_at: "high",
  words_hold: "all",
  end_line: null,
  language: "en",
  people_agreed: false,
};
const HOOK_FIRST_BEFORE = {
  width: 1080,
  height: 1920,
  fps: 30,
  frames: 304,
  cuts: [
    { source: "a", trim: 9.3, frames: 81 },
    { source: "a", trim: 3, frames: 84 },
    { source: "a", trim: 6.3, frames: 81 },
  ],
  words: { lines: ["Straight hair in,", "curls out"], top: 330, size: 96, frames: null },
  end: { line: null, under: null, logo: false, name: "Studio", book: null, address: null },
  accent: "#D4B46A",
};

test("a stored hook-first payload reads as blocks: each cut a clip block, nothing else changed", () => {
  const read = piecePlanOf(HOOK_FIRST_PAYLOAD);
  assert.equal(read.shape, "blocks");
  assert.deepEqual(read.blocks, [
    { is: "clip", file_id: "a", from: 9.3, to: 12, label: null },
    { is: "clip", file_id: "a", from: 3, to: 5.8, label: null },
    { is: "clip", file_id: "a", from: 6.3, to: 9, label: null },
  ]);
  assert.deepEqual([read.lines, read.words_at, read.words_hold], [["Straight hair in,", "curls out"], "high", "all"]);
});

test("a blocks payload reads back block by block, and one that does not read is left out", () => {
  const read = piecePlanOf({
    shape: "blocks",
    blocks: [
      { is: "photo", file_id: "p", seconds: 2.5, label: "Before" },
      { is: "pair", before: { file_id: "p", at: null }, after: { file_id: "c", at: 4.2 }, seconds: 3 },
      { is: "words", lines: ["Three steps"], seconds: 1.5 },
      { is: "quote", text: "Best blowout in Brooklyn", from: "Google review", over: null, seconds: 3 },
      { is: "spin", file_id: "p" },
      { is: "clip", file_id: "c", from: 1, to: "soon" },
    ],
    lines: [],
    language: "es",
  });
  assert.deepEqual(
    read.blocks.map((b) => b.is),
    ["photo", "pair", "words", "quote"],
  );
  assert.deepEqual(read.blocks[0], { is: "photo", file_id: "p", seconds: 2.5, label: "Before" });
  assert.deepEqual(read.blocks[1].after, { file_id: "c", at: 4.2 });
  assert.deepEqual(pieceFileIdsOf(read), ["p", "c"]);
  assert.equal(read.language, "es");
});

test("a hook-first plan compiles to the same seconds, words and end card it always did", () => {
  const now = compilePiece(
    piecePlanOf(HOOK_FIRST_PAYLOAD),
    [clip({ id: "a", seconds: 12 })],
    look({ accent: "#D4B46A", logo: false, name: "Studio", book: null, address: null }),
  );
  assert.equal(now.ok, true);
  assert.deepEqual(
    now.timeline.blocks,
    HOOK_FIRST_BEFORE.cuts.map((c) => ({ is: "clip", ...c, label: null })),
  );
  for (const key of ["width", "height", "fps", "frames", "words", "end", "accent"])
    assert.deepEqual(now.timeline[key], HOOK_FIRST_BEFORE[key], key);
});

test("each kind of block is held to its own limits, and a refusal names its block", () => {
  const blocks = (list, over = {}) => ({
    shape: "blocks",
    blocks: list,
    lines: ["Look"],
    words_at: "high",
    words_hold: "first",
    end_line: null,
    language: "en",
    people_agreed: false,
    ...over,
  });
  const cut = { is: "clip", file_id: CLIP, from: 0, to: 4, label: null };
  const still = (seconds, over = {}) => ({ is: "photo", file_id: PHOTO, seconds, label: null, ...over });
  const wont = (p, sources = [clip(), photo()]) => {
    const out = compilePiece(piecePlanOf(p), sources, look());
    return out.ok ? null : [out.wont, out.cut ?? null];
  };
  assert.equal(wont(blocks([cut, still(3), still(3)])), null, "a clip and two photos, ten seconds");
  assert.deepEqual(wont(blocks([cut])), ["blocks", null]);
  assert.deepEqual(wont(blocks([cut, still(9), still(3)])), ["block_length", 2]);
  assert.deepEqual(wont(blocks([cut, still(3, { file_id: CLIP }), still(3)])), ["not_photo", 2]);
  assert.deepEqual(wont(blocks([cut, { ...cut, file_id: PHOTO }, still(3)])), ["not_video", 2]);
  assert.deepEqual(wont(blocks([cut, still(3, { label: "x".repeat(23) }), still(3)])), ["label", 2]);
  assert.deepEqual(wont(blocks([cut, still(3), still(3)]), [clip(), photo({ source: "made" })]), ["made", 2]);
  assert.deepEqual(wont(blocks([cut, still(3), still(3)]), [clip(), photo({ status: "inbox" })]), ["unkept", 2]);
  assert.deepEqual(wont(blocks([cut, still(3), still(3)]), [clip(), photo({ people_unasked: true })]), ["people", 2]);
  const card = { is: "words", lines: ["Three steps"], seconds: 2 };
  assert.deepEqual(wont(blocks([card, cut, still(3)])), ["opens_on_card", 1]);
  assert.equal(
    wont(blocks([card, cut, still(3)], { lines: [] })),
    null,
    "a video may open on a card, with no opening words",
  );
  assert.deepEqual(wont(blocks([cut, { ...card, lines: ["a", "b", "c", "d"] }, still(3)])), ["card", 2]);
  assert.deepEqual(wont(blocks([cut, { ...card, lines: ["x".repeat(23)] }, still(3)])), ["card", 2]);
  assert.deepEqual(wont(blocks([cut, { ...card, seconds: 9 }, still(3)])), ["block_length", 2]);
  const quote = { is: "quote", text: "Best blowout in Brooklyn", from: "Google review", over: null, seconds: 3 };
  assert.equal(wont(blocks([cut, quote, still(3)])), null);
  assert.deepEqual(wont(blocks([cut, { ...quote, text: "x".repeat(141) }, still(3)])), ["quote", 2]);
  assert.deepEqual(wont(blocks([cut, { ...quote, from: "x".repeat(29) }, still(3)])), ["quote", 2]);
  const pair = (after) => ({ is: "pair", before: { file_id: PHOTO, at: null }, after, seconds: 3 });
  assert.equal(wont(blocks([cut, pair({ file_id: CLIP, at: 4.2 }), still(3)])), null, "a photo beside a clip's moment");
  assert.deepEqual(wont(blocks([cut, pair({ file_id: CLIP, at: 99 }), still(3)])), ["past_end", 2]);
  assert.deepEqual(wont(blocks([cut, pair({ file_id: CLIP, at: null }), still(3)])), ["not_photo", 2]);
  assert.deepEqual(wont(blocks([cut, still(1.5)])), ["length", null]);
});

test("a video of photos, cards and a pair compiles to what the template draws: frames, sizes, the pair's own labels", () => {
  const out = compilePiece(
    piecePlanOf({
      shape: "blocks",
      blocks: [
        { is: "photo", file_id: PHOTO, seconds: 2.5, label: "The chair" },
        { is: "pair", before: { file_id: PHOTO, at: null }, after: { file_id: CLIP, at: 4.2 }, seconds: 3 },
        { is: "words", lines: ["Three steps", "to bounce"], seconds: 2 },
        {
          is: "quote",
          text: "Best blowout in Brooklyn",
          from: "Google review",
          over: { file_id: PHOTO, at: null },
          seconds: 3,
        },
      ],
      lines: ["Same chair"],
      words_at: "low",
      words_hold: "first",
      end_line: null,
      language: "es",
      people_agreed: false,
    }),
    [clip(), photo()],
    look(),
  );
  assert.equal(out.ok, true, out.ok ? "" : out.wont);
  const [first, pair, card, quote] = out.timeline.blocks;
  assert.deepEqual(first, { is: "photo", source: PHOTO, frames: 75, label: "The chair" });
  assert.deepEqual(pair, {
    is: "pair",
    before: { source: PHOTO, at: null },
    after: { source: CLIP, at: 4.2 },
    frames: 90,
    labels: ["Antes", "Después"],
  });
  assert.deepEqual(card, {
    is: "words",
    lines: ["Three steps", "to bounce"],
    size: pieceCardSizeOf(["Three steps", "to bounce"]),
    frames: 60,
  });
  assert.equal(quote.is, "quote");
  assert.deepEqual(
    [quote.lines.join(" "), quote.from, quote.over, quote.frames],
    ["Best blowout in Brooklyn", "Google review", { source: PHOTO, at: null }, 90],
  );
  assert.equal(out.timeline.frames, 75 + 90 + 60 + 90 + PIECE_FRAME.end - PIECE_FRAME.fade);
  // The opening words leave with the first picture, after two seconds at least.
  assert.equal(out.timeline.words.frames, 75);
});

test("a words card is as large as its widest line allows, and a quote wraps by its words to seven lines at most", () => {
  assert.equal(pieceCardSizeOf(["Go"]), PIECE_CARD.sizeMax);
  const wide = pieceCardSizeOf(["x".repeat(PIECE_LIMITS.cardLine)]);
  assert.ok(
    wide < PIECE_CARD.sizeMax && pieceLineWidthOf("x".repeat(PIECE_LIMITS.cardLine), wide) <= PIECE_FRAME.wordsWidth,
  );
  const short = pieceQuoteLinesOf("Best blowout in Brooklyn");
  assert.equal(short.size, PIECE_CARD.quoteSizes[0]);
  assert.equal(short.lines.join(" "), "Best blowout in Brooklyn");
  assert.ok(short.lines.every((l) => pieceLineWidthOf(l, short.size) <= PIECE_FRAME.wordsWidth));
  const long = pieceQuoteLinesOf(
    "I drove three hours for this cut and I would do it again tomorrow, she listened to every word I said to her",
  );
  assert.ok(long && long.lines.length <= PIECE_CARD.quoteLinesMax, "it fits at some size");
  assert.ok(long.lines.every((l) => pieceLineWidthOf(l, long.size) <= PIECE_FRAME.wordsWidth));
  // Its lines come out near one length: wrapped to the frame alone this one ended on "had." by itself.
  const evened = pieceQuoteLinesOf("I walked out feeling like a whole new person. Best blowout I have ever had.");
  assert.deepEqual(
    [evened.size, evened.lines],
    [72, ["I walked out feeling", "like a whole new", "person. Best blowout", "I have ever had."]],
  );
  assert.ok(evened.lines.every((l) => pieceLineWidthOf(l, evened.size) <= PIECE_FRAME.wordsWidth));
  assert.equal(pieceQuoteLinesOf("x".repeat(400)), null, "one word wider than the frame fits at no size");
  assert.equal(pieceQuoteLinesOf("   "), null);
});

test("the opening words are drawn on a picture, never on a card: a card between two pictures is skipped", () => {
  const on = (blocks, frames) => pieceWordsOnBlocks({ blocks, words: { frames } });
  const pic = (frames) => ({ is: "photo", frames });
  assert.deepEqual(on([pic(60), { is: "words", frames: 60 }, pic(60)], null), [true, false, true]);
  assert.deepEqual(on([{ is: "pair", frames: 45 }, pic(60), pic(60)], 60), [true, true, false]);
});

test("a card says where its video stands from its row and its file, and nothing else", () => {
  const file = (over = {}) => ({ id: "f1", name: "i-asked-for-volume", look_status: "done", ...over });
  const read = (over = {}) => ({ status: "making", stage: "queued", failed_why: null, file: null, ...over });
  assert.deepEqual(pieceStandsOf(read()), { is: "making", stage: "queued" });
  assert.deepEqual(pieceStandsOf(read({ stage: "waiting_clip" })), { is: "making", stage: "waiting_clip" });
  // Its file on its way into the video platform is still the video being made.
  assert.deepEqual(pieceStandsOf(read({ stage: "saving", file: file({ look_status: "waiting" }) })), {
    is: "making",
    stage: "saving",
  });
  // Ready as soon as it can be played, the moment the bell rings (Ruben, 11 Nov 2026: "Ready when playable"): the look every
  // file gets comes after, as for any file, and holds nothing back.
  const waiting = file({ look_status: "waiting" });
  assert.deepEqual(pieceStandsOf(read({ status: "made", file: waiting })), { is: "ready", file: waiting });
  assert.deepEqual(pieceStandsOf(read({ status: "made", file: file() })), { is: "ready", file: file() });
  assert.equal(pieceStandsOf(read({ status: "made", file: file({ look_status: "failed" }) })).is, "ready");
  assert.deepEqual(pieceStandsOf(read({ status: "failed", failed_why: "draw" })), { is: "failed", why: "draw" });
  assert.deepEqual(pieceStandsOf(read({ status: "failed" })), { is: "failed", why: "unknown" });
  // Deleted from Files since: its row went with its file, or its file can no longer be read.
  assert.deepEqual(pieceStandsOf(null), { is: "gone" });
  assert.deepEqual(pieceStandsOf(read({ status: "made" })), { is: "gone" });
  // It is read again only while something is still moving.
  assert.deepEqual(
    ["making", "ready", "failed", "gone"].map((is) => pieceStillMoving({ is })),
    [true, false, false, false],
  );
});

test("a plan is kept in blocks, or as Hook first by a card made before: either reads as blocks", () => {
  assert.deepEqual([...PIECE_SHAPES], ["hook_cut", "blocks"]);
  const blocks = { shape: "blocks", blocks: [{ is: "words", lines: ["One"], seconds: 2 }], lines: [] };
  assert.equal(piecePlanOf(blocks).shape, "blocks");
  assert.equal(
    piecePlanOf({ shape: "hook_cut", cuts: [{ file_id: CLIP, from: 0, to: 2 }], lines: ["Hi"] }).shape,
    "blocks",
  );
});

test("a video is known by the words it opens on: its opening words, or its first card's", () => {
  const picture = { is: "clip", file_id: CLIP, from: 0, to: 2, label: null };
  const card = { is: "words", lines: ["New in town?", "Come see us"], seconds: 2 };
  const quote = { is: "quote", text: "Lovely place.", from: null, over: null, seconds: 3 };
  assert.deepEqual(pieceOpeningOf({ blocks: [picture, card], lines: ["I asked for volume"] }), ["I asked for volume"]);
  assert.deepEqual(pieceOpeningOf({ blocks: [card, picture], lines: [] }), ["New in town?", "Come see us"]);
  assert.deepEqual(pieceOpeningOf({ blocks: [quote, picture], lines: [] }), ["Lovely place."]);
  // A plan that says nothing where it opens is known by nothing: its checker refuses it (compilePiece: lines).
  assert.deepEqual(pieceOpeningOf({ blocks: [picture], lines: [] }), []);
});

test("a card says what its video is made from: moments of clips, parts where photos or cards are among them, or cards of words", () => {
  const moment = (id) => ({ is: "clip", file_id: id, from: 0, to: 2, label: null });
  const photo = (id) => ({ is: "photo", file_id: id, seconds: 2, label: null });
  const card = { is: "words", lines: ["One"], seconds: 2 };
  const pair = { is: "pair", before: { file_id: "p1", at: null }, after: { file_id: CLIP, at: 3 }, seconds: 3 };
  const said = (blocks, language = "en") => pieceWordsIn(language).summary(pieceCountOf({ blocks }), 10.4);
  assert.deepEqual(pieceCountOf({ blocks: [moment(CLIP), moment(CLIP), pair, card] }), {
    blocks: 4,
    moments: 2,
    clips: 1,
    photos: 1,
  });
  // As it read before a video had blocks.
  assert.equal(said([moment(CLIP), moment(CLIP), moment(CLIP)]), "10 seconds, vertical. 3 moments from your clip.");
  assert.equal(said([moment(CLIP), moment(OTHER)]), "10 seconds, vertical. 2 moments from 2 of your clips.");
  assert.equal(said([photo("p1"), photo("p2"), card]), "10 seconds, vertical. 3 parts from 2 of your photos.");
  assert.equal(said([photo("p1"), card]), "10 seconds, vertical. 2 parts from your photo.");
  assert.equal(said([moment(CLIP), card]), "10 seconds, vertical. 2 parts from your clip.");
  assert.equal(said([moment(CLIP), pair]), "10 seconds, vertical. 2 parts from your clips and photos.");
  assert.equal(said([card, card, card]), "10 seconds, vertical. 3 cards of words.");
  assert.equal(said([photo("p1"), photo("p2")], "es"), "10 segundos, en vertical. 2 partes de 2 de tus fotos.");
  assert.equal(said([card, card], "es"), "10 segundos, en vertical. 2 tarjetas de texto.");
});

test("a quote says where it was said, in the video's language, and never who said it", () => {
  for (const language of ["en", "es"]) {
    const says = pieceWordsIn(language).quoteFrom;
    assert.deepEqual(Object.keys(says), ["google_review", "client"]);
    for (const words of Object.values(says)) {
      assert.ok(words.length > 0 && Array.from(words).length <= PIECE_LIMITS.quoteFrom, `${language}: ${words}`);
    }
  }
});
