/**
 * A video shown to a model and heard for it (decision 0099, stage B), by the rules contracts keeps: the sheet's frames and grid,
 * a stretch's, the moments as a person and a model say them, what an ear or a transcriber answered read in code, the words a
 * sheet carries after it in each state of its sound, the captions, the list's line, the look's poster, the post's refusal, and
 * what hearing costs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const video = await import(at("packages/contracts/src/files/video.ts"));
const sound = await import(at("packages/contracts/src/files/sound.ts"));
const files = await import(at("packages/contracts/src/files/index.ts"));
const line = await import(at("apps/dashboard/src/server/files/line.ts"));
const look = await import(at("packages/contracts/src/files/look.ts"));
const post = await import(at("packages/contracts/src/files/post.ts"));
const postCheck = await import(at("apps/dashboard/src/server/files/post-check.ts"));
const hearing = await import(at("packages/contracts/src/ai/hearing.ts"));
const usage = await import(at("packages/contracts/src/ai/usage.ts"));
const zoom = await import(at("packages/contracts/src/files/zoom.ts"));

test("a short clip's sheet is a frame every half second, each in the middle of its stretch", () => {
  const plan = video.videoSheetPlanOf({ seconds: 3, width: 1920, height: 1080 });
  assert.equal(plan.times.length, 6);
  assert.equal(plan.step, 0.5);
  assert.deepEqual(plan.times, [0.25, 0.75, 1.25, 1.75, 2.25, 2.75]);
  const at24 = video.videoSheetPlanOf({ seconds: 24, width: 1920, height: 1080 });
  assert.equal(at24.times.length, 48, "24 seconds is the most a half-second step covers");
  assert.equal(at24.step, 0.5);
});

test("a long clip's sheet is 48 frames spaced evenly, none past its end", () => {
  const plan = video.videoSheetPlanOf({ seconds: 600, width: 1920, height: 1080 });
  assert.equal(plan.times.length, video.VIDEO_SHEET_FRAMES);
  assert.equal(plan.step, 12.5);
  assert.equal(plan.times[0], 6.25);
  assert.ok((plan.times.at(-1) ?? 0) < 600);
});

test("the grid draws each frame largest inside the sheet's long side and its pixels, for a wide clip and a tall one", () => {
  for (const [w, h] of [
    [1920, 1080],
    [1080, 1920],
    [null, null],
  ]) {
    const plan = video.videoSheetPlanOf({ seconds: 600, width: w, height: h });
    assert.ok(plan.cols * plan.rows >= plan.times.length, "every frame has a tile");
    assert.ok(Math.max(plan.width, plan.height) <= video.VIDEO_SHEET_SIDE, `${w}x${h}: within the long side`);
    assert.ok(plan.width * plan.height <= video.VIDEO_SHEET_PIXELS, `${w}x${h}: within the pixels`);
    assert.equal(plan.width, plan.cols * plan.tileW);
    assert.equal(plan.height, plan.rows * plan.tileH);
  }
  const tall = video.videoSheetPlanOf({ seconds: 600, width: 1080, height: 1920 });
  assert.ok(tall.tileH > tall.tileW, "a phone's tall clip draws tall tiles");
  assert.ok(tall.cols > tall.rows, "laid across, so the sheet is not a tower");
});

test("a stretch is up to 24 frames, never closer than a quarter second, and a narrow one is widened to a second", () => {
  const wide = video.videoSpanPlanOf({ seconds: 600, width: 1920, height: 1080, from: 60, to: 90 });
  assert.equal(wide.times.length, video.VIDEO_SPAN_FRAMES);
  assert.equal(wide.from, 60);
  assert.equal(wide.to, 90);
  assert.equal(wide.step, 1.25);
  const narrow = video.videoSpanPlanOf({ seconds: 600, width: 1920, height: 1080, from: 12.4, to: 12.5 });
  assert.equal(narrow.to - narrow.from, 1);
  assert.equal(narrow.times.length, 4);
  const backwards = video.videoSpanPlanOf({ seconds: 20, from: 15, to: 5 });
  assert.equal(backwards.from, 5, "ends in either order");
  const past = video.videoSpanPlanOf({ seconds: 20, from: 19.9, to: 40 });
  assert.ok(past.to <= 20 && past.from >= 0, "held inside the clip");
});

test("a moment as a person says it and as a model names it", () => {
  assert.equal(video.clockOf(24), "0:24");
  assert.equal(video.clockOf(65), "1:05");
  assert.equal(video.clockOf(600), "10:00");
  assert.equal(video.clockOf(12.5, true), "0:12.5");
  assert.equal(video.clockOf(12, true), "0:12");
  assert.equal(video.secondsOf("1:05"), 65);
  assert.equal(video.secondsOf("0:12.5"), 12.5);
  assert.equal(video.secondsOf(" 30 "), 30);
  assert.equal(video.secondsOf(7), 7);
  for (const bad of ["1:65", "a minute", -1, "", null, Number.NaN])
    assert.equal(video.secondsOf(bad), null, String(bad));
});

test("a frame's own size where Stream said it, its long side 2,576 at most, and a landscape guess where it did not", () => {
  assert.deepEqual(video.videoFrameSizeOf(3840, 2160), [2000, 1126]);
  assert.deepEqual(video.videoFrameSizeOf(1284, 2282), [1126, 2000], "a phone's tall clip, its sides even");
  assert.equal(video.VIDEO_FRAME_SIDE, 2000, "the largest frame the video platform gives");
  assert.deepEqual(video.videoFrameSizeOf(720, 1280), [720, 1280]);
  assert.deepEqual(video.videoFrameSizeOf(-1, -1), [1920, 1080]);
});

test("the digest's steps go in order, the look last", () => {
  assert.deepEqual([...video.VIDEO_DIGEST_STEPS], ["sheet", "audio", "words", "note", "look"]);
  assert.equal(video.nextDigestStepOf("sheet"), "audio");
  assert.equal(video.nextDigestStepOf("look"), null);
  assert.ok(video.isDigestStep("words") && !video.isDigestStep("frames"));
});

test("the switch is the workspace's features.video_preview, and only a true turns it on", () => {
  assert.equal(video.videoPreviewOf({ features: { video_preview: true } }), true);
  for (const off of [{ features: { video_preview: "true" } }, { features: {} }, {}, null, "x"])
    assert.equal(video.videoPreviewOf(off), false, JSON.stringify(off));
});

/* --------------------------------------------------------------------------------------------- what was heard -- */

const SCRIBE = {
  language_code: "spa",
  words: [
    { text: "Hola", start: 0.2, end: 0.5, type: "word", speaker_id: "speaker_a" },
    { text: " ", start: 0.5, end: 0.55, type: "spacing", speaker_id: "speaker_a" },
    { text: "bienvenidos", start: 0.55, end: 1.1, type: "word", speaker_id: "speaker_a" },
    { text: "(laughter)", start: 1.2, end: 1.6, type: "audio_event" },
    { text: "Gracias", start: 3.0, end: 3.4, type: "word", speaker_id: "speaker_b" },
    { text: "a", start: 3.4, end: 3.5, type: "word", speaker_id: "speaker_b" },
    { text: "todos", start: 5.0, end: 5.4, type: "word", speaker_id: "speaker_b" },
  ],
};

test("Scribe's answer becomes stretches of one voice each, a pause of over a second a new one, its sounds apart", () => {
  const words = sound.scribeWordsOf(SCRIBE, 10);
  assert.equal(words.language, "es");
  assert.equal(words.voices, 2);
  assert.deepEqual(
    words.cues.map((c) => [c.start, c.voice, c.text]),
    [
      [0.2, 1, "Hola bienvenidos"],
      [3, 2, "Gracias a"],
      [5, 2, "todos"],
    ],
  );
  assert.deepEqual(words.events, [{ at: 1.2, what: "laughter" }]);
  assert.equal(words.text, "Hola bienvenidos Gracias a todos");
  assert.deepEqual(sound.scribeWordsOf({ language_code: "en", words: [] }, 10), { none: true }, "no words: no speech");
  assert.equal(sound.scribeWordsOf({ nope: true }, 10), null, "not an answer");
});

test("the ear's own stretches read the same, a moment as M:SS or seconds, nothing past the clip", () => {
  const words = sound.earWordsOf(
    {
      language: "en",
      words: [
        { at: "0:01", end: "0:03", voice: 1, text: "Welcome in" },
        { at: "0:40", end: "0:45", voice: 2, text: "past the end" },
        { at: "nonsense", end: "0:05", voice: 1, text: "no moment" },
      ],
    },
    30,
  );
  assert.deepEqual(
    words.cues.map((c) => [c.start, c.end, c.voice, c.text]),
    [[1, 3, 1, "Welcome in"]],
  );
});

test("the ear's note is read in code: a note with no sentence for the whole is none, and music's words only where there is music", () => {
  const note = sound.soundNoteOf({
    speech: true,
    language: "Spanish",
    voices: [{ voice: 1, tone: "warm, sure", pace: "steady" }],
    music: { present: false, kind: "pop", mood: "bright", tempo: "fast" },
    sounds: [{ at: "0:05", what: "a hair dryer" }],
    feel: "A friendly welcome at the door.",
    unsure: null,
  });
  assert.equal(note.language, "es");
  assert.deepEqual(note.music, { present: false, kind: null, mood: null, tempo: null });
  assert.deepEqual(note.sounds, [{ at: 5, what: "a hair dryer" }]);
  assert.equal(sound.soundNoteOf({ speech: true, feel: "  " }), null);
  assert.match(
    sound.noteSaidOf(note),
    /A friendly welcome at the door\.; voice 1 warm, sure, steady; no music; a hair dryer at 0:05/,
  );
});

test("the list's few words for a clip's sound, in each state", () => {
  const words = sound.scribeWordsOf(SCRIBE, 10);
  const note = {
    speech: true,
    language: "es",
    voices: [],
    music: { present: true, kind: "pop", mood: null, tempo: null },
    sounds: [],
    feel: "x",
    unsure: null,
  };
  assert.equal(sound.soundSaidOf({ words, note }), "Spanish, 2 voices, music");
  assert.equal(sound.soundSaidOf({ words: { none: true }, note }), "no speech, music");
  assert.equal(sound.soundSaidOf({ none: true }), "no sound");
  assert.equal(sound.soundSaidOf({}), null, "nothing heard yet says nothing");
});

test("what a sheet carries after it: what was heard, fenced and named; Ask told it did not hear the clip; the look told no more", () => {
  const words = sound.scribeWordsOf(SCRIBE, 10);
  const heard = sound.soundTurnSaidOf({ words });
  assert.match(heard, /What is said, transcribed by another model \(Spanish, 2 voices\):/);
  assert.match(heard, /\[0:00\.2\] Voice 1: Hola bienvenidos/);
  assert.match(heard, /How it sounds: not heard yet\./);
  assert.match(heard, /You did not hear this clip yourself: files action listen/);
  assert.doesNotMatch(sound.soundTurnSaidOf({ words }, { for: "look" }), /listen/);
  assert.match(sound.soundTurnSaidOf({ words: { none: true } }), /No one speaks in it\./);
  assert.match(sound.soundTurnSaidOf({}), /What is said: not heard yet\./);
  assert.equal(sound.soundTurnSaidOf({ none: true }, { for: "look" }), "It has no sound.");
  const after = sound.videoSheetAfterOf({ seconds: 3, width: 1920, height: 1080, sound: { none: true } });
  assert.match(
    after,
    /^6 frames left to right, top to bottom, one every 0\.5 s, each marked with its time\. Between frames you haven't seen\.\n/,
  );
});

test("a row's sound is read part by part, a part that does not read left out, never guessed", () => {
  const read = sound.fileSoundOf({
    words: { language: "en", voices: 1, text: "x", cues: [{ start: 1, end: 2, voice: 1, text: "Hello" }], events: [] },
    note: { feel: "" },
    heard_by: { words: { model: "gemini-3.5-flash-lite", at: "2026-11-07T00:00:00Z" }, note: { model: 7 } },
  });
  assert.equal(read.words.cues[0].text, "Hello");
  assert.equal(read.note, undefined);
  assert.deepEqual(read.heard_by, { words: { model: "gemini-3.5-flash-lite", at: "2026-11-07T00:00:00Z" } });
  assert.deepEqual(sound.fileSoundOf(null), {});
  assert.deepEqual(sound.fileSoundOf({ none: true }), { none: true });
});

test("captions: WebVTT, a long stretch cut into lines a viewer reads, none where nothing is said", () => {
  const long = "word ".repeat(40).trim();
  const vtt = sound.vttOf({
    language: "en",
    voices: 1,
    text: long,
    cues: [{ start: 1, end: 9, voice: 1, text: long }],
    events: [],
  });
  assert.ok(vtt.startsWith("WEBVTT\n\n1\n00:00:01.000 --> "));
  const blocks = vtt.trim().split("\n\n").slice(1);
  assert.ok(blocks.length >= 2, "cut into several");
  for (const b of blocks) assert.ok(b.split("\n")[2].length <= 84, "each line short enough to read");
  assert.equal(sound.vttOf({ none: true }), null);
  assert.ok(
    !sound
      .vttOf({
        language: "en",
        voices: 1,
        text: "a --> b",
        cues: [{ start: 0, end: 1, voice: 1, text: "a --> b" }],
        events: [],
      })
      .includes("a -->"),
    "a cue's text never breaks the timing line",
  );
});

test("language codes from what a model names", () => {
  assert.equal(sound.languageCodeOf("spa"), "es");
  assert.equal(sound.languageCodeOf("es-MX"), "es");
  assert.equal(sound.languageCodeOf("Spanish"), "es");
  assert.equal(sound.languageCodeOf("xx"), "xx");
  assert.equal(sound.languageCodeOf("klingon"), null);
  assert.equal(sound.languageNameOf("pt"), "Portuguese");
});

test("the ear is asked for the note, and the words too in the one-call shape; a question about a stretch names it", () => {
  assert.doesNotMatch(sound.videoEarAsked({ seconds: 24, language: "English", withWords: false }), /- words:/);
  assert.match(sound.videoEarAsked({ seconds: 24, language: "English", withWords: true }), /- words: everything said/);
  assert.match(
    sound.videoListenAsked({ seconds: 600, question: "Is the voice sure?", from: 18, to: 24 }),
    /from 0:18 to 0:24 of this 10:00 clip/,
  );
  assert.match(
    sound.videoListenAsked({ seconds: 30, question: "q", from: null, to: null }),
    /the whole of this 0:30 clip/,
  );
  assert.ok(sound.VIDEO_EAR_WORDS_SCHEMA.required.includes("words"));
  assert.ok(!sound.VIDEO_EAR_SCHEMA.required.includes("words"));
});

/* ----------------------------------------------------------------------------------- the list, the look, a post -- */

const dto = (over = {}) => ({
  id: "f1",
  kind: "image",
  status: "filed",
  source: "upload",
  name: "salon-tour",
  bytes: 1,
  width: 1920,
  height: 1080,
  seconds: null,
  media_status: null,
  sound_said: null,
  shows: "interior",
  who_in_it: "no_one",
  people: null,
  look_status: "done",
  line: "A tour of the salon.",
  issues: [],
  looks_like_stock: false,
  created_at: "2026-11-07T00:00:00Z",
  ...over,
});

test("what is kept is said by kind, and a video's tally counts the filed ones", () => {
  assert.equal(files.keptSaidOf(6, 0), "6 photos");
  assert.equal(files.keptSaidOf(1, 1), "1 video");
  assert.equal(files.keptSaidOf(8, 2), "6 photos and 2 videos");
  const tally = files.filesTallyOf([dto(), dto({ kind: "video" }), dto({ kind: "video", status: "inbox" })]);
  assert.equal(tally.videos, 1);
  assert.equal(files.filesSayOf(tally), "1 photo and 1 video, 1 waiting for you");
});

test("a video's line in the list says its length and its sound, or that it is not ready", () => {
  const ready = dto({ kind: "video", seconds: 24, media_status: "ready", sound_said: "Spanish, 2 voices, music" });
  assert.match(
    line.fileIndexLineOf({ ...ready, text_seen: [], quality: { sharp: null, light: null }, colors: [], subject: null }),
    /video 0:24 · Spanish, 2 voices, music/,
  );
  const waiting = dto({ kind: "video", media_status: "processing" });
  assert.match(
    line.fileIndexLineOf({
      ...waiting,
      text_seen: [],
      quality: { sharp: null, light: null },
      colors: [],
      subject: null,
    }),
    /video, still being prepared/,
  );
  const failed = dto({ kind: "video", media_status: "failed" });
  assert.match(
    line.fileIndexLineOf({
      ...failed,
      text_seen: [],
      quality: { sharp: null, light: null },
      colors: [],
      subject: null,
    }),
    /video, could not be prepared/,
  );
});

test("a video's look names the frame that stands for it, and its edition is its own", () => {
  const plan = video.videoSheetPlanOf({ seconds: 3, width: 1920, height: 1080 });
  const read = look.fileVideoLookOf(
    {
      line: "A walk through the salon.",
      name: "salon-tour",
      shows: "interior",
      people: { count: 1, recognizable: 0 },
      text_seen: [],
      quality: { sharp: "good", light: "good" },
      poster_frame: 3,
      colors: [],
      issues: [],
      looks_like_stock: false,
    },
    plan,
  );
  assert.equal(read.look.poster_at, plan.times[2]);
  assert.equal(read.look.subject, null);
  assert.equal(
    look.fileVideoLookOf({ line: "x", poster_frame: 99 }, plan).look.poster_at,
    null,
    "a frame not on the sheet",
  );
  assert.ok(!("subject_box" in look.FILE_VIDEO_LOOK_SCHEMA.properties), "no box asked of a video");
  assert.equal(look.VIDEO_LOOK_EDITION, 2, "2: it names the clip's moments, so every video is read again");
  assert.match(
    look.fileVideoLookAsked({
      seconds: 24,
      frames: 48,
      step: 0.5,
      width: 2576,
      height: 1449,
      business: "A salon",
      services: [],
      sound: "It has no sound.",
    }),
    /a sheet of 48 frames from a video of 24 seconds[\s\S]*It has no sound\.[\s\S]*poster_frame[\s\S]*moments: up to 5 frames/,
  );
});

test("a video made here is looked at as a finished video: its own words, end card and silence are no fault of it", () => {
  // Seen on production 11 Nov 2026: a made video's look listed "Overlay text on the first four frames" and "Ends on a dark
  // booking card with no sound" as what was wrong with it, and its card said so in amber.
  const asked = (made) =>
    look.fileVideoLookAsked({
      seconds: 10,
      frames: 20,
      step: 0.5,
      width: 2576,
      height: 1449,
      business: "A salon",
      services: [],
      sound: "It has no sound.",
      made,
    });
  const finished = asked(true);
  assert.match(finished, /made here, from the business's own clips/);
  assert.match(finished, /opening words[\s\S]*end card[\s\S]*no sound[\s\S]*on purpose/);
  assert.match(finished, /issues: only what would stop the business posting it as it is/);
  assert.ok(finished.indexOf("made here") < finished.indexOf("- line:"), "said before the catalog asks for anything");
  const clip = asked(false);
  assert.doesNotMatch(clip, /made here/, "a clip a member sent is asked as before");
  assert.match(clip, /- issues: anything that hurts its use/);
  assert.equal(look.VIDEO_LOOK_EDITION, 2, "a clip's words are unchanged, so no video is read again");
});

test("a video's look keeps its best moments: each at a frame the sheet holds, with words, once a frame, five at most", () => {
  const plan = video.videoSheetPlanOf({ seconds: 24, width: 1920, height: 1080 });
  const at = (frame) => plan.times[frame - 1];
  const read = look.fileVideoLookOf(
    {
      line: "A balayage from start to finish.",
      poster_frame: 40,
      moments: [
        { frame: 40, what: "  the finished colour at the mirror  " },
        { frame: 2, what: "the before, roots showing" },
        { frame: 40, what: "the same frame again" },
        { frame: 99, what: "a frame the sheet does not hold" },
        { frame: 12, what: "" },
        { frame: 1.5, what: "not a frame" },
        "not a moment",
        { frame: 20, what: "foils going in" },
        { frame: 25, what: "the wash" },
        { frame: 30, what: "drying" },
        { frame: 35, what: "one more than it keeps" },
      ],
    },
    plan,
  );
  assert.deepEqual(read.look.moments, [
    { at: at(40), what: "the finished colour at the mirror" },
    { at: at(2), what: "the before, roots showing" },
    { at: at(20), what: "foils going in" },
    { at: at(25), what: "the wash" },
    { at: at(30), what: "drying" },
  ]);
  assert.equal(read.look.poster_at, at(40), "the poster is its own word");
  assert.deepEqual(look.fileVideoLookOf({ line: "x" }, plan).look.moments, [], "none named, none kept");
  assert.equal(
    look.fileVideoLookOf({ line: "x", moments: [{ frame: 3, what: "w".repeat(300) }] }, plan).look.moments[0].what
      .length,
    120,
  );
  assert.ok(look.FILE_VIDEO_LOOK_SCHEMA.required.includes("moments"), "asked every time");
});

test("a video makes a post from one moment of it once it is ready, said to a person in their language and to the model", () => {
  const v = { status: "filed", source: "upload", shows: "interior", kind: "video", seconds: 24 };
  assert.equal(post.postPhotoWont({ ...v, media_status: "ready" }), null, "a ready one may");
  for (const media_status of ["processing", "failed", undefined])
    assert.equal(post.postPhotoWont({ ...v, media_status }), "video", `not one that is ${media_status}`);
  assert.match(post.postWordsIn("en").photoWont.video, /still being made ready/);
  assert.match(post.postWordsIn("es").photoWont.video, /todavía se está preparando/);
  assert.match(postCheck.postPhotoProblem(v), /still being made ready/);
  assert.equal(post.postMomentWont(v, null), "moment", "its moment is named");
  assert.equal(post.postMomentWont(v, 24.04), null, "its last frame, as a length read to the hundredth names it");
  assert.equal(post.postMomentWont(v, 24.2), "moment", "and inside the clip");
  assert.equal(post.postMomentWont(v, 0), null);
  assert.equal(
    post.postMomentWont({ ...v, seconds: null }, 1),
    "moment",
    "a clip of no known length holds no moment yet",
  );
  assert.match(postCheck.postMomentProblem(v, null), /call again with at set to that moment/);
  assert.ok(post.postWordsIn("en").photoWont.moment);
  assert.notEqual(post.postWordsIn("es").photoWont.moment, post.postWordsIn("en").photoWont.moment);
  const photo = { status: "filed", source: "upload", shows: "interior" };
  assert.equal(post.postPhotoWont(photo), null, "a photo still may");
  assert.equal(post.postMomentWont(photo, null), null, "and has no moment to name");
  assert.equal(post.postMomentWont(photo, 5), null);
  assert.equal(files.fileFramePathOf("t", "f", 12.5), "t/f/frame-1250.jpg");
  assert.equal(post.postPlanOf({ at: 12.5 }).at, 12.5);
  assert.equal(post.postPlanOf({ at: -1 }).at, null);
  assert.equal(post.postPlanOf({}).at, null, "a card made before names none");
});

test("an upload's name before the look: what the file was called, else a photo or a video", () => {
  assert.equal(files.uploadNameOf("IMG_0001.MOV", "video"), "img-0001");
  assert.equal(files.uploadNameOf("", "video"), "video");
  assert.equal(files.uploadNameOf(""), "photo");
});

test("kinds by type: a video's three, a photo's five, nothing else", () => {
  assert.deepEqual([...files.FILE_VIDEO_MIMES], ["video/mp4", "video/quicktime", "video/webm"]);
  assert.ok(files.isVideoMime("video/quicktime") && !files.isVideoMime("image/jpeg"));
  assert.equal(files.fileKindOf("video/webm"), "video");
  assert.equal(files.fileKindOf("image/png"), "image");
  assert.ok(!files.isFileMime("video/x-msvideo"));
});

/* ----------------------------------------------------------------------------------------------- what it costs -- */

test("hearing's prices: Gemini by its tokens, Scribe by the hour, an unknown model none; each call a ledger row with its port", () => {
  assert.equal(hearing.hearingDollars("gemini-3.5-flash-lite", { input: 1_000_000, output: 100_000 }), 0.55);
  assert.equal(hearing.hearingDollars("scribe_v2", { input: 0, output: 0, seconds: 3600 }), 0.22);
  assert.equal(hearing.hearingDollars("gemini-9", { input: 1, output: 1 }), null);
  const row = usage.hearingUsageBodyOf({
    tenantId: "t",
    purpose: "file_words",
    port: "google",
    model: "gemini-3.5-flash-lite",
    outcome: "answered",
    input: 768,
    output: 200,
    subjectId: "f",
  });
  assert.equal(row.port, "google");
  assert.equal(row.purpose, "file_words");
  assert.equal(row.subject_id, "f");
  assert.ok(hearing.AI_USAGE_PURPOSES.includes("file_hear") && hearing.AI_USAGE_PORTS.includes("elevenlabs"));
});

test("the switches: the words' shape, gemini unless it says scribe; the ear's model, Flash-Lite unless it names a Gemini", () => {
  assert.equal(hearing.videoWordsShapeOf(undefined), "gemini");
  assert.equal(hearing.videoWordsShapeOf(" Scribe "), "scribe");
  assert.equal(hearing.videoWordsShapeOf("whisper"), "gemini");
  assert.equal(hearing.videoEarModelOf("gemini-3.8-flash"), "gemini-3.8-flash");
  assert.equal(hearing.videoEarModelOf("gpt-5"), "gemini-3.5-flash-lite");
});

test("a box of a moment is held as a photo's is, and scaled to the source it is cut from", () => {
  assert.deepEqual(zoom.boxInSource([100, 50, 300, 150], [1000, 500], [2000, 1000]), {
    left: 200,
    top: 100,
    width: 400,
    height: 200,
  });
  assert.deepEqual(zoom.boxInSource([990, 490, 2000, 2000], [1000, 500], [1000, 500]), {
    left: 990,
    top: 490,
    width: 10,
    height: 10,
  });
});
