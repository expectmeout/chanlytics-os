/**
 * The workspace's logo as the server keeps it (00407): never the bytes that were sent, but a PNG remade from their
 * pixels. In channels since decision 0075 (a file format, as the email's text is), where the dashboard's save and the
 * website read both make the picture; core may not hold a value of node's own.
 *
 * The page makes the picture (contracts logo/layout.ts), but anyone can send bytes to the save, and a site's own icon
 * is nobody's promise, so nothing is assumed of them. A header read alone (imageHeaderOf) is not enough to keep a file
 * on our own origin: a PNG that says it is 256 pixels square can carry anything after its end, in a text chunk, or as
 * an unbounded stream. So this reads the whole file, chunk by chunk, each against its CRC: a square, eight bits a
 * channel, grey or truecolour with or without alpha, from LOGO_SIDE_MIN up to LOGO_FOUND_SIDE_MAX on a side, not
 * interlaced, its picture data inflated to exactly the size its header implies and not a byte past it, every row's
 * filter one PNG knows, and nothing after its end. A square bigger than LOGO_SIDE has its filters undone and is shrunk
 * to LOGO_SIDE by averaging. Then it writes a new file of its own: the header, the pixels deflated again, the end. What
 * a chunk the encoder added said (a colour profile, a text chunk, a timestamp) is dropped; what the picture looks like
 * is kept. No image library: node:zlib and the PNG format's own rules, which are short.
 */
import { deflateSync, inflateSync } from "node:zlib";
import { LOGO_BYTES_MAX, LOGO_FOUND_SIDE_MAX, LOGO_SIDE, LOGO_SIDE_MIN } from "@chanlytics/contracts";

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
  if (width !== height || width < LOGO_SIDE_MIN || width > LOGO_FOUND_SIDE_MAX) return null;
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

/** The pixels, the filters undone: what each row's bytes are, not how they were predicted (PNG's five filters). */
function unfiltered(raw: Uint8Array, h: Header): Uint8Array {
  const stride = h.side * h.bytesPerPixel;
  const out = new Uint8Array(stride * h.side);
  const bpp = h.bytesPerPixel;
  for (let y = 0; y < h.side; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? (row[x - bpp] ?? 0) : 0;
      const b = prev ? (prev[x] ?? 0) : 0;
      const c = prev && x >= bpp ? (prev[x - bpp] ?? 0) : 0;
      let v = src[x] ?? 0;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[x] = v & 0xff;
    }
  }
  return out;
}

/** A square of pixels made `to` a side by averaging each block it covers; rows written unfiltered (filter 0). */
function shrunk(pixels: Uint8Array, h: Header, to: number): Uint8Array {
  const bpp = h.bytesPerPixel;
  const out = new Uint8Array((1 + to * bpp) * to);
  const f = h.side / to;
  for (let y = 0; y < to; y++) {
    const y0 = Math.floor(y * f);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * f));
    for (let x = 0; x < to; x++) {
      const x0 = Math.floor(x * f);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * f));
      for (let ch = 0; ch < bpp; ch++) {
        let sum = 0;
        for (let yy = y0; yy < y1; yy++)
          for (let xx = x0; xx < x1; xx++) sum += pixels[(yy * h.side + xx) * bpp + ch] ?? 0;
        out[y * (1 + to * bpp) + 1 + x * bpp + ch] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
      }
    }
  }
  return out;
}

/**
 * The file kept for a workspace's logo, remade from the one sent; or why it is not kept. Never throws: whatever arrives
 * is either a square PNG of the kept shape, remade (and shrunk to LOGO_SIDE where it was bigger), or a refusal.
 * `inputMax` is the most that is read: the save's own limit by default; a found icon's (LOGO_FOUND_MAX_BYTES) for the
 * website read, whose picture shrinks under LOGO_BYTES_MAX or is refused.
 */
export function remadeLogo(bytes: Uint8Array, opts: { inputMax?: number } = {}): RemadeLogo {
  if (bytes.length > (opts.inputMax ?? LOGO_BYTES_MAX)) return { ok: false, why: "too_heavy" };
  const walked = walk(bytes);
  if (typeof walked === "string") return { ok: false, why: walked };
  const raw = scanlinesOf(walked.header, walked.idat);
  if (!raw) return { ok: false, why: "broken" };
  const { header } = walked;
  const fits = header.side <= LOGO_SIDE;
  const rows = fits ? raw : shrunk(unfiltered(raw, header), header, LOGO_SIDE);
  const side = fits ? header.side : LOGO_SIDE;
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, side);
  view.setUint32(4, side);
  ihdr.set([8, header.colourType, 0, 0, 0], 8);
  const parts = [
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(rows, { level: 9 }))),
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
