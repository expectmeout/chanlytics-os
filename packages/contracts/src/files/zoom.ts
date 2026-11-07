/**
 * A box of a picture, enlarged, for Ask to look closer (decision 0099, Ask's eyes): the rules a box is cut by, the same for a
 * photo (the dashboard's zoom, from its original) and a video's frame (the edge's, from the frame Stream gives). The model names
 * the box in the pixels of the picture as it was shown; a small box is enlarged, since the model reads a very small picture
 * badly, and the long edge never passes the size a picture is shown at.
 */
import { FILE_COPY_SIDE } from "./look";

/** The long edge a zoom is shown at, the least it is enlarged to, and how far a tiny box may be blown up before it is only blur. */
const ZOOM_LONG_EDGE = FILE_COPY_SIDE;
const ZOOM_SMALLEST = 1000;
const ZOOM_UPSCALE_MOST = 4;
/** The smallest box worth cutting, in the pixels of the picture as shown. */
const BOX_SIDE_LEAST = 16;
/** A cut's quality as a JPEG: small print reads better from a little more. */
export const ZOOM_JPEG_QUALITY = 90;

/** A box as the model names it, [x1, y1, x2, y2] in the pixels of the picture it was shown. */
export type ZoomBox = readonly [number, number, number, number];
/** A picture's size, [width, height] in pixels. */
export type ZoomSize = readonly [number, number];

/** Why a box could not be cut, in words for the model. */
export type ZoomWont = { wont: string };

const round = (n: number) => Math.round(n);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** One side of a box, its ends in order and inside the picture, and no shorter than the least worth cutting, widened around its middle. */
function sideShown(from: number, to: number, most: number): [number, number] {
  let [a, b] = from <= to ? [from, to] : [to, from];
  a = clamp(round(a), 0, most);
  b = clamp(round(b), 0, most);
  if (b - a >= BOX_SIDE_LEAST) return [a, b];
  const lo = clamp(round((a + b) / 2 - BOX_SIDE_LEAST / 2), 0, most - BOX_SIDE_LEAST);
  return [lo, lo + BOX_SIDE_LEAST];
}

/** The box in the shown picture's pixels, whole, inside its edges, and no smaller than the least worth cutting. */
export function boxShown(wanted: ZoomBox, of: ZoomSize): ZoomBox | ZoomWont {
  const [w, h] = of;
  const [x1, y1, x2, y2] = wanted;
  const inside = (a: number, b: number, most: number) => Math.max(a, b) > 0 && Math.min(a, b) < most;
  if (!inside(x1, x2, w) || !inside(y1, y2, h)) return { wont: `the box is outside the picture, which is ${w}×${h}` };
  const [left, right] = sideShown(x1, x2, w);
  const [top, bottom] = sideShown(y1, y2, h);
  return [left, top, right, bottom];
}

/** The size a cut is shown at: enlarged to read, never past the long edge a picture is shown at, never blown up into blur. */
export function zoomSizeOf(cut: ZoomSize): ZoomSize {
  const [w, h] = cut;
  const long = Math.max(w, h);
  const target = Math.min(ZOOM_LONG_EDGE, Math.max(long, ZOOM_SMALLEST), long * ZOOM_UPSCALE_MOST);
  const scale = target / long;
  return [Math.max(1, round(w * scale)), Math.max(1, round(h * scale))];
}

/** The box, scaled from the shown picture's pixels to its source's, held inside the source. */
export function boxInSource(
  box: ZoomBox,
  of: ZoomSize,
  source: ZoomSize,
): { left: number; top: number; width: number; height: number } {
  const [srcW, srcH] = source;
  const sx = srcW / of[0];
  const sy = srcH / of[1];
  const left = clamp(round(box[0] * sx), 0, srcW - 1);
  const top = clamp(round(box[1] * sy), 0, srcH - 1);
  const width = clamp(round((box[2] - box[0]) * sx), 1, srcW - left);
  const height = clamp(round((box[3] - box[1]) * sy), 1, srcH - top);
  return { left, top, width, height };
}
