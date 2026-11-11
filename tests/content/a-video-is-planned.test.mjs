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

const { PIECE_LIMITS, piecePlanOf } = await import(at("packages/contracts/src/content/pieces.ts"));
const { pieceWordsOnCuts } = await import(at("packages/contracts/src/content/piece-timeline.ts"));
const { pieceStandsOf, pieceStillMoving } = await import(at("packages/contracts/src/content/piece-card.ts"));
const { PIECE_WORDS, pieceWordsIn } = await import(at("packages/contracts/src/content/piece-words.ts"));
const { compilePiece } = await import(at("packages/contracts/src/content/piece-timeline.ts"));
const { PIECE_FRAME, pieceLineWidthOf, pieceWordsBoxOf } = await import(
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
const compiled = (p = plan(), sources = [clip()], l = look()) => compilePiece(p, sources, l);
const timelineOf = (p, sources, l) => {
  const out = compiled(p, sources, l);
  assert.equal(out.ok, true, out.ok ? "" : `refused: ${out.wont}`);
  return out.timeline;
};

test("a good plan becomes a timeline: each cut's place in its clip and its frames, then the end card", () => {
  const t = timelineOf();
  assert.deepEqual(
    t.cuts.map((c) => [c.source, c.trim, c.frames]),
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
  assert.equal(t.cuts[3].frames, Math.round((11.69 - 9.8) * 30), "trimmed to the clip's 11.69 s");
  const far = plan({ cuts: [...plan().cuts.slice(0, 3), { file_id: CLIP, from: 9.8, to: 12.5 }] });
  assert.deepEqual(compiled(far), { ok: false, wont: "past_end", cut: 4 });
});

test("a cut trimmed at its clip's end must still be long enough to see", () => {
  const stub = plan({ cuts: [...plan().cuts.slice(0, 3), { file_id: CLIP, from: 10.4, to: 11.9 }] });
  assert.deepEqual(compiled(stub), { ok: false, wont: "cut_length", cut: 4 });
});

test("the shape's limits hold: how many cuts, how long each is, how long they are together", () => {
  const cut = (from, to) => ({ file_id: CLIP, from, to });
  assert.deepEqual(compiled(plan({ cuts: [cut(0, 4)] })), { ok: false, wont: "cuts" });
  assert.deepEqual(compiled(plan({ cuts: [0, 1, 2, 3, 4, 5].map((n) => cut(n, n + 1.5)) })), {
    ok: false,
    wont: "cuts",
  });
  assert.deepEqual(compiled(plan({ cuts: [cut(0, 4), cut(4, 8), cut(8, 9)] })), {
    ok: false,
    wont: "cut_length",
    cut: 3,
  });
  assert.deepEqual(compiled(plan({ cuts: [cut(0, 4.5), cut(5, 9)] })), { ok: false, wont: "cut_length", cut: 1 });
  assert.deepEqual(compiled(plan({ cuts: [cut(0, 2), cut(2, 4), cut(4, 6)] })), { ok: false, wont: "length" });
  assert.deepEqual(compiled(plan({ cuts: [cut(5, 3), cut(0, 4), cut(4, 8)] })), { ok: false, wont: "stretch", cut: 1 });
  assert.equal(PIECE_LIMITS.cutsMin, 2);
  assert.equal(PIECE_LIMITS.cutsMax, 5);
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
    t.cuts.map((c) => c.source),
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
  assert.deepEqual(read, plan());
  assert.deepEqual(piecePlanOf({}), {
    shape: "hook_cut",
    cuts: [],
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
    "cuts",
    "file",
    "not_video",
    "made",
    "unkept",
    "not_ready",
    "stretch",
    "past_end",
    "cut_length",
    "length",
    "people",
    "lines",
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

test("the stills wear the words wherever the video will: a first moment under two seconds leaves them on the second", () => {
  const at = (cuts, frames) => pieceWordsOnCuts({ cuts: cuts.map((f) => ({ frames: f })), words: { frames } });
  // Words that stay are on every moment.
  assert.deepEqual(at([75, 60, 60, 63], null), [true, true, true, true]);
  // Words that leave with a first moment of two seconds or more are on it alone.
  assert.deepEqual(at([75, 60, 60], 75), [true, false, false]);
  assert.deepEqual(at([60, 60, 60], 60), [true, false, false]);
  // A first moment of a second and a half: the words stay their two seconds, so the second moment opens under them.
  assert.deepEqual(at([45, 60, 60], 60), [true, true, false]);
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
  // Made, and the look every file gets is still reading it: Ask watches it before the owner does.
  const waiting = file({ look_status: "waiting" });
  assert.deepEqual(pieceStandsOf(read({ status: "made", file: waiting })), { is: "checking", file: waiting });
  assert.deepEqual(pieceStandsOf(read({ status: "made", file: file() })), { is: "ready", file: file() });
  // A look that could not be finished holds nothing back: the video is there to open.
  assert.equal(pieceStandsOf(read({ status: "made", file: file({ look_status: "failed" }) })).is, "ready");
  assert.deepEqual(pieceStandsOf(read({ status: "failed", failed_why: "draw" })), { is: "failed", why: "draw" });
  assert.deepEqual(pieceStandsOf(read({ status: "failed" })), { is: "failed", why: "unknown" });
  // Deleted from Files since: its row went with its file, or its file can no longer be read.
  assert.deepEqual(pieceStandsOf(null), { is: "gone" });
  assert.deepEqual(pieceStandsOf(read({ status: "made" })), { is: "gone" });
  // It is read again only while something is still moving.
  assert.deepEqual(
    ["making", "checking", "ready", "failed", "gone"].map((is) => pieceStillMoving({ is })),
    [true, true, false, false, false],
  );
});
