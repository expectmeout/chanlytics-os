/**
 * The mark we keep (D6, 00161): the bytes of a business's logo, judged before we store a copy.
 *
 * mark.ts reads WHICH address a site calls its mark; this file reads what came back from it. A logo drawn straight off
 * the business's own site never shows: the dashboard's content policy lets images in from three hosts, and a hundred
 * shops' sites are a hundred more. So the collect asks for the bytes once, and a copy we hold is what every row draws.
 *
 * Before a copy is kept it has to be an image a browser draws, big enough to be sharp in a tile, and not a banner:
 *   - PNG, JPEG, WebP, GIF or ICO, read from the bytes themselves and never from what the server called them. An SVG
 *     can carry script and a HEIC draws in one browser, so neither is kept.
 *   - Its shorter side at least MARK_MIN_SIDE: the peek draws the mark at 96px, and on a phone's screen that is 288
 *     pixels of glass. A sixteen-pixel favicon blown up to that is mush, and the photograph under it is better.
 *   - Its longer side at most MARK_MAX_RATIO times the shorter: a wordmark four times as wide as it is tall is a thin
 *     line inside a square tile. The page's next candidate (a home-screen icon, which is square) is tried instead.
 *   - No more than MARK_MAX_BYTES: a logo is a few kilobytes, and a megabyte "logo" is a photograph.
 *
 * Nothing here decodes an image. Each format says its size in its first few dozen bytes, and those are all we read.
 */

export type MarkKind = "png" | "jpg" | "webp" | "gif" | "ico";

export interface MarkImage {
  kind: MarkKind;
  /** What the copy is served as: ours, from the bytes, never the site's header. */
  contentType: string;
  width: number;
  height: number;
}

export const MARK_MIN_SIDE = 64;
export const MARK_MAX_RATIO = 2;
export const MARK_MAX_BYTES = 512 * 1024;

const CONTENT_TYPE: Record<MarkKind, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  ico: "image/x-icon",
};

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const u32le = (b: Uint8Array, i: number) => ((b[i + 3] << 24) >>> 0) + ((b[i + 2] << 16) | (b[i + 1] << 8) | b[i]);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function png(b: Uint8Array): [number, number] | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || sig.some((x, i) => b[i] !== x) || ascii(b, 12, 4) !== "IHDR") return null;
  return [u32be(b, 16), u32be(b, 20)];
}

function gif(b: Uint8Array): [number, number] | null {
  if (b.length < 10 || !/^GIF8[79]a$/.test(ascii(b, 0, 6))) return null;
  return [u16le(b, 6), u16le(b, 8)];
}

function webp(b: Uint8Array): [number, number] | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);
  // Lossy: a key frame's start code, then fourteen bits of each side.
  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return [u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff];
  }
  // Lossless: a signature byte, then each side less one in fourteen bits.
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = u32le(b, 21);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  // Extended: the canvas, each side less one in twenty-four bits.
  if (chunk === "VP8X") return [u24le(b, 24) + 1, u24le(b, 27) + 1];
  return null;
}

/** A JPEG says its size in its frame header, after however many segments come first; walk them to it. */
function jpg(b: Uint8Array): [number, number] | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1; // a fill byte
      continue;
    }
    // Markers that stand alone, with no length after them.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // the image ended, or its data began, before any frame
    const len = u16be(b, i + 2);
    if (len < 2) return null;
    const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (frame) return i + 8 < b.length ? [u16be(b, i + 7), u16be(b, i + 5)] : null;
    i += 2 + len;
  }
  return null;
}

/** An icon file is a directory of images; the biggest one is what a browser draws when it is asked to draw big. */
function ico(b: Uint8Array): [number, number] | null {
  if (b.length < 22 || b[0] !== 0 || b[1] !== 0 || b[2] !== 1 || b[3] !== 0) return null;
  const count = u16le(b, 4);
  if (count < 1 || count > 64 || 6 + count * 16 > b.length) return null;
  let best: [number, number] | null = null;
  for (let n = 0; n < count; n += 1) {
    const at = 6 + n * 16;
    const w = b[at] || 256;
    const h = b[at + 1] || 256;
    if (!best || Math.min(w, h) > Math.min(...best)) best = [w, h];
  }
  return best;
}

const READERS: [MarkKind, (b: Uint8Array) => [number, number] | null][] = [
  ["png", png],
  ["jpg", jpg],
  ["webp", webp],
  ["gif", gif],
  ["ico", ico],
];

/** What the bytes are and how big they say they are, or null for anything that is not one of the five. */
export function imageHeaderOf(bytes: Uint8Array): MarkImage | null {
  for (const [kind, read] of READERS) {
    const size = read(bytes);
    if (size) return { kind, contentType: CONTENT_TYPE[kind], width: size[0], height: size[1] };
  }
  return null;
}

/** The image worth keeping as this lead's mark, or null: the three rules above, over the bytes as they came. */
export function markImageFrom(bytes: Uint8Array): MarkImage | null {
  if (!bytes || bytes.length === 0 || bytes.length > MARK_MAX_BYTES) return null;
  const image = imageHeaderOf(bytes);
  if (!image) return null;
  const short = Math.min(image.width, image.height);
  const long = Math.max(image.width, image.height);
  if (short < MARK_MIN_SIDE || long > short * MARK_MAX_RATIO) return null;
  return image;
}
