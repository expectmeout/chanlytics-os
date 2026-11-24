/**
 * A made file's bytes measured from its own header (channels files/media-measure.ts), for its places' checks: an MP4's
 * boxes (its length, its picture's size, codec and frame rate, its sound track), a JPEG's and a PNG's size. The files here
 * are laid out box by box as an encoder writes them (ISO/IEC 14496-12), the fields at the offsets the standard gives.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { measureMedia } = await import(
  pathToFileURL(path.join(ROOT, "packages/channels/src/files/media-measure.ts")).href
);

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0));
const zeros = (n) => Array(n).fill(0);
const box = (type, ...content) => {
  const body = content.flat();
  return [...u32(8 + body.length), ...ascii(type), ...body];
};
/** A media header (mvhd or mdhd, version 0): flags, two times, the timescale, the duration, then the rest. */
const header = (type, scale, duration, rest) => box(type, zeros(12), u32(scale), u32(duration), zeros(rest));
/** A track: its handler, its one sample entry, its timescale and length, and its samples in one run. */
const trak = (handler, entry, scale, duration, samples) =>
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
const avc1 = (w, h) => box("avc1", zeros(6), u16(1), zeros(16), u16(w), u16(h), zeros(50));
const mp4a = (channels, rate) =>
  box("mp4a", zeros(6), u16(1), zeros(8), u16(channels), u16(16), zeros(4), u16(rate), zeros(2));

/** A made video as the machine draws one: 12 seconds at 30 a second, 1080x1920, with or without a sound track. */
function movie({ brand = "isom", sound = null } = {}) {
  const tracks = [trak("vide", avc1(1080, 1920), 15360, 12 * 15360, 360)];
  if (sound) tracks.push(trak("soun", mp4a(sound.channels, sound.rate), sound.rate, 12 * sound.rate, 12 * 47));
  const moov = box("moov", header("mvhd", 1000, 12_000, 80), ...tracks);
  return Uint8Array.from([...box("ftyp", ascii(brand), zeros(4)), ...moov, ...box("mdat", zeros(64))]);
}

test("a made video's length, size, codec and frame rate are read from its boxes; no sound track says none", () => {
  const m = measureMedia(movie());
  assert.deepEqual(
    { ...m, bytes: undefined },
    {
      media: "video",
      format: "mp4",
      bytes: undefined,
      width: 1080,
      height: 1920,
      seconds: 12,
      fps: 30,
      codec: "h264",
      sound: null,
      lufs: null,
    },
  );
  assert.ok(m.bytes > 0);
});

test("a sound track is read with its codec, its rate and its channels; a QuickTime file says MOV", () => {
  const m = measureMedia(movie({ brand: "qt  ", sound: { channels: 2, rate: 48_000 } }));
  assert.equal(m.format, "mov");
  assert.deepEqual(m.sound, { codec: "aac", channels: 2, rate: 48_000 });
});

test("a JPEG's size from its frame header, past the tables before it; a PNG's from its first lines", () => {
  const jpeg = Uint8Array.from([
    0xff,
    0xd8,
    // A table that shares the frame headers' numbers (DHT, 0xC4) is passed over.
    0xff,
    0xc4,
    ...u16(4),
    0,
    0,
    0xff,
    0xc0,
    ...u16(17),
    8,
    ...u16(1350),
    ...u16(1080),
    3,
    ...zeros(9),
    0xff,
    0xd9,
  ]);
  assert.deepEqual(measureMedia(jpeg), {
    media: "picture",
    format: "jpeg",
    bytes: jpeg.length,
    width: 1080,
    height: 1350,
    seconds: null,
    fps: null,
    codec: null,
    sound: null,
    lufs: null,
  });
  const png = Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32(13),
    ...ascii("IHDR"),
    ...u32(1200),
    ...u32(900),
    8,
    2,
    0,
    0,
    0,
  ]);
  const p = measureMedia(png);
  assert.deepEqual([p.format, p.width, p.height], ["png", 1200, 900]);
});

test("bytes no header names are `other`, and a box that runs past the file ends the reading, never a throw", () => {
  assert.equal(measureMedia(Uint8Array.from(ascii("hello world, nothing here"))).format, "other");
  const cut = movie().subarray(0, 60);
  const m = measureMedia(cut);
  assert.equal(m.media, "video");
  assert.equal(m.seconds, null);
});
