/**
 * The workspace's logo as the server keeps it (00407): never the bytes that were sent, but a PNG remade from their
 * pixels.
 *
 * The page makes the picture (contracts logo/layout.ts), but anyone can send bytes to the save, so nothing is assumed of
 * them. A header read alone (core's imageHeaderOf) is not enough to keep a file on our own origin: a PNG that says it is
 * 256 pixels square can carry anything after its end, in a text chunk, or as an unbounded stream. So the server reads
 * the whole file, chunk by chunk, each against its CRC: a square, eight bits a channel, grey or truecolour with or
 * without alpha, between LOGO_SIDE_MIN and LOGO_SIDE, not interlaced, its picture data inflated to exactly the size its
 * header implies and not a byte past it, every row's filter one PNG knows, and nothing after its end. Then it writes a
 * new file of its own: the header, the pixels deflated again, the end. What a chunk the encoder added said (a colour
 * profile, a text chunk, a timestamp) is dropped; what the picture looks like is kept. No image library: node:zlib and
 * the PNG format's own rules, which are short.
 */
import "server-only";
import { deflateSync, inflateSync } from "node:zlib";
import { LOGO_BYTES_MAX, LOGO_SIDE, LOGO_SIDE_MIN } from "@chanlytics/contracts";

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

/** How many bytes a pixel is, by colour type: grey, truecolour, grey with alpha, truecolour with alpha. */
const BYTES_PER_PIXEL: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** Why a file is not kept, for the refusal's words. */
type LogoRefusal = "not_png" | "broken" | "shape" | "too_heavy";

type RemadeLogo = { ok: true; png: Uint8Array; side: number } | { ok: false; why: LogoRefusal };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The PNG format's CRC-32, over the chunk's type and data. */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  // The table has 256 entries and the index is a byte: the fallback is never read.
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Four bytes as the format writes a number, most significant first; the caller has held `at` inside the bytes. */
const u32 = (b: Uint8Array, at: number): number => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(at);

/** One chunk as the format writes it: length, type, data, and the CRC of the type and the data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

interface Header {
  side: number;
  colourType: number;
  bytesPerPixel: number;
}

/** The header's thirteen bytes, held to the one shape kept; null for anything else. */
function headerOf(data: Uint8Array): Header | null {
  if (data.length !== 13) return null;
  const width = u32(data, 0);
  const height = u32(data, 4);
  // Thirteen bytes were counted above; a missing one would be -1, which no check below lets through.
  const [depth = -1, colourType = -1, compression = -1, filter = -1, interlace = -1] = data.subarray(8, 13);
  const bytesPerPixel = BYTES_PER_PIXEL[colourType];
  if (width !== height || width < LOGO_SIDE_MIN || width > LOGO_SIDE) return null;
  if (depth !== 8 || bytesPerPixel === undefined) return null;
  if (compression !== 0 || filter !== 0 || interlace !== 0) return null;
  return { side: width, colourType, bytesPerPixel };
}

/** The file's chunks walked to its end: its header and its picture data, or why it is not one PNG of the kept shape. */
function walk(bytes: Uint8Array): { header: Header; idat: Uint8Array[] } | LogoRefusal {
  if (bytes.length < SIGNATURE.length + 12 || SIGNATURE.some((v, i) => bytes[i] !== v)) return "not_png";
  let at = SIGNATURE.length;
  let header: Header | null = null;
  const idat: Uint8Array[] = [];
  let idatClosed = false;
  for (;;) {
    if (at + 12 > bytes.length) return "broken";
    const length = u32(bytes, at);
    if (length > bytes.length - at - 12) return "broken";
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (!/^[A-Za-z]{4}$/.test(type)) return "broken";
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (crc32(bytes.subarray(at + 4, at + 8 + length)) !== u32(bytes, at + 8 + length)) return "broken";
    const first = at === SIGNATURE.length;
    at += 12 + length;
    if (first !== (type === "IHDR")) return "broken";
    if (type === "IHDR") {
      header = headerOf(data);
      if (!header) return "shape";
    } else if (type === "IDAT") {
      if (idatClosed) return "broken";
      idat.push(data);
    } else {
      if (idat.length) idatClosed = true;
      if (type === "IEND") {
        // The end is the end: nothing may follow it, and it says nothing.
        if (length !== 0 || at !== bytes.length) return "broken";
        break;
      }
      // A chunk the format calls critical that is not one of the three: a palette, or something no decoder must skip.
      if (/^[A-Z]/.test(type)) return "shape";
    }
  }
  if (!header || !idat.length) return "broken";
  return { header, idat };
}

/** The pixels' filtered rows, inflated to exactly the size the header implies, every row's filter one PNG knows. */
function scanlinesOf(header: Header, idat: Uint8Array[]): Uint8Array | null {
  const stride = 1 + header.side * header.bytesPerPixel;
  const expected = stride * header.side;
  let raw: Uint8Array;
  try {
    // One byte more than the picture may hold: a stream that inflates past it is not this picture, and stops there.
    raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expected + 1 });
  } catch {
    return null;
  }
  if (raw.length !== expected) return null;
  for (let row = 0; row < header.side; row++) {
    const filter = raw[row * stride];
    if (filter === undefined || filter > 4) return null;
  }
  return raw;
}

/**
 * The file kept for a workspace's logo, remade from the one sent; or why it is not kept. Never throws: whatever arrives
 * is either a square PNG of the kept shape, remade, or a refusal.
 */
export function remadeLogo(bytes: Uint8Array): RemadeLogo {
  if (bytes.length > LOGO_BYTES_MAX) return { ok: false, why: "too_heavy" };
  const walked = walk(bytes);
  if (typeof walked === "string") return { ok: false, why: walked };
  const raw = scanlinesOf(walked.header, walked.idat);
  if (!raw) return { ok: false, why: "broken" };
  const { side, colourType } = walked.header;
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, side);
  view.setUint32(4, side);
  ihdr.set([8, colourType, 0, 0, 0], 8);
  const parts = [
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  if (png.length > LOGO_BYTES_MAX) return { ok: false, why: "too_heavy" };
  return { ok: true, png, side };
}
