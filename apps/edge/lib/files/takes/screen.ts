/**
 * The screen (the footage sources plan, "Taking a file in", step 1): what an item is and whether it may be taken, from
 * its provider's own record alone, before any bytes move. Free: a file over the caps is never downloaded to learn it.
 *
 * A photo or a video of a kind a member may add is taken. A video over ten minutes or 500 MB, or a photo over 25 MB,
 * is `too_big`, with which; anything else is `not_media`. A video whose provider has not said its length yet waits
 * (Drive: it "may not be available immediately upon upload"); a day after it was first seen it is screened by its size
 * alone.
 */
import {
  FILE_BYTES_MAX,
  FILE_IMAGE_MIMES,
  FILE_VIDEO_BYTES_MAX,
  FILE_VIDEO_SECONDS_MAX,
  isOneOf,
  isVideoMime,
  type FileImageMime,
  type FileVideoMime,
  type SourceItemRecord,
} from "@chanlytics/contracts";
import { TAKE_LENGTH_WAIT_MS } from "./budgets.js";

/** What the screen says of an item. */
type Screened =
  | { fate: "photo"; mime: FileImageMime; bytes: number }
  | { fate: "video"; mime: FileVideoMime; bytes: number; seconds: number | null }
  | { fate: "not_media"; why: "kind" | "empty" }
  | { fate: "too_big"; why: "bytes" | "seconds" }
  | { fate: "wait"; why: "length" }
  /** In its provider's bin: the sync's to say where it went, never the take's. */
  | { fate: "away" };

/** An item judged by its provider's record; `firstSeenAt` is when the sync first listed it. */
export function screenItem(record: SourceItemRecord, firstSeenAt: string, nowMs: number): Screened {
  if (record.trashed) return { fate: "away" };
  const bytes = record.bytes ?? 0;
  if (isVideoMime(record.mime)) {
    if (bytes <= 0) return { fate: "not_media", why: "empty" };
    if (bytes > FILE_VIDEO_BYTES_MAX) return { fate: "too_big", why: "bytes" };
    if (record.seconds !== null && record.seconds > FILE_VIDEO_SECONDS_MAX) return { fate: "too_big", why: "seconds" };
    if (record.seconds === null && nowMs - Date.parse(firstSeenAt) < TAKE_LENGTH_WAIT_MS)
      return { fate: "wait", why: "length" };
    return { fate: "video", mime: record.mime, bytes, seconds: record.seconds };
  }
  if (isOneOf(FILE_IMAGE_MIMES, record.mime)) {
    if (bytes <= 0) return { fate: "not_media", why: "empty" };
    if (bytes > FILE_BYTES_MAX) return { fate: "too_big", why: "bytes" };
    return { fate: "photo", mime: record.mime, bytes };
  }
  return { fate: "not_media", why: "kind" };
}
