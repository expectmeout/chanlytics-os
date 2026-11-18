/**
 * A watched folder's photo brought in (the footage sources plan, "Taking a file in"): its bytes come through the job
 * into Storage, 25 MB at most, and then it is a file by the door every road keeps a photo by (00551 file_found), so
 * its look starts as an upload's does. It is filed at once: confirming the watch was the business's word.
 *
 * Judged by its own bytes, as an upload is: its fingerprint is its first MiB and its size, so the same photo already
 * in the Library (from a phone, a website, another folder) is one file with one more origin, and one its owner
 * removed is not brought back. By its look it is judged as an upload is too, as its look starts: a look-alike that
 * only waited gives way to it, one its owner kept stays beside it, and the photo from the folder is never the one
 * removed. Storage or the database failing throws, and leaves no bytes behind with no row to find them.
 */
import { randomUUID } from "node:crypto";
import { FINGERPRINT_BYTES, fileFingerprintOf } from "@chanlytics/channels/files";
import {
  DbFailure,
  FILE_BYTES_MAX,
  FILE_CACHE_S,
  FILE_LOOK_EDITION,
  FILE_PIXELS_MAX,
  FILE_SIDE_MIN,
  filePathOf,
  uploadNameOf,
  type FileImageMime,
  type SourceItemWhy,
} from "@chanlytics/contracts";
import { imageHeaderOf } from "@chanlytics/core";
import { filesBucket, findFileForWork, markFileSeen, recordFileFound } from "@chanlytics/db/files";
import { DRIVE_UNITS, TAKE_READ_MS, TAKE_RESTS_MS } from "./budgets.js";
import { endTake, endUnread, putBack, readTakeBytes, spendTake, type TakeEnd, type Taking } from "./ends.js";

/** The type a photo's own first bytes say it is, where they say one of these. */
const MIME_OF_HEAD: Readonly<Record<string, FileImageMime>> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** A name without what it ends in: a camera's `IMG_3185.HEIC` is `IMG_3185`. */
export const nameWithoutType = (name: string): string => name.replace(/\.[A-Za-z0-9]{1,5}$/, "");

/** What a photo's bytes say of it: its type and size, or why it is not one to keep. */
function provenPhoto(
  bytes: Uint8Array,
  listedAs: FileImageMime,
):
  | { mime: FileImageMime; width: number | null; height: number | null }
  | { state: "not_media" | "too_big"; why: SourceItemWhy } {
  const head = imageHeaderOf(bytes);
  if (!head) {
    // A HEIC keeps its size deep inside it: kept as its provider calls it, and the look reads it, as an upload's.
    return listedAs === "image/heic" || listedAs === "image/heif"
      ? { mime: listedAs, width: null, height: null }
      : { state: "not_media", why: "unreadable" };
  }
  const mime = MIME_OF_HEAD[head.kind];
  if (!mime) return { state: "not_media", why: "kind" };
  if (Math.min(head.width, head.height) < FILE_SIDE_MIN) return { state: "not_media", why: "too_small" };
  if (head.width * head.height > FILE_PIXELS_MAX) return { state: "too_big", why: "pixels" };
  return { mime, width: head.width, height: head.height };
}

/** One photo taken: the day's budget, its bytes read whole, proven, stored and kept once. */
export async function takePhoto(taking: Taking, photo: { mime: FileImageMime; bytes: number }): Promise<TakeEnd> {
  const { db, item, record } = taking;
  const waits = await spendTake(taking, photo.bytes, DRIVE_UNITS.download);
  if (waits) return waits;
  if (Date.now() >= taking.deadline)
    return putBack(taking, { why: "deadline", until: new Date(Date.now() + TAKE_RESTS_MS.deadline) });
  // One byte past the most, so a photo that grew since it was listed shows as too big and is never half kept.
  const read = await readTakeBytes(taking, { most: FILE_BYTES_MAX + 1, timeoutMs: TAKE_READ_MS.photo });
  if (read.verdict !== "ok") return endUnread(taking, read);
  const { bytes, size } = read.answer;
  if (size > FILE_BYTES_MAX || bytes.length > FILE_BYTES_MAX)
    return endTake(taking, { state: "too_big", why: "bytes", bytes: size });
  const proven = provenPhoto(bytes, photo.mime);
  if ("state" in proven) return endTake(taking, { ...proven, bytes: size });
  const id = randomUUID();
  const path = filePathOf(item.tenant_id, id, proven.mime);
  const found = {
    tenantId: item.tenant_id,
    id,
    status: "filed" as const,
    source: "drive",
    sourceRef: null,
    name: uploadNameOf(nameWithoutType(record.name)),
    mime: proven.mime,
    bytes: bytes.length,
    fingerprint: fileFingerprintOf(bytes.subarray(0, FINGERPRINT_BYTES), bytes.length),
    width: proven.width,
    height: proven.height,
    shows: null,
    edition: FILE_LOOK_EDITION,
    actor: null,
    // What it looks like is printed where an upload's is, as its look starts (look.ts), from the copy Storage makes:
    // so a HEIC is printed too, and a look-alike found online meets it there (00630 file_printed, 00643 file_twin_fate).
    print: null,
  };
  const store = async () => {
    const stored = await filesBucket(db).upload(path, bytes, {
      contentType: proven.mime,
      upsert: false,
      cacheControl: String(FILE_CACHE_S),
    });
    if (stored.error) throw new DbFailure(stored.error, "source_take");
  };
  // Here already, or let go: nothing is stored for it, and the door says which.
  const seen = await markFileSeen(db, item.tenant_id, found.fingerprint);
  if (!seen) await store();
  let fate;
  try {
    fate = await recordFileFound(db, found);
  } catch (failure) {
    // A lost answer may still have committed: the bytes go only where no row holds them.
    if (!seen && !(await findFileForWork(db, item.tenant_id, id).catch(() => true)))
      await filesBucket(db).remove([path]);
    throw failure;
  }
  // Its twin left between the two reads: the row is new after all, and its bytes go in now.
  if (fate.fate === "kept" && seen) await store();
  if (fate.fate !== "kept" && !seen) await filesBucket(db).remove([path]);
  if (fate.fate === "full")
    return putBack(taking, {
      why: "library_full",
      until: new Date(Date.now() + TAKE_RESTS_MS.libraryFull),
      park: "all",
    });
  // Here with no file named is what its owner removed: it is not brought back.
  if (!fate.file_id) return endTake(taking, { state: "let_go", bytes: size });
  return endTake(taking, { state: "in", fileId: fate.file_id, bytes: size });
}
