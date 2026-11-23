/**
 * Pass 4 (the content loop PRD's 5.3, 8.1, 11): each placement's rendition is checked against what its place takes (the
 * places' own pages: Meta's IG User Media reference, Google's photo guidelines), a cover is the best moment of the clips a
 * video shows, and a version draws only the shapes its change reaches.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const { HOUSE_LOUDNESS, renditionRefusalOf } = await import(at("packages/contracts/src/content/making/renditions.ts"));
const { pieceCoverOf } = await import(at("apps/edge/lib/files/piece-cover.ts"));
const { revisionChangesOf, shapesReachedOf } = await import(at("packages/contracts/src/content/making/versions.ts"));
const { piecePlanOf } = await import(at("packages/contracts/src/content/pieces.ts"));

const MB = 1024 * 1024;
/** A made video as the machine draws one: 1080x1920 H.264 at 30 a second, 12 seconds, no sound. */
const video = (over = {}) => ({
  media: "video",
  format: "mp4",
  bytes: 9 * MB,
  width: 1080,
  height: 1920,
  seconds: 12,
  fps: 30,
  codec: "h264",
  sound: null,
  lufs: null,
  ...over,
});
/** A made post's portrait: a 1080x1350 JPEG. */
const picture = (over = {}) => ({
  media: "picture",
  format: "jpeg",
  bytes: 400 * 1024,
  width: 1080,
  height: 1350,
  seconds: null,
  fps: null,
  codec: null,
  sound: null,
  lufs: null,
  ...over,
});

/* -------------------------------------------------------------------------------------------------- renditions -- */

test("what the machine makes fits a reel and a story, and a made picture fits a post and Google", () => {
  assert.equal(renditionRefusalOf("instagram", "reel", video()), null);
  assert.equal(renditionRefusalOf("instagram", "story", video()), null);
  assert.equal(renditionRefusalOf("instagram", "picture", picture()), null);
  assert.equal(renditionRefusalOf("instagram", "story", picture({ height: 1920 })), null);
  assert.equal(renditionRefusalOf("google", "picture", picture({ width: 1200, height: 900 })), null);
});

test("a reel too short, a story too long, each said with what the place takes and what this one is", () => {
  assert.deepEqual(renditionRefusalOf("instagram", "reel", video({ seconds: 2 })), {
    why: "length",
    words: "Instagram's reel takes 3 seconds to 15 minutes. This one is 2 seconds.",
  });
  assert.deepEqual(renditionRefusalOf("instagram", "story", video({ seconds: 75 })), {
    why: "length",
    words: "Instagram's story takes 3 seconds to 1 minute. This one is 1 minute 15 seconds.",
  });
});

test("the format, the size, the codec, the frame rate and the sound are each a place's own", () => {
  assert.equal(renditionRefusalOf("instagram", "picture", picture({ format: "png" })).why, "format");
  assert.equal(renditionRefusalOf("google", "picture", picture({ format: "png" })), null, "Google takes a PNG");
  assert.equal(renditionRefusalOf("instagram", "picture", picture({ bytes: 9 * MB })).why, "size");
  assert.equal(renditionRefusalOf("google", "picture", picture({ bytes: 4 * 1024 })).why, "size");
  assert.equal(renditionRefusalOf("google", "picture", picture({ width: 200, height: 200 })).why, "small");
  assert.equal(renditionRefusalOf("instagram", "picture", picture({ width: 1080, height: 1920 })).why, "shape");
  assert.equal(renditionRefusalOf("instagram", "reel", video({ codec: "other" })).why, "codec");
  assert.equal(renditionRefusalOf("instagram", "reel", video({ fps: 15 })).why, "frame_rate");
  const sound = { codec: "aac", rate: 96_000, channels: 2 };
  assert.equal(renditionRefusalOf("instagram", "reel", video({ sound })).why, "sound");
  assert.equal(renditionRefusalOf("instagram", "reel", video({ sound: { ...sound, rate: 48_000 } })), null);
});

test("a video's sound is held to the house's loudness only where it was measured: a missing number refuses nothing", () => {
  const sound = { codec: "aac", rate: 48_000, channels: 2 };
  assert.equal(renditionRefusalOf("instagram", "reel", video({ sound, lufs: HOUSE_LOUDNESS.target })), null);
  assert.equal(renditionRefusalOf("instagram", "reel", video({ sound, lufs: -24 })).why, "loudness");
  assert.equal(renditionRefusalOf("instagram", "reel", video({ sound, lufs: null })), null);
});

test("a Page's reel is a standing video of 3 to 90 seconds; its photo a JPEG or PNG up to 10 MB", () => {
  assert.equal(renditionRefusalOf("facebook", "reel", video()), null);
  assert.equal(renditionRefusalOf("facebook", "picture", picture()), null);
  assert.equal(renditionRefusalOf("facebook", "story", picture({ format: "png", height: 1920 })), null);
  assert.deepEqual(renditionRefusalOf("facebook", "reel", video({ seconds: 95 })), {
    why: "length",
    words: "Facebook's reel takes 3 seconds to 1 minute 30 seconds. This one is 1 minute 35 seconds.",
  });
  assert.equal(renditionRefusalOf("facebook", "reel", video({ width: 1080, height: 1350 })).why, "shape");
  assert.equal(renditionRefusalOf("facebook", "story", video()).why, "medium", "no story of a video goes to a Page");
});

test("a kind a place does not take in a medium is said: Google takes no video, and nothing takes a picture as a reel", () => {
  assert.equal(renditionRefusalOf("google", "picture", video()).why, "medium");
  assert.equal(renditionRefusalOf("instagram", "reel", picture()).why, "medium");
});

/* ------------------------------------------------------------------------------------------------------- covers -- */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
/** A timeline's blocks: A from 2 s for 3 s (frames 0-89), a words card (90-149), B from 10 s for 3 s (150-239). */
const BLOCKS = [
  { is: "clip", source: A, trim: 2, frames: 90 },
  { is: "words", frames: 60 },
  { is: "clip", source: B, trim: 10, frames: 90 },
];

test("the cover is the best moment inside a block, at its second of the video", () => {
  const moments = new Map([
    [A, [{ at: 3, score: 0.4 }]],
    [B, [{ at: 11.5, score: 0.9 }]],
  ]);
  // B's moment is 1.5 s into its block, which starts at 5 s of the video.
  assert.deepEqual(pieceCoverOf({ blocks: BLOCKS, captions: [] }, moments), { at: 6.5, from: "moment" });
});

test("a moment outside the stretch a block shows, or caught at a cut, is passed over; a look's order stands in for a score", () => {
  const moments = new Map([
    // Best first, as the look names them: 20 s is not shown; 2.1 s is at the cut; 4 s is 2 s into A's block.
    [
      A,
      [
        { at: 20, score: null },
        { at: 2.1, score: null },
        { at: 4, score: null },
      ],
    ],
  ]);
  assert.deepEqual(pieceCoverOf({ blocks: BLOCKS, captions: [] }, moments), { at: 2, from: "moment" });
});

test("a cover never stands on a spoken caption: it moves to the nearest clear frame of its own stretch", () => {
  const moments = new Map([[B, [{ at: 11.5, score: 0.9 }]]]);
  // A caption on from 6 s to 7 s (frames 180-209) covers the moment at 6.5 s.
  const cover = pieceCoverOf({ blocks: BLOCKS, captions: [{ from: 180, frames: 30 }] }, moments);
  assert.equal(cover.from, "moment");
  // The caption ends at 7 s, half a second on; it began a little further back. The stretch runs 5.3 to 7.7 s.
  assert.equal(cover.at, 7);
  // Where the whole stretch is spoken over, the moment stands.
  const covered = pieceCoverOf({ blocks: BLOCKS, captions: [{ from: 150, frames: 90 }] }, moments);
  assert.equal(covered.at, 6.5);
});

test("with no moment inside, the first picture's middle stands in", () => {
  assert.deepEqual(pieceCoverOf({ blocks: BLOCKS, captions: [] }, new Map()), { at: 1.5, from: "first" });
});

/* ----------------------------------------------------------------------------------------------------- versions -- */

const base = {
  shape: "blocks",
  blocks: [
    { is: "clip", file_id: A, from: 2, to: 5, label: null },
    { is: "clip", file_id: B, from: 10, to: 13, label: "After" },
  ],
  lines: ["Before", "and after"],
  words_at: "high",
  words_hold: "first",
  end_line: "Book now",
  language: "en",
  caption: "Fresh colour for spring.",
};
const planOf = (over = {}) => piecePlanOf({ ...base, ...over });

test("a caption is a version that draws nothing; a trim, the order or the words on it draw every shape it sends", () => {
  assert.deepEqual(revisionChangesOf(planOf(), planOf()), []);
  const caption = revisionChangesOf(planOf(), planOf({ caption: "New words." }));
  assert.deepEqual(caption, ["caption"]);
  assert.deepEqual(shapesReachedOf(caption, ["9x16"]), []);
  const trim = revisionChangesOf(planOf(), planOf({ blocks: [{ ...base.blocks[0], from: 2.5 }, base.blocks[1]] }));
  assert.deepEqual(trim, ["trim"]);
  assert.deepEqual(shapesReachedOf(trim, ["9x16", "9x16"]), ["9x16"]);
  assert.deepEqual(revisionChangesOf(planOf(), planOf({ blocks: [base.blocks[1], base.blocks[0]] })), ["order"]);
  assert.deepEqual(revisionChangesOf(planOf(), planOf({ lines: ["Before and after"] })), ["layout"]);
  assert.deepEqual(revisionChangesOf(planOf(), planOf({ captions: false })), ["layout"]);
  assert.deepEqual(
    revisionChangesOf(
      planOf(),
      planOf({ caption: "x", blocks: [{ ...base.blocks[0], label: "Before" }, base.blocks[1]] }),
    ),
    ["caption", "layout"],
  );
});

test("a picture's shapes are all drawn again when what is on it moves, and none for its words under it", () => {
  assert.deepEqual(shapesReachedOf(["layout"], ["4x5", "1x1", "9x16", "google"]), ["4x5", "1x1", "9x16", "google"]);
  assert.deepEqual(shapesReachedOf(["caption"], ["4x5", "google"]), []);
});
