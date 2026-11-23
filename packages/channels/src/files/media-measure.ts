/**
 * A made file's bytes measured, for its places' checks (the content loop PRD's 11; contracts content/making/renditions.ts):
 * what it is, how large and how long, its codec and frame rate, and its sound track. Read from the file's own header, in
 * the bytes already in hand where a video is kept and where an approval sums its shapes: no ffprobe on the edge, nothing
 * fetched. An MP4's boxes (ISO/IEC 14496-12) and a JPEG's or a PNG's first lines; what a file does not say is null.
 */
import type { MediaMeasured } from "@chanlytics/contracts";

/** A box: its four-letter type, and where its content starts and ends in the file. */
interface Box {
  type: string;
  start: number;
  end: number;
}

/** The boxes inside a stretch of the file, in order; a box that runs past its parent ends the reading there. */
function boxesIn(bytes: Uint8Array, view: DataView, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    let head = 8;
    if (size === 1 && at + 16 <= end) {
      size = Number(view.getBigUint64(at + 8));
      head = 16;
    } else if (size === 0) size = end - at;
    if (size < head || at + size > end) break;
    boxes.push({ type, start: at + head, end: at + size });
    at += size;
  }
  return boxes;
}

const child = (bytes: Uint8Array, view: DataView, box: Box | undefined, type: string): Box | undefined =>
  box ? boxesIn(bytes, view, box.start, box.end).find((b) => b.type === type) : undefined;

/** A media header's timescale and duration (mvhd, mdhd: version 0 holds them in four bytes, version 1 in eight). */
function timeOf(view: DataView, box: Box | undefined): { scale: number; duration: number } | null {
  if (!box || box.end - box.start < 24) return null;
  const v1 = view.getUint8(box.start) === 1;
  const scale = view.getUint32(box.start + (v1 ? 20 : 12));
  const duration = v1 ? Number(view.getBigUint64(box.start + 24)) : view.getUint32(box.start + 16);
  return scale > 0 ? { scale, duration } : null;
}

const VIDEO_CODECS: Readonly<Record<string, "h264" | "hevc">> = {
  avc1: "h264",
  avc3: "h264",
  hvc1: "hevc",
  hev1: "hevc",
};

/** One track: its kind (vide or soun), its sample entry, its own length, and how many samples it holds. */
interface Track {
  handler: string;
  entry: Box | undefined;
  time: { scale: number; duration: number } | null;
  samples: number;
}

function trackOf(bytes: Uint8Array, view: DataView, trak: Box): Track {
  const mdia = child(bytes, view, trak, "mdia");
  const hdlr = child(bytes, view, mdia, "hdlr");
  const handler = hdlr ? String.fromCharCode(...bytes.subarray(hdlr.start + 8, hdlr.start + 12)) : "";
  const stbl = child(bytes, view, child(bytes, view, mdia, "minf"), "stbl");
  const stsd = child(bytes, view, stbl, "stsd");
  const entry = stsd ? boxesIn(bytes, view, stsd.start + 8, stsd.end)[0] : undefined;
  const stts = child(bytes, view, stbl, "stts");
  let samples = 0;
  if (stts) {
    const count = view.getUint32(stts.start + 4);
    for (let i = 0; i < count && stts.start + 8 + i * 8 + 8 <= stts.end; i++)
      samples += view.getUint32(stts.start + 8 + i * 8);
  }
  return { handler, entry, time: timeOf(view, child(bytes, view, mdia, "mdhd")), samples };
}

/** An MP4 or a MOV, read from its boxes. */
function measuredMovie(bytes: Uint8Array): MediaMeasured {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = boxesIn(bytes, view, 0, bytes.length);
  const brand = top[0]?.type === "ftyp" ? String.fromCharCode(...bytes.subarray(top[0].start, top[0].start + 4)) : "";
  const moov = top.find((b) => b.type === "moov");
  const tracks = moov ? boxesIn(bytes, view, moov.start, moov.end).filter((b) => b.type === "trak") : [];
  const read = tracks.map((t) => trackOf(bytes, view, t));
  const picture = read.find((t) => t.handler === "vide");
  const sound = read.find((t) => t.handler === "soun");
  const movie = timeOf(view, child(bytes, view, moov, "mvhd"));
  const own = picture?.time;
  const seconds = movie ? movie.duration / movie.scale : own ? own.duration / own.scale : null;
  const e = picture?.entry;
  const a = sound?.entry;
  return {
    media: "video",
    format: brand === "qt  " ? "mov" : "mp4",
    bytes: bytes.length,
    width: e && e.end - e.start >= 28 ? view.getUint16(e.start + 24) : null,
    height: e && e.end - e.start >= 28 ? view.getUint16(e.start + 26) : null,
    seconds: seconds === null ? null : Math.round(seconds * 100) / 100,
    fps:
      own && picture.samples > 0 && own.duration > 0
        ? Math.round((picture.samples * own.scale * 100) / own.duration) / 100
        : null,
    codec: e ? (VIDEO_CODECS[e.type] ?? "other") : null,
    sound: a
      ? {
          codec: a.type === "mp4a" ? "aac" : "other",
          channels: a.end - a.start >= 28 ? view.getUint16(a.start + 16) : null,
          rate: a.end - a.start >= 28 ? view.getUint16(a.start + 24) : null,
        }
      : null,
    lufs: null,
  };
}

/** A JPEG's size, from its first frame header (SOF0 to SOF15, not the tables that share their numbers). */
function jpegSize(view: DataView): { width: number; height: number } | null {
  let at = 2;
  while (at + 9 < view.byteLength) {
    if (view.getUint8(at) !== 0xff) return null;
    const marker = view.getUint8(at + 1);
    const length = view.getUint16(at + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    at += 2 + length;
  }
  return null;
}

const picture = (format: MediaMeasured["format"], bytes: number, size: { width: number; height: number } | null) => ({
  media: "picture" as const,
  format,
  bytes,
  width: size?.width ?? null,
  height: size?.height ?? null,
  seconds: null,
  fps: null,
  codec: null,
  sound: null,
  lufs: null,
});

/** A file's bytes, measured: a video by its boxes, a picture by its header; a kind neither says is `other`. */
export function measureMedia(bytes: Uint8Array): MediaMeasured {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const head = String.fromCharCode(...bytes.subarray(4, 8));
  if (head === "ftyp") return measuredMovie(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return picture("jpeg", bytes.length, jpegSize(view));
  if (bytes[0] === 0x89 && head.startsWith("\x0d\x0a\x1a") && bytes.length >= 24)
    return picture("png", bytes.length, { width: view.getUint32(16), height: view.getUint32(20) });
  if (
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  )
    return picture("webp", bytes.length, null);
  return picture("other", bytes.length, null);
}
