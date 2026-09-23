/**
 * The first bytes of real image files, built to a size (00161): what core's mark-image.ts reads a mark's type and
 * size from. Each is the format's own header, laid out as its specification lays it out, followed by padding; no
 * test here needs a picture, only the bytes a browser would read to learn what the picture is.
 */

const u16be = (n) => [(n >> 8) & 0xff, n & 0xff];
const u16le = (n) => [n & 0xff, (n >> 8) & 0xff];
const u24le = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const u32be = (n) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const u32le = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const pad = (bytes, to = 64) => new Uint8Array([...bytes, ...new Array(Math.max(0, to - bytes.length)).fill(0)]);

/** A PNG: its signature, then the IHDR chunk that opens every PNG, width and height big-endian. */
export const png = (w, h, size = 64) =>
  pad(
    [
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...u32be(13),
      ...ascii("IHDR"),
      ...u32be(w),
      ...u32be(h),
      8,
      6,
      0,
      0,
      0,
    ],
    size,
  );

/** A GIF: its version, then the logical screen, width and height little-endian. */
export const gif = (w, h) => pad([...ascii("GIF89a"), ...u16le(w), ...u16le(h), 0xf7, 0, 0]);

/** A JPEG as a camera or an editor writes one: the start, an APP0 (JFIF) segment, then the baseline frame header. */
export const jpeg = (w, h, frame = 0xc0) =>
  pad([
    0xff,
    0xd8,
    0xff,
    0xe0,
    ...u16be(16),
    ...ascii("JFIF"),
    0,
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0xff,
    frame,
    ...u16be(17),
    8,
    ...u16be(h),
    ...u16be(w),
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ]);

/** A lossy WebP: RIFF, then a VP8 key frame's tag, its start code, and fourteen bits of each side. */
export const webpLossy = (w, h) =>
  pad([
    ...ascii("RIFF"),
    ...u32le(50),
    ...ascii("WEBP"),
    ...ascii("VP8 "),
    ...u32le(30),
    0,
    0,
    0,
    0x9d,
    0x01,
    0x2a,
    ...u16le(w),
    ...u16le(h),
  ]);

/** A lossless WebP: RIFF, then VP8L's signature byte and each side less one, packed in fourteen bits apiece. */
export const webpLossless = (w, h) => {
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  return pad([...ascii("RIFF"), ...u32le(50), ...ascii("WEBP"), ...ascii("VP8L"), ...u32le(30), 0x2f, ...u32le(bits)]);
};

/** An extended WebP: RIFF, then VP8X's flags and the canvas, each side less one in twenty-four bits. */
export const webpExtended = (w, h) =>
  pad([
    ...ascii("RIFF"),
    ...u32le(50),
    ...ascii("WEBP"),
    ...ascii("VP8X"),
    ...u32le(10),
    0x10,
    0,
    0,
    0,
    ...u24le(w - 1),
    ...u24le(h - 1),
  ]);

/** An icon file: its header, then one sixteen-byte entry per image in it. A side of 256 is written as 0. */
export const ico = (...sides) =>
  pad(
    [
      0,
      0,
      1,
      0,
      ...u16le(sides.length),
      ...sides.flatMap((s, n) => [
        s >= 256 ? 0 : s,
        s >= 256 ? 0 : s,
        0,
        0,
        ...u16le(1),
        ...u16le(32),
        ...u32le(1000),
        ...u32le(6 + sides.length * 16 + n * 1000),
      ]),
    ],
    6 + sides.length * 16 + 8,
  );

/** What a site answers for an address that is not an image: its error page. */
export const notAnImage = new TextEncoder().encode("<!doctype html><title>Not found</title>");
/** An SVG, which a browser draws and we do not keep. */
export const svg = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"></svg>`);
/** A HEIC, which one browser draws. */
export const heic = pad([0, 0, 0, 0x18, ...ascii("ftypheic"), 0, 0, 0, 0, ...ascii("mif1heic")]);
