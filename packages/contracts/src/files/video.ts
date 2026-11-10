/**
 * A business's videos (decision 0099, stage B): what a model is shown of one, worked out here so the edge that draws it, the
 * tool that opens it and a test all say the same. Claude takes pictures, not video, so a video is shown the way Claude Code
 * looks at one: a sheet of frames in order, each marked with its time, and a closer look at a moment or a stretch when the sheet
 * is not enough (`zoom` with `at`, or `from` and `to`). The words that go with it say what was not seen.
 *
 * The sheet's long side is the most Opus 5.5 and Haiku 5.5 read unchanged (the vision page: 2,576 px, 4,784 visual tokens, so
 * about 3.59 million pixels), and its grid is the one that draws each frame largest inside both.
 */

/** The most frames a sheet holds. */
export const VIDEO_SHEET_FRAMES = 48;
/** How far apart a short clip's frames are: past VIDEO_SHEET_FRAMES of them, the frames are spaced evenly instead. */
const VIDEO_SHEET_STEP_S = 0.5;
/** A sheet's long side, and the most pixels it may hold before a model shrinks it (4,784 visual tokens at 750 pixels each). */
export const VIDEO_SHEET_SIDE = 2576;
export const VIDEO_SHEET_PIXELS = 4784 * 750;
/** A stretch looked at more closely: up to this many frames, never closer together than this. */
export const VIDEO_SPAN_FRAMES = 24;
const VIDEO_SPAN_STEP_MIN_S = 0.25;
/** The shortest stretch a span is drawn for: a narrower one is widened around its middle. */
const VIDEO_SPAN_MIN_S = 1;
/**
 * One moment, drawn whole: its long side. The largest frame the video platform gives (channels stream.ts STREAM_FRAME_SIDE_MAX),
 * inside what a model reads unchanged: a moment asked at 2,576 pixels was refused whole.
 */
export const VIDEO_FRAME_SIDE = 2000;
/** The band each tile's time is written on, in pixels of the tile, and the shortest tile it is written on at all. */
export const VIDEO_TILE_LABEL_PX = 22;

/**
 * The steps a video is made ready by, in order (00556 video_digest): its sheet and first poster, its sound kept, its words, the
 * note on how it sounds, then the look. One step a run of the job, the next scheduled at once (decision 0099, D22).
 */
export const VIDEO_DIGEST_STEPS = ["sheet", "audio", "words", "note", "look"] as const;
export type VideoDigestStep = (typeof VIDEO_DIGEST_STEPS)[number];
/** The next step after one, or null after the last. */
export const nextDigestStepOf = (step: VideoDigestStep): VideoDigestStep | null =>
  VIDEO_DIGEST_STEPS[VIDEO_DIGEST_STEPS.indexOf(step) + 1] ?? null;
export const isDigestStep = (value: unknown): value is VideoDigestStep =>
  typeof value === "string" && (VIDEO_DIGEST_STEPS as readonly string[]).includes(value);

/** A frame's shape where the platform could not say: a phone's landscape clip. */
const UNKNOWN_SHAPE: readonly [number, number] = [1920, 1080];

/** A clip's frame shape, from what the platform said of it: a size it did not know (-1, 0, null) reads as a landscape clip. */
function frameShapeOf(width: number | null | undefined, height: number | null | undefined): [number, number] {
  return typeof width === "number" && typeof height === "number" && width > 0 && height > 0
    ? [width, height]
    : [UNKNOWN_SHAPE[0], UNKNOWN_SHAPE[1]];
}

/** Where a sheet's frames are and how it is laid out: every number the edge draws it by. */
export interface VideoSheetPlan {
  /** Each frame's moment, in seconds from the start, in order. */
  times: number[];
  /** How far apart they are, in seconds. */
  step: number;
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
  width: number;
  height: number;
}

/** The grid that draws `n` tiles of a frame's shape largest inside the sheet's side and pixels. */
function gridOf(count: number, frameW: number, frameH: number): Omit<VideoSheetPlan, "times" | "step"> {
  const aspect = frameW / frameH;
  let best: Omit<VideoSheetPlan, "times" | "step"> | null = null;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const sheetAspect = (cols * aspect) / rows;
    let width = sheetAspect >= 1 ? VIDEO_SHEET_SIDE : VIDEO_SHEET_SIDE * sheetAspect;
    let height = sheetAspect >= 1 ? VIDEO_SHEET_SIDE / sheetAspect : VIDEO_SHEET_SIDE;
    if (width * height > VIDEO_SHEET_PIXELS) {
      const k = Math.sqrt(VIDEO_SHEET_PIXELS / (width * height));
      width *= k;
      height *= k;
    }
    const tileW = Math.floor(width / cols);
    const tileH = Math.floor(height / rows);
    const area = tileW * tileH;
    // Larger tiles win; at one size, the grid with fewer empty places.
    if (
      !best ||
      area > best.tileW * best.tileH ||
      (area === best.tileW * best.tileH && cols * rows < best.cols * best.rows)
    )
      best = { cols, rows, tileW, tileH, width: cols * tileW, height: rows * tileH };
  }
  return best ?? { cols: 1, rows: 1, tileW: frameW, tileH: frameH, width: frameW, height: frameH };
}

/** A moment's time, held inside the clip: never past its last frame. */
const inside = (t: number, seconds: number): number => Math.round(Math.max(0, Math.min(t, seconds - 0.05)) * 100) / 100;

/**
 * The whole clip's sheet: a frame every half second up to 48 of them, past that 48 spaced evenly (a ten-minute clip, one every
 * 12.5 s), each at the middle of its stretch, so the first is not a fade from black.
 */
export function videoSheetPlanOf(video: {
  seconds: number;
  width?: number | null;
  height?: number | null;
}): VideoSheetPlan {
  const seconds = Math.max(video.seconds, 0.1);
  const short = seconds <= VIDEO_SHEET_FRAMES * VIDEO_SHEET_STEP_S;
  const count = short ? Math.max(1, Math.ceil(seconds / VIDEO_SHEET_STEP_S)) : VIDEO_SHEET_FRAMES;
  const step = short ? VIDEO_SHEET_STEP_S : seconds / count;
  const times = Array.from({ length: count }, (_, i) => inside((i + 0.5) * step, seconds));
  const [fw, fh] = frameShapeOf(video.width, video.height);
  return { times, step: Math.round(step * 100) / 100, ...gridOf(count, fw, fh) };
}

/** A stretch's sheet: up to 24 frames spaced evenly between `from` and `to`, never closer than a quarter second. */
export function videoSpanPlanOf(video: {
  seconds: number;
  width?: number | null;
  height?: number | null;
  from: number;
  to: number;
}): VideoSheetPlan & { from: number; to: number } {
  const seconds = Math.max(video.seconds, 0.1);
  let from = Math.max(0, Math.min(video.from, video.to));
  let to = Math.min(seconds, Math.max(video.from, video.to));
  if (to - from < VIDEO_SPAN_MIN_S) {
    const mid = (from + to) / 2;
    from = Math.max(0, Math.min(mid - VIDEO_SPAN_MIN_S / 2, seconds - VIDEO_SPAN_MIN_S));
    to = Math.min(seconds, from + VIDEO_SPAN_MIN_S);
  }
  const count = Math.min(VIDEO_SPAN_FRAMES, Math.max(2, Math.floor((to - from) / VIDEO_SPAN_STEP_MIN_S)));
  const step = (to - from) / count;
  const times = Array.from({ length: count }, (_, i) => inside(from + (i + 0.5) * step, seconds));
  const [fw, fh] = frameShapeOf(video.width, video.height);
  return {
    times,
    step: Math.round(step * 100) / 100,
    from: Math.round(from * 100) / 100,
    to: Math.round(to * 100) / 100,
    ...gridOf(count, fw, fh),
  };
}

/**
 * One moment drawn whole: its size, the long side VIDEO_FRAME_SIDE at most, the frame's own shape, each side even, as the video
 * platform takes a frame's size. The size the edge asks for, so the pixels a box is named in are the pixels shown.
 */
export function videoFrameSizeOf(width?: number | null, height?: number | null): [number, number] {
  const [fw, fh] = frameShapeOf(width, height);
  const k = Math.min(1, VIDEO_FRAME_SIDE / Math.max(fw, fh));
  const even = (n: number) => Math.min(VIDEO_FRAME_SIDE, Math.max(2, 2 * Math.round((n * k) / 2)));
  return [even(fw), even(fh)];
}

/** A moment as a person reads it: "0:24", "1:05", "10:00"; with a tenth where it has one and `tenths` asks ("0:12.5"). */
export function clockOf(seconds: number, tenths = false): string {
  const s = Math.max(0, seconds);
  const whole = tenths ? Math.round(s * 10) / 10 : Math.round(s);
  const m = Math.floor(whole / 60);
  const rest = whole - m * 60;
  const ss = tenths && rest % 1 !== 0 ? rest.toFixed(1).padStart(4, "0") : String(Math.floor(rest)).padStart(2, "0");
  return `${m}:${ss}`;
}

/** A moment as the model or a person names it: 65, "65", "1:05", "1:05.5", "0:12"; null for anything else. */
export function secondsOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const m = /^(\d{1,3}):([0-5]?\d(?:\.\d+)?)$/.exec(text);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** How a step is said: "0.5 s", "12.5 s", "2 s". */
const stepSaid = (step: number): string => `${Math.round(step * 100) / 100} s`;

/** What a sheet is called before the picture: the file, that it is a video, and its length. Its size follows (openedPicture). */
export const videoSheetWhatOf = (name: string, seconds: number): string =>
  `The file ${name}, a video of ${clockOf(seconds)}`;

/** What is said of a sheet after the picture, by its frames and their spacing: how it is laid out, and what was not seen. */
export function videoFramesSaidOf(frames: number, step: number): string {
  const spacing =
    frames === 1 ? "one frame" : `${frames} frames left to right, top to bottom, one every ${stepSaid(step)}`;
  return `${spacing}, each marked with its time. Between frames you haven't seen.`;
}

/** What is said of a whole clip's sheet after the picture. */
export const videoSheetSaidOf = (plan: Pick<VideoSheetPlan, "times" | "step">): string =>
  videoFramesSaidOf(plan.times.length, plan.step);

/** What a stretch's sheet is called before its picture. */
export const videoSpanWhatOf = (name: string, from: number, to: number): string =>
  `The file ${name}, a video, from ${clockOf(from, true)} to ${clockOf(to, true)}`;

/** One moment's picture, before it. */
export const videoFrameWhatOf = (name: string, at: number): string =>
  `The file ${name}, a video, its frame at ${clockOf(at, true)}`;

/**
 * Whether a workspace takes videos (`features.video_preview`, the flag registry's `video_preview`): Add offers them, the page draws
 * them, Ask is told of them. Read off the config as stored, so anything but `true` is off.
 */
export function videoPreviewOf(config: unknown): boolean {
  if (typeof config !== "object" || config === null || !("features" in config)) return false;
  const features: unknown = config.features;
  return (
    typeof features === "object" && features !== null && "video_preview" in features && features.video_preview === true
  );
}
