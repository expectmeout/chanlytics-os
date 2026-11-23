/**
 * Pass 4 (the content loop PRD's 10.4, 11): a made video wears the business's brand kit (the owner's words for the look win
 * part by part, AI's proposal from the website stands in for the rest), and what its clips' people say is burned in as
 * short lines timed to the words, in the kit's face, clear of what a phone app draws at the foot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const { brandKitOf, lookSaidOf, neverSaidIn, siteKitOf } = await import(
  at("packages/contracts/src/content/making/kit.ts")
);
const { stretchCaptionsOf, pieceCaptionBottomOf } = await import(
  at("packages/contracts/src/content/making/captions.ts")
);
const { PLACE_SAFE_AREAS, unsafeBoxOf, wordBoxesOf } = await import(
  at("packages/contracts/src/content/making/safe-areas.ts")
);
const { compilePiece } = await import(at("packages/contracts/src/content/piece-timeline.ts"));
const { piecePlanOf } = await import(at("packages/contracts/src/content/pieces.ts"));
const { pieceLookOf } = await import(at("packages/contracts/src/content/piece-making.ts"));
const { PIECE_FRAME, pieceLineWidthOf, pieceWordsBoxOf } = await import(
  at("packages/contracts/src/content/piece-frame.ts")
);
const { ContentConfigSchema } = await import(at("packages/contracts/src/config/content-config.ts"));

const CLIP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PHOTO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const CUES = [
  { start: 0.4, end: 2.2, text: "So today we're doing a full balayage." },
  { start: 2.6, end: 5.9, text: "We start with the back sections, nice and thin, so it blends." },
];
const clip = (over = {}) => ({
  id: CLIP,
  kind: "video",
  status: "filed",
  source: "upload",
  media_status: "ready",
  seconds: 12,
  cues: CUES,
  ...over,
});
const photo = {
  id: PHOTO,
  kind: "image",
  status: "filed",
  source: "upload",
  media_status: null,
  seconds: null,
  cues: null,
};
const look = (over = {}) => ({
  accent: "#336699",
  logo: true,
  name: "Harbor Studio",
  book: "Book · (646) 555-0175",
  address: "12 Example St, Springfield",
  face: "sans",
  second: null,
  call: null,
  ...over,
});
const plan = (over = {}) => ({
  shape: "blocks",
  blocks: [
    { is: "clip", file_id: CLIP, from: 0, to: 3.5, label: null },
    { is: "clip", file_id: CLIP, from: 3.5, to: 6.5, label: "Back sections" },
    { is: "photo", file_id: PHOTO, seconds: 2.5, label: null },
  ],
  lines: ["Full balayage", "start to finish"],
  words_at: "high",
  words_hold: "first",
  end_line: "Book your colour",
  language: "en",
  ...over,
});
const timelineOf = (p = plan(), sources = [clip(), photo], l = look()) => {
  const out = compilePiece(piecePlanOf(p), sources, l);
  assert.equal(out.ok, true, out.ok ? "" : `refused: ${out.wont}`);
  return out.timeline;
};

/* -------------------------------------------------------------------------------------------------------- the kit -- */

test("the kit: the owner's words win part by part, the website's proposal fills the rest, the house's face the last", () => {
  const proposed = {
    words: "Bright and friendly.",
    second: "#F4E9DC",
    face: "serif",
    call: "Book online",
    never: ["cheap"],
  };
  const kit = brandKitOf({ face: "sans", music: "calm acoustic" }, "Warm and close.", proposed);
  assert.deepEqual(kit, {
    words: "Warm and close.",
    second: "#f4e9dc",
    face: "sans",
    call: "Book online",
    voice: null,
    music: "calm acoustic",
    never: ["cheap"],
  });
  assert.deepEqual(brandKitOf(undefined, null, undefined), {
    words: null,
    second: null,
    face: "sans",
    call: null,
    voice: null,
    music: null,
    never: [],
  });
  // A part that does not read is left out, and the rest still stand.
  assert.equal(brandKitOf({ second: "coral", face: "comic" }, null, { second: "#112233" }).second, "#112233");
});

test("on day one AI proposes the look from the website: the feel, call and music it read, the site's second colour and type", () => {
  const answer = { services: [], look: { words: "Warm and close", call: "Book your visit", music: "calm acoustic" } };
  assert.deepEqual(siteKitOf(answer, { second: "rgb(244, 233, 220)", font: "Playfair Display" }), {
    words: "Warm and close",
    call: "Book your visit",
    music: "calm acoustic",
    second: "#f4e9dc",
    face: "serif",
  });
  assert.equal(siteKitOf(answer, { font: "DM Sans" }).face, "sans");
  assert.equal(siteKitOf(answer, { font: "Noto Serif" }).face, "serif");
  // A read before the kit, or one that saw nothing of it, proposes nothing: the house's own stands.
  assert.equal(siteKitOf({ services: [] }, null), null);
  assert.equal(siteKitOf({ look: { words: null, call: null, music: null } }, { second: "not a colour" }), null);
  // What it proposed stands in for what the owner did not say.
  const kit = brandKitOf({ face: "sans" }, null, siteKitOf(answer, { second: "#f4e9dc", font: "Lora" }));
  assert.deepEqual(
    [kit.words, kit.face, kit.second, kit.call],
    ["Warm and close", "sans", "#f4e9dc", "Book your visit"],
  );
});

test("the look's line says the owner's sentence, else what is set", () => {
  const kit = brandKitOf(undefined, null, undefined);
  assert.equal(
    lookSaidOf(kit, { logo: true, accent: true }),
    "Your logo on the last frame, your colour, set in a clean, bold type.",
  );
  assert.equal(lookSaidOf({ ...kit, face: "serif" }, { logo: false, accent: false }), "Set in a classic serif.");
  assert.equal(lookSaidOf({ ...kit, words: "Warm and close." }, { logo: true, accent: true }), "Warm and close.");
});

test("the config keeps the kit and the owner's sentence for the look, and a part that does not read is dropped alone", () => {
  const read = ContentConfigSchema.parse({
    look: {
      second: "#ABCDEF",
      face: "serif",
      call: "Message us",
      never: ["cheap", "best in town"],
      music: "x".repeat(500),
    },
    lines: { look: "Warm and close." },
  });
  const { second, face, call, never, music } = read.look;
  assert.deepEqual(
    { second, face, call, never },
    { second: "#abcdef", face: "serif", call: "Message us", never: ["cheap", "best in town"] },
  );
  assert.equal(music, undefined, "a part too long is left out");
  assert.equal(read.lines.look, "Warm and close.");
});

test("words AI never writes are found whole, ignoring case; a longer word is not one of them", () => {
  const kit = { never: ["cheap", "best in town"] };
  assert.equal(neverSaidIn("Cheap cuts, every day", kit), "cheap");
  assert.equal(neverSaidIn("The BEST in town, really", kit), "best in town");
  assert.equal(neverSaidIn("Cheaper than you think", kit), null);
  assert.equal(neverSaidIn("Anything", { never: [] }), null);
});

test("the look kept at the press carries the kit; one kept before the kit reads as the house's", () => {
  assert.deepEqual(pieceLookOf({ name: "Harbor", face: "serif", second: "#AABBCC", call: "Book online" }), {
    accent: null,
    logo_path: null,
    name: "Harbor",
    book: null,
    address: null,
    face: "serif",
    second: "#aabbcc",
    call: "Book online",
  });
  const before = pieceLookOf({ name: "Harbor", accent: "#336699" });
  assert.deepEqual([before.face, before.second, before.call], ["sans", null, null]);
});

test("a video is drawn in the kit: its face measures the words, its second colour and its call reach the template", () => {
  const sans = timelineOf();
  const serif = timelineOf(plan(), [clip(), photo], look({ face: "serif", second: "#2f4a3a", call: "Book online" }));
  assert.equal(serif.face, "serif");
  assert.equal(serif.ground, "#2f4a3a", "a dark second colour is the cards' ground");
  // A light one would not hold white words: the cards keep the ink.
  assert.equal(timelineOf(plan(), [clip(), photo], look({ second: "#f4e9dc" })).ground, PIECE_FRAME.ink);
  assert.equal(sans.ground, PIECE_FRAME.ink);
  assert.equal(serif.end.call, "Book online");
  assert.equal(sans.end.call, null);
  // The opening words are fitted in the face they are drawn in.
  assert.equal(sans.words.size, pieceWordsBoxOf(plan().lines, "high", "sans").size);
  assert.equal(serif.words.size, pieceWordsBoxOf(plan().lines, "high", "serif").size);
});

/* --------------------------------------------------------------------------------------------- the spoken words -- */

test("a stretch's spoken words become short timed lines, each inside the words' width, two lines at most", () => {
  const caps = stretchCaptionsOf(CUES, { from: 0, seconds: 6, firstFrame: 0, labelled: false }, "sans");
  assert.ok(caps.length >= 3, `${caps.length} captions`);
  for (const c of caps) {
    assert.ok(c.lines.length >= 1 && c.lines.length <= PIECE_FRAME.captionLines, c.lines.join(" / "));
    for (const line of c.lines)
      assert.ok(pieceLineWidthOf(line, PIECE_FRAME.captionSize, "sans") <= PIECE_FRAME.wordsWidth);
    assert.ok(c.frames >= 1);
  }
  // In order, never on one another, and every word said is there once.
  for (let i = 1; i < caps.length; i++) assert.ok(caps[i].from >= caps[i - 1].from + caps[i - 1].frames);
  const said = caps.flatMap((c) => c.lines.join(" ").split(" "));
  assert.deepEqual(
    said,
    CUES.flatMap((c) => c.text.split(" ")),
  );
  // A sentence ends its caption: the first ends on "balayage.".
  assert.ok(caps[0].lines.join(" ").endsWith("balayage."));
  // The first comes when the words start (0.4 s in), not before.
  assert.equal(caps[0].from, Math.round(0.4 * PIECE_FRAME.fps));
});

test("a caption of two lines is broken where the two come out nearest one width, never one word under a full line", () => {
  const [cap] = stretchCaptionsOf(
    [{ start: 0, end: 1.6, text: "Any tighter and you crack the fitting." }],
    { from: 0, seconds: 2, firstFrame: 0, labelled: false },
    "sans",
  );
  assert.equal(cap.lines.length, 2);
  const [a, b] = cap.lines.map((l) => pieceLineWidthOf(l, PIECE_FRAME.captionSize, "sans"));
  assert.ok(Math.abs(a - b) < Math.max(a, b) / 2, cap.lines.join(" / "));
  assert.ok(cap.lines.every((l) => l.split(" ").length > 1));
});

test("only what is said inside the stretch is burned in, timed from the block's first frame", () => {
  const caps = stretchCaptionsOf(CUES, { from: 2.5, seconds: 3, firstFrame: 100, labelled: false }, "sans");
  const said = caps.flatMap((c) => c.lines.join(" ").split(" "));
  assert.equal(said[0], "We");
  assert.ok(!said.includes("balayage."));
  assert.ok(caps[0].from >= 100);
  const last = caps.at(-1);
  assert.ok(last.from + last.frames <= 100 + 3 * PIECE_FRAME.fps);
});

test("words the face can't draw are left out, never drawn in no face", () => {
  const caps = stretchCaptionsOf(
    [{ start: 0, end: 2, text: "今日はバレイヤージュ" }],
    { from: 0, seconds: 3, firstFrame: 0, labelled: false },
    "sans",
  );
  assert.deepEqual(caps, []);
});

test("a caption stands above what a phone draws at the foot, and above a block's own caption where it has one", () => {
  assert.equal(pieceCaptionBottomOf(false), PIECE_FRAME.clearBottom + PIECE_FRAME.captionLift);
  assert.ok(pieceCaptionBottomOf(true) > pieceCaptionBottomOf(false) + PIECE_FRAME.labelSize);
  const t = timelineOf();
  const second = t.captions.filter((c) => c.from >= t.blocks[0].frames);
  assert.ok(second.length > 0);
  assert.ok(
    second.every((c) => c.bottom === pieceCaptionBottomOf(true)),
    "the labelled block's captions sit above its label",
  );
});

test("the timeline burns in each clip block's words, none over a photo, and none when the owner turned them off", () => {
  const t = timelineOf();
  assert.ok(t.captions.length > 0);
  const reel = t.blocks[0].frames + t.blocks[1].frames;
  assert.ok(
    t.captions.every((c) => c.from + c.frames <= reel),
    "no caption over the photo",
  );
  assert.deepEqual(timelineOf(plan({ captions: false })).captions, []);
  // A clip nobody speaks in has none.
  assert.deepEqual(timelineOf(plan(), [clip({ cues: null }), photo]).captions, []);
});

test("opening words set low and the spoken words never sit on one another: a caption waits for them to leave", () => {
  const low = timelineOf(plan({ words_at: "low" }));
  assert.ok(low.captions.every((c) => c.from >= low.words.frames));
  assert.deepEqual(timelineOf(plan({ words_at: "low", words_hold: "all" })).captions, []);
});

test("every word box stays clear of what Instagram draws over a reel and a story", () => {
  for (const p of [plan(), plan({ words_at: "low" })]) {
    const boxes = wordBoxesOf(timelineOf(p));
    assert.ok(boxes.some((b) => b.is === "caption"));
    assert.equal(unsafeBoxOf(boxes, PLACE_SAFE_AREAS.instagram.reel), null);
    assert.equal(unsafeBoxOf(boxes, PLACE_SAFE_AREAS.instagram.story), null);
  }
  // A place that drew higher at the foot would catch the captions.
  const caught = unsafeBoxOf(wordBoxesOf(timelineOf()), { top: 220, bottom: 700 });
  assert.ok(caught);
});
