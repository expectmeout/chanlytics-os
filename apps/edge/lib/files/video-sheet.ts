/**
 * A video drawn for a model (decision 0099, stage B, D5). Claude takes pictures, not video, so a clip is shown as Claude Code
 * looks at one: its frames fetched from Stream under one short token, tiled in order into one sheet with each frame's time on
 * it; a stretch drawn the same way for a turn; one moment whole; a box of a moment, cut by the photo's rules (contracts
 * files/zoom.ts). The plans (which moments, how the grid falls) are contracts files/video.ts.
 *
 * sharp draws it, loaded only here, when a sheet is drawn: esbuild cannot bundle its native code, so edge-functions.mjs copies
 * it beside each function that loads it. The times are drawn as segments, not as type, so no font need be on the machine.
 */
import type Sharp from "sharp";
import {
  VIDEO_FRAME_SIDE,
  VIDEO_TILE_LABEL_PX,
  ZOOM_JPEG_QUALITY,
  boxInSource,
  boxShown,
  clockOf,
  videoFrameSizeOf,
  zoomSizeOf,
  type VideoSheetPlan,
  type ZoomBox,
  type ZoomSize,
  type ZoomWont,
} from "@chanlytics/contracts";
import { fetchStreamFrame, streamFrameUrl, streamTokenOf, type StreamSigning } from "@chanlytics/channels/files";
import { imageHeaderOf } from "@chanlytics/core";
import { logAndGoOn } from "@chanlytics/log";

/** The edge's own tokens for a video's frames: minutes, never an hour. */
const FRAME_TOKEN_S = 5 * 60;
/** How many frames are asked of Stream at once: the account's 1,200 calls in five minutes are shared with every other. */
const FRAMES_AT_ONCE = 8;
/** A sheet's JPEG: the model reads small print in a frame better from a little more than Storage's default. */
const SHEET_QUALITY = 85;
/** A poster's long side: what a tile and the player's still need, at a phone's density. */
const POSTER_SIDE = 1280;

let loading: Promise<typeof Sharp> | null = null;
/** sharp, loaded once, the first time a picture is drawn. */
const sharpOf = (): Promise<typeof Sharp> => (loading ??= import("sharp").then((m) => m.default));

/** The video a picture is drawn from: its id at Stream, and its frame's shape as Stream said it. */
export interface VideoAt {
  mediaRef: string;
  width: number | null;
  height: number | null;
}

/** Frames' bytes for these moments, each fetched at most once: null for one Stream did not give. */
async function framesOf(
  signing: StreamSigning,
  video: VideoAt,
  times: readonly number[],
  size: { width: number; height: number },
): Promise<(Uint8Array | null)[]> {
  const token = streamTokenOf(signing, { uid: video.mediaRef, seconds: FRAME_TOKEN_S });
  const out: (Uint8Array | null)[] = Array.from({ length: times.length }, () => null);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < times.length; i = next++) {
      const frame = await fetchStreamFrame(streamFrameUrl(signing.customerCode, token, { at: times[i] ?? 0, ...size }));
      out[i] = frame.ok ? frame.bytes : null;
    }
  };
  await Promise.all(Array.from({ length: Math.min(FRAMES_AT_ONCE, times.length) }, worker));
  return out;
}

/* --------------------------------------------------------------------------------------------------- the times -- */

/** Each digit's lit segments, seven-segment style: a top, b top right, c bottom right, d bottom, e bottom left, f top left, g middle. */
const SEGMENTS: Readonly<Record<string, string>> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

/** A figure's box: where it starts, how wide and tall a digit is, and how thick its strokes. */
interface FigureBox {
  x: number;
  y: number;
  w: number;
  h: number;
  t: number;
}

/** Each segment as a rectangle of a digit's box: its left, top, width and height. */
const SEGMENT_RECTS: Readonly<Record<string, (b: FigureBox) => [number, number, number, number]>> = {
  a: (b) => [b.x, b.y, b.w, b.t],
  b: (b) => [b.x + b.w - b.t, b.y, b.t, b.h / 2],
  c: (b) => [b.x + b.w - b.t, b.y + b.h / 2, b.t, b.h / 2],
  d: (b) => [b.x, b.y + b.h - b.t, b.w, b.t],
  e: (b) => [b.x, b.y + b.h / 2, b.t, b.h / 2],
  f: (b) => [b.x, b.y, b.t, b.h / 2],
  g: (b) => [b.x, b.y + b.h / 2 - b.t / 2, b.w, b.t],
};

/** A colon's two dots and a point's one, each a stroke square: [their tops as a share of the digit's height]. */
const MARKS: Readonly<Record<string, number[]>> = { ":": [0.25, 0.7], ".": [1] };

/** One character's rectangles at its box, and how far the next one starts. */
function clockCharacterOf(ch: string, box: FigureBox): { rects: [number, number, number, number][]; advance: number } {
  const marks = MARKS[ch];
  if (marks)
    return {
      rects: marks.map((top) => [box.x, top === 1 ? box.y + box.h - box.t : box.y + box.h * top, box.t, box.t]),
      advance: box.t + box.t,
    };
  const rects = Array.from(SEGMENTS[ch] ?? "", (segment) => SEGMENT_RECTS[segment]?.(box)).filter(
    (r): r is [number, number, number, number] => Boolean(r),
  );
  return { rects, advance: box.w + box.t + 1 };
}

/** A time's figures as rectangles, from (x, y), each digit `w` wide and `h` tall with strokes `t` thick: and the width drawn. */
function segmentFiguresOf(clock: string, box: FigureBox): { rects: string[]; width: number } {
  const rects: string[] = [];
  let cursor = box.x;
  for (const ch of clock) {
    const figure = clockCharacterOf(ch, { ...box, x: cursor });
    for (const [left, top, width, height] of figure.rects)
      rects.push(`<rect x="${left}" y="${top}" width="${width}" height="${height}"/>`);
    cursor += figure.advance;
  }
  return { rects, width: cursor - box.x };
}

/** A tile's time, on a dark band at its foot: an SVG sharp lays over the sheet. */
function timeBandOf(seconds: number, tileW: number): Buffer {
  const band = VIDEO_TILE_LABEL_PX;
  const digitHeight = Math.round(band * 0.64);
  const stroke = Math.max(2, Math.round(band / 11));
  const pad = Math.round(band / 5);
  const { rects, width } = segmentFiguresOf(clockOf(seconds, true), {
    x: pad,
    y: Math.round((band - digitHeight) / 2),
    w: Math.round(digitHeight * 0.55),
    h: digitHeight,
    t: stroke,
  });
  const boxW = Math.min(tileW, width + pad * 2);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${band}">` +
      `<rect x="0" y="0" width="${boxW}" height="${band}" fill="#000" fill-opacity="0.72"/>` +
      `<g fill="#fff">${rects.join("")}</g></svg>`,
  );
}

/* --------------------------------------------------------------------------------------------------- the sheet -- */

export interface Drawn {
  bytes: Buffer;
  width: number;
  height: number;
}

/**
 * The plan's frames tiled into one sheet, left to right and top to bottom, each with its time at its foot. A frame Stream did not
 * give is a dark tile with its time, so the grid still says where it was; none at all is no sheet.
 */
export async function drawVideoSheet(
  signing: StreamSigning,
  video: VideoAt,
  plan: VideoSheetPlan,
): Promise<Drawn | null> {
  const frames = await framesOf(signing, video, plan.times, { width: plan.tileW, height: plan.tileH });
  if (!frames.some(Boolean)) return null;
  const sharp = await sharpOf();
  const black = { r: 0, g: 0, b: 0 };
  const tiles = await Promise.all(
    frames.map((bytes) =>
      bytes
        ? sharp(bytes)
            .resize(plan.tileW, plan.tileH, { fit: "contain", background: black })
            .toBuffer()
            .catch(logAndGoOn("a video sheet's tile", null))
        : Promise.resolve(null),
    ),
  );
  const labelled = plan.tileH >= VIDEO_TILE_LABEL_PX * 3;
  const layers = plan.times.flatMap((at, i) => {
    const left = (i % plan.cols) * plan.tileW;
    const top = Math.floor(i / plan.cols) * plan.tileH;
    const tile = tiles[i];
    return [
      ...(tile ? [{ input: tile, left, top }] : []),
      ...(labelled ? [{ input: timeBandOf(at, plan.tileW), left, top: top + plan.tileH - VIDEO_TILE_LABEL_PX }] : []),
    ];
  });
  const bytes = await sharp({ create: { width: plan.width, height: plan.height, channels: 3, background: black } })
    .composite(layers)
    .jpeg({ quality: SHEET_QUALITY })
    .toBuffer();
  return { bytes, width: plan.width, height: plan.height };
}

/* ------------------------------------------------------------------------------------------------ one moment -- */

/** One moment as Stream gives it, whole, its long side at most `side`: the bytes and the size they came at. */
async function streamMomentOf(signing: StreamSigning, video: VideoAt, at: number, side: number): Promise<Drawn | null> {
  const [w, h] = videoFrameSizeOf(video.width, video.height);
  const k = Math.min(1, side / Math.max(w, h));
  const [frame] = await framesOf(signing, video, [at], { width: Math.round(w * k), height: Math.round(h * k) });
  const head = frame ? imageHeaderOf(frame) : null;
  if (!frame || !head) return null;
  return { bytes: Buffer.from(frame), width: head.width, height: head.height };
}

/** One moment whole, at the long side a model reads unchanged (VIDEO_FRAME_SIDE). */
export const drawMoment = (signing: StreamSigning, video: VideoAt, at: number): Promise<Drawn | null> =>
  streamMomentOf(signing, video, at, VIDEO_FRAME_SIDE);

/** A poster: the still a tile and the player show, at the moment the look chose (or the sheet's second frame, before it). */
export const drawPoster = (signing: StreamSigning, video: VideoAt, at: number): Promise<Drawn | null> =>
  streamMomentOf(signing, video, at, POSTER_SIDE);

/**
 * A box of one moment, cut and enlarged by the photo's rules: the box is in the pixels the moment was shown at (`of`, a
 * `drawMoment` of it), and the moment is fetched again at that size to cut it from.
 */
export async function drawMomentBox(
  signing: StreamSigning,
  video: VideoAt,
  { at, box: asked, of }: { at: number; box: ZoomBox; of: ZoomSize },
): Promise<(Drawn & { box: ZoomBox; of: ZoomSize }) | ZoomWont> {
  const box = boxShown(asked, of);
  if ("wont" in box) return box;
  const moment = await streamMomentOf(signing, video, at, Math.max(of[0], of[1]));
  if (!moment) return { wont: "that moment could not be read just now" };
  const sharp = await sharpOf();
  const cut = boxInSource(box, of, [moment.width, moment.height]);
  const size = zoomSizeOf([cut.width, cut.height]);
  const bytes = await sharp(moment.bytes)
    .extract(cut)
    .resize(size[0], size[1], { fit: "fill", kernel: "lanczos3" })
    .jpeg({ quality: ZOOM_JPEG_QUALITY })
    .toBuffer();
  return { bytes, width: size[0], height: size[1], box, of };
}
