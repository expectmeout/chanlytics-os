/**
 * A made file's bytes as the bucket holds them, the fields a reader of its header reads at the offsets its standard
 * gives (ISO/IEC 14496-12 for an MP4, JFIF for a JPEG): what a test's storage hands back where the code measures what it
 * sends (channels files/media-measure.ts). `tag` rides inside, so two tenants' bytes sum apart.
 */
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
const zeros = (n) => Array(n).fill(0);
const box = (type, ...content) => {
  const body = content.flat();
  return [...u32(8 + body.length), ...ascii(type), ...body];
};
const header = (type, scale, duration, rest) => box(type, zeros(12), u32(scale), u32(duration), zeros(rest));

/** A box layout's helpers, for a test that lays out a file of its own. */
export const BOXES = { u32, u16, ascii, zeros, box, header };

/** A track: its handler, its one sample entry, its timescale and length, and its samples in one run. */
export const trakOf = (handler, entry, scale, duration, samples) =>
  box(
    "trak",
    box(
      "mdia",
      header("mdhd", scale, duration, 4),
      box("hdlr", zeros(8), ascii(handler), zeros(12)),
      box(
        "minf",
        box(
          "stbl",
          box("stsd", zeros(4), u32(1), entry),
          box("stts", zeros(4), u32(1), u32(samples), u32(Math.round(duration / samples))),
        ),
      ),
    ),
  );

/** A made video as the machine draws one: 1080x1920 H.264 at 30 a second, `seconds` long, no sound track. */
export function madeVideoBytes({ seconds = 12, tag = "" } = {}) {
  const avc1 = box("avc1", zeros(6), u16(1), zeros(16), u16(1080), u16(1920), zeros(50));
  const moov = box(
    "moov",
    header("mvhd", 1000, Math.round(seconds * 1000), 80),
    trakOf("vide", avc1, 15360, Math.round(seconds * 15360), Math.round(seconds * 30)),
  );
  return Buffer.from([...box("ftyp", ascii("isom"), zeros(4)), ...moov, ...box("mdat", ascii(tag))]);
}

/** A made post's shape as make.ts draws it: a JPEG of 1080 by 1350. */
export function madeJpegBytes({ width = 1080, height = 1350, tag = "" } = {}) {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    ...u16(17),
    8,
    ...u16(height),
    ...u16(width),
    3,
    ...zeros(9),
    ...ascii(tag),
    0xff,
    0xd9,
  ]);
}
