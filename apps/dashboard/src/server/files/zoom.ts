/**
 * A box of a photo, enlarged, for Ask to look closer (decision 0099, Ask's eyes): small words on a sign, a face, a corner it is not
 * sure of. The model names the box in the pixels of the picture as it was shown, and the box is cut from the best source there is:
 * the original where the code can read it, and Storage's largest copy for a HEIC or a photo too heavy to hold. How a box is held
 * and enlarged is contracts files/zoom.ts, which a video's frame is cut by too (on the edge, where its frames are fetched). The
 * pixels never leave the dashboard but as the picture the edge keeps for the turn (copies.ts).
 */
import "server-only";
import sharp from "sharp";
import {
  FILE_TYPES,
  ZOOM_JPEG_QUALITY,
  boxInSource,
  boxShown,
  filePathOf,
  zoomSizeOf,
  type FileMime,
  type ZoomBox,
  type ZoomSize,
  type ZoomWont,
} from "@chanlytics/contracts";
import type { FileMemberRow } from "@chanlytics/db";
import { bucket } from "./file";

/** An original past this is read as Storage's largest copy instead, as a HEIC always is: the code reads neither whole. */
const ORIGINAL_MOST_BYTES = 12_000_000;
const STORAGE_LARGEST = 2500;

export interface Zoomed {
  bytes: Buffer;
  /** The box as it was cut, in the pixels of the size the picture was shown at: clamped to its edges, and widened where it was too small. */
  box: ZoomBox;
  /** The size it was shown at. */
  of: ZoomSize;
  /** The size the cut is shown at now. */
  size: ZoomSize;
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
export async function zoomInto(file: FileMemberRow, asked: ZoomBox, of: ZoomSize): Promise<Zoomed | ZoomWont> {
  const box = boxShown(asked, of);
  if ("wont" in box) return box;
  const source = await sourceOf(file);
  if (!source) return { wont: "the photo could not be read just now" };
  const image = sharp(source.bytes).rotate();
  const meta = await image.metadata();
  if (!meta.width || !meta.height) return { wont: "the photo could not be read just now" };
  // A camera's original says its size on its side; rotate() stands it up, so the box is scaled against the upright size.
  const onItsSide = source.original && (meta.orientation ?? 1) >= 5;
  const cut = boxInSource(box, of, onItsSide ? [meta.height, meta.width] : [meta.width, meta.height]);
  const size = zoomSizeOf([cut.width, cut.height]);
  const bytes = await image
    .extract(cut)
    .resize(size[0], size[1], { fit: "fill", kernel: "lanczos3" })
    .jpeg({ quality: ZOOM_JPEG_QUALITY })
    .toBuffer();
  return { bytes, box, of, size };
}
