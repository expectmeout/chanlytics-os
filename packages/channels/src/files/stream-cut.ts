/**
 * Cloudflare Stream, a cut's parts (the video maker; Stream's playback read against real clips, 10 Nov 2026). Stream never
 * gives a video's original back, and its playback copy is a list of parts: a first part (`#EXT-X-MAP`), then segments of a few
 * seconds. The first part followed by the segments a stretch touches is a playable file that keeps the clip's own clock, so a
 * cut is fetched as those parts and nothing is re-encoded or downloaded whole. This reads which parts, off the two lists.
 *
 * Stream says a clip is ready when its smaller copies exist; its sharpest came minutes later (absent at five minutes, there at
 * twenty-five, for two 1080p clips). A video cut before then would be cut from a softer copy, so the copy asked for here is the
 * full-size one, and where it is not there yet the answer says so. Nothing here knows a row, a workspace or a plan.
 */
import { fetchFromProvider } from "../shared/provider-fetch";
import type { ModelDeps } from "../ai/anthropic";
import { streamManifestUrl } from "./stream";

/** One try's bound for a list: a few KB of text. */
const LIST_TRY_MS = 8_000;
/** The largest copy Stream makes, by its short side: a larger clip's full-size copy is this one. */
const STREAM_SHORT_SIDE_MAX = 1080;

/** One copy of a video, as its playback list names it: its size, and its own list's address. */
export interface StreamRendition {
  width: number;
  height: number;
  url: string;
}

/** A copy's parts: its first part, each segment's address and place in the clip (seconds), and the clip's length by them. */
export interface StreamCopy {
  init: string;
  segments: { url: string; from: number; to: number }[];
  seconds: number;
}

const playlistLinesOf = (list: string): string[] => list.split(/\r?\n/).map((line) => line.trim());
const hundredth = (n: number): number => Math.round(n * 100) / 100;

/** The copies a playback list names, in its order. A list that names none (or is no list) gives none. */
export function streamRenditionsOf(master: string, masterUrl: string): StreamRendition[] {
  const lines = playlistLinesOf(master);
  const copies: StreamRendition[] = [];
  for (const [i, line] of lines.entries()) {
    const size = /^#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+)/.exec(line);
    const address = lines.slice(i + 1).find((next) => next && !next.startsWith("#"));
    if (!size || !address) continue;
    copies.push({ width: Number(size[1]), height: Number(size[2]), url: new URL(address, masterUrl).href });
  }
  return copies;
}

/** A copy's parts, off its own list; null where it has no first part, which only a copy in such parts has. */
export function streamCopyOf(media: string, mediaUrl: string): StreamCopy | null {
  const lines = playlistLinesOf(media);
  const init = /#EXT-X-MAP:URI="([^"]+)"/.exec(media)?.[1];
  if (!init) return null;
  const segments: StreamCopy["segments"] = [];
  let at = 0;
  for (const [i, line] of lines.entries()) {
    const seconds = /^#EXTINF:([\d.]+)/.exec(line)?.[1];
    const address = lines.slice(i + 1).find((next) => next && !next.startsWith("#"));
    if (!seconds || !address) continue;
    const to = hundredth(at + Number(seconds));
    segments.push({ url: new URL(address, mediaUrl).href, from: at, to });
    at = to;
  }
  return segments.length ? { init: new URL(init, mediaUrl).href, segments, seconds: at } : null;
}

/** The parts a stretch needs, in order: the first part, then every segment its seconds touch. */
export function streamCutPartsOf(copy: StreamCopy, from: number, to: number): string[] {
  return [copy.init, ...copy.segments.filter((s) => s.to > from && s.from < to).map((s) => s.url)];
}

/**
 * The full-size copy among those there: the largest, once it is as large as the clip itself (or as large as Stream makes one).
 * Null while the sharpest copy is still being made. A clip whose size was never said is taken at the largest there.
 */
export function streamFullSizeOf(
  copies: readonly StreamRendition[],
  clip: { width: number | null; height: number | null },
): StreamRendition | null {
  const shortSide = (size: { width: number; height: number }) => Math.min(size.width, size.height);
  const largest = [...copies].sort((a, b) => shortSide(b) - shortSide(a))[0];
  if (!largest) return null;
  const known = typeof clip.width === "number" && typeof clip.height === "number" && clip.width > 0 && clip.height > 0;
  if (!known) return largest;
  const wanted = Math.min(shortSide({ width: Number(clip.width), height: Number(clip.height) }), STREAM_SHORT_SIDE_MAX);
  return shortSide(largest) >= wanted ? largest : null;
}

export type StreamCopyRead =
  { ok: true; copy: StreamCopy; width: number; height: number } | { ok: false; why: "unread" | "not_full_size" };

async function listRead(url: string, deps: ModelDeps): Promise<string | null> {
  const reply = await fetchFromProvider(
    "cloudflare",
    url,
    { method: "GET", timeoutMs: LIST_TRY_MS, idempotent: true, tries: 2, stream: true },
    deps,
  );
  if (reply.outcome !== "ok" || !reply.body) return null;
  // A body that will not read is a list not read: null below, and the caller says the copy was unread.
  const list = await new Response(reply.body).text().catch(() => null);
  return list?.includes("#EXTM3U") ? list : null;
}

/** A clip's full-size copy and its parts, under a token: `not_full_size` while Stream is still making it, `unread` on a fault. */
export async function readStreamCopy(
  customerCode: string,
  token: string,
  clip: { width: number | null; height: number | null },
  deps: ModelDeps = {},
): Promise<StreamCopyRead> {
  const masterUrl = streamManifestUrl(customerCode, token);
  const master = await listRead(masterUrl, deps);
  if (master === null) return { ok: false, why: "unread" };
  const full = streamFullSizeOf(streamRenditionsOf(master, masterUrl), clip);
  if (!full) return { ok: false, why: "not_full_size" };
  const media = await listRead(full.url, deps);
  const copy = media === null ? null : streamCopyOf(media, full.url);
  return copy ? { ok: true, copy, width: full.width, height: full.height } : { ok: false, why: "unread" };
}

/** One try's bound for sending a made video's bytes: ten to twenty megabytes, from a server beside Stream's. */
const SEND_TRY_MS = 30_000;

/**
 * A made video's bytes sent to the address a reservation answered (tus, the whole file in one request from its first byte).
 * Not asked twice: a second send to an address that took the first is refused, and whether the first landed is Stream's to
 * say, by its webhook. True when Stream took them.
 */
export async function sendStreamBytes(
  uploadUrl: string,
  bytes: Uint8Array<ArrayBuffer>,
  deps: ModelDeps = {},
): Promise<boolean> {
  const reply = await fetchFromProvider(
    "cloudflare",
    uploadUrl,
    {
      method: "PATCH",
      headers: {
        "tus-resumable": "1.0.0",
        "upload-offset": "0",
        "content-type": "application/offset+octet-stream",
      },
      body: bytes,
      timeoutMs: SEND_TRY_MS,
    },
    deps,
  );
  return reply.outcome === "ok";
}
