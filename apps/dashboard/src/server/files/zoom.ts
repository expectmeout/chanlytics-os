/**
 * A box of a photo, enlarged, for Ask to look closer (decision 0099, Ask's eyes): small words on a sign, a face, a corner it is not
 * sure of. The model names the box in the pixels of the picture as it was shown, and the box is cut from the best source there is:
 * the original where the code can read it, and Storage's largest copy for a HEIC or a photo too heavy to hold. A small box is
 * enlarged, since the model reads a very small picture badly, and the long edge never passes the size it was shown at. The pixels
 * never leave the dashboard but as the picture the edge keeps for the turn (copies.ts).
 */
import "server-only";
import sharp from "sharp";
import { FILE_COPY_SIDE, FILE_TYPES, filePathOf, type FileMime } from "@chanlytics/contracts";
import type { FileMemberRow } from "@chanlytics/db";
import { bucket } from "./file";

/** The long edge a zoom is shown at, the least it is enlarged to, and how far a tiny box may be blown up before it is only blur. */
const ZOOM_LONG_EDGE = FILE_COPY_SIDE;
const ZOOM_SMALLEST = 1000;
const ZOOM_UPSCALE_MOST = 4;
/** The smallest box worth cutting, in the pixels of the picture as shown. */
const BOX_SIDE_LEAST = 16;
/** An original past this is read as Storage's largest copy instead, as a HEIC always is: the code reads neither whole. */
const ORIGINAL_MOST_BYTES = 12_000_000;
const STORAGE_LARGEST = 2500;
const ZOOM_JPEG_QUALITY = 90;

export type Box = readonly [number, number, number, number];
export type Size = readonly [number, number];

export interface Zoomed {
  bytes: Buffer;
  /** The box as it was cut, in the pixels of the size the picture was shown at: clamped to its edges, and widened where it was too small. */
  box: Box;
  /** The size it was shown at. */
  of: Size;
  /** The size the cut is shown at now. */
  size: Size;
}

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
export function boxShown(asked: Box, of: Size): Box | ZoomWont {
  const [w, h] = of;
  const [x1, y1, x2, y2] = asked;
  const inside = (a: number, b: number, most: number) => Math.max(a, b) > 0 && Math.min(a, b) < most;
  if (!inside(x1, x2, w) || !inside(y1, y2, h)) return { wont: `the box is outside the picture, which is ${w}×${h}` };
  const [left, right] = sideShown(x1, x2, w);
  const [top, bottom] = sideShown(y1, y2, h);
  return [left, top, right, bottom];
}

/** The size a cut is shown at: enlarged to read, never past the long edge a picture is shown at, never blown up into blur. */
export function zoomSizeOf(cut: Size): Size {
  const [w, h] = cut;
  const long = Math.max(w, h);
  const target = Math.min(ZOOM_LONG_EDGE, Math.max(long, ZOOM_SMALLEST), long * ZOOM_UPSCALE_MOST);
  const scale = target / long;
  return [Math.max(1, round(w * scale)), Math.max(1, round(h * scale))];
}

/** The photo's bytes to cut from, and whether they are the original (whose size may sit on its side) or Storage's upright copy. */
async function sourceOf(file: FileMemberRow): Promise<{ bytes: Buffer; original: boolean } | null> {
  const mime = file.mime as FileMime;
  const path = filePathOf(file.tenant_id, file.id, mime);
  const whole = FILE_TYPES[mime] !== "heic" && (file.bytes ?? 0) <= ORIGINAL_MOST_BYTES;
  const read = whole
    ? await bucket().download(path)
    : await bucket().download(path, {
        transform: { width: STORAGE_LARGEST, height: STORAGE_LARGEST, resize: "contain" },
      });
  if (read.error || !read.data) return null;
  return { bytes: Buffer.from(await read.data.arrayBuffer()), original: whole };
}

/** Cut the box the model named from the photo, upright, and enlarge it to read. */
export async function zoomInto(file: FileMemberRow, asked: Box, of: Size): Promise<Zoomed | ZoomWont> {
  const box = boxShown(asked, of);
  if ("wont" in box) return box;
  const source = await sourceOf(file);
  if (!source) return { wont: "the photo could not be read just now" };
  const image = sharp(source.bytes).rotate();
  const meta = await image.metadata();
  if (!meta.width || !meta.height) return { wont: "the photo could not be read just now" };
  // A camera's original says its size on its side; rotate() stands it up, so the box is scaled against the upright size.
  const onItsSide = source.original && (meta.orientation ?? 1) >= 5;
  const [srcW, srcH] = onItsSide ? [meta.height, meta.width] : [meta.width, meta.height];
  const sx = srcW / of[0];
  const sy = srcH / of[1];
  const left = clamp(round(box[0] * sx), 0, srcW - 1);
  const top = clamp(round(box[1] * sy), 0, srcH - 1);
  const width = clamp(round((box[2] - box[0]) * sx), 1, srcW - left);
  const height = clamp(round((box[3] - box[1]) * sy), 1, srcH - top);
  const size = zoomSizeOf([width, height]);
  const bytes = await image
    .extract({ left, top, width, height })
    .resize(size[0], size[1], { fit: "fill", kernel: "lanczos3" })
    .jpeg({ quality: ZOOM_JPEG_QUALITY })
    .toBuffer();
  return { bytes, box, of, size };
}
