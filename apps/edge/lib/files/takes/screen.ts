/**
 * The screen (the footage sources plan, "Taking a file in", step 1): what an item is and whether it may be taken, from
 * its provider's own record alone, before any bytes move. Free: a file over the caps is never downloaded to learn it.
 *
 * A photo or a video of a kind a member may add is taken. A video over ten minutes or 500 MB, or a photo over 25 MB,
 * is `too_big`, with which; anything else is `not_media`. A video whose provider has not said its length is screened
 * by its size alone: the wait for a fresh upload's length is the sync's (source_items.length_until), and an item is
 * handed its take only once that wait is over or the length has come (00643 source_takes_hand_out).
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

/** What the screen says of an item. */
type Screened =
  | { fate: "photo"; mime: FileImageMime; bytes: number }
  | { fate: "video"; mime: FileVideoMime; bytes: number; seconds: number | null }
  | { fate: "not_media"; why: "kind" | "empty" }
  | { fate: "too_big"; why: "bytes" | "seconds" }
  /** In its provider's bin: the sync's to say where it went, never the take's. */
  | { fate: "away" };

/** An item judged by its provider's record. */
export function screenItem(record: SourceItemRecord): Screened {
  if (record.trashed) return { fate: "away" };
  const bytes = record.bytes ?? 0;
  if (isVideoMime(record.mime)) {
    if (bytes <= 0) return { fate: "not_media", why: "empty" };
    if (bytes > FILE_VIDEO_BYTES_MAX) return { fate: "too_big", why: "bytes" };
    if (record.seconds !== null && record.seconds > FILE_VIDEO_SECONDS_MAX) return { fate: "too_big", why: "seconds" };
    return { fate: "video", mime: record.mime, bytes, seconds: record.seconds };
  }
  if (isOneOf(FILE_IMAGE_MIMES, record.mime)) {
    if (bytes <= 0) return { fate: "not_media", why: "empty" };
    if (bytes > FILE_BYTES_MAX) return { fate: "too_big", why: "bytes" };
    return { fate: "photo", mime: record.mime, bytes };
  }
  return { fate: "not_media", why: "kind" };
}
