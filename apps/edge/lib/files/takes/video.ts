/**
 * A watched folder's clip brought in (the footage sources plan, "Taking a file in"): by the road a found video
 * already takes. The video platform fetches the clip itself from the relay's address, so its bytes never pass through
 * the app; the address carries a ticket the app signed, which names this one item and ends within hours, and never a
 * Google key.
 *
 * Before the video platform is asked: one range read of the clip's first MiB gives the fingerprint an upload has, so
 * the same clip already in the Library is one file with one more origin and one its owner removed is not brought
 * back; then its door judges room from the clip's own length (00643 file_video_sourced); then the day's budget is
 * spent. Only then is a copy asked for, and the row written, uploading. The platform's word finishes it (word.ts).
 */
import { randomUUID } from "node:crypto";
import {
  FINGERPRINT_BYTES,
  askStreamToFetch,
  deleteStreamVideo,
  fileFingerprintOf,
  relayClipAddress,
  signRelayTicket,
  type StreamAccount,
} from "@chanlytics/channels/files";
import {
  FILE_TYPES,
  FILE_VIDEO_BYTES_MAX,
  SECOND_MS,
  uploadNameOf,
  videoPreviewOf,
  type FileVideoMime,
  type TenantId,
} from "@chanlytics/contracts";
import { findWorkspaceNameAndConfig } from "@chanlytics/db/campaigns";
import { findCopiesFreeAt, findFileForWork, recordVideoSourced, type SourcedVideoFate } from "@chanlytics/db/files";
import { logAndGoOn } from "@chanlytics/log";
import { env } from "../../shared/env.js";
import { makeRoom } from "../copy/let-go.js";
import { streamAccount } from "../video-keys.js";
import { DRIVE_UNITS, LET_GO, RELAY_TICKET_MS, TAKE_READ_MS, TAKE_RESTS_MS } from "./budgets.js";
import {
  endTake,
  endUnread,
  keepTakeFacts,
  putBack,
  readTakeBytes,
  spendTake,
  type TakeEnd,
  type Taking,
} from "./ends.js";
import { clearLeftCopies, takeCopyName } from "./copies.js";
import { nameWithoutType } from "./photo.js";

/** What this deployment sends a clip through: the video platform's account, the relay's address and the ticket's key. */
export interface VideoRoad {
  account: StreamAccount;
  relayUrl: string;
  ticketKey: string;
}

/**
 * The road, or null where any part of it is unset or the workspace takes no videos (features.video_preview). A copy
 * brought back goes by the same one (copy/bring-back.ts).
 */
export async function findVideoRoad(db: Taking["db"], tenantId: TenantId): Promise<VideoRoad | null> {
  const account = streamAccount();
  const relayUrl = env.FOOTAGE_RELAY_URL;
  const ticketKey = env.FOOTAGE_TICKET_KEY;
  if (!account || !relayUrl || !ticketKey) return null;
  const config = await findWorkspaceNameAndConfig(db, tenantId)
    .then((workspace) => workspace.config)
    .catch(logAndGoOn("source take: read the video switch", null));
  return config !== null && videoPreviewOf(config) ? { account, relayUrl, ticketKey } : null;
}

/**
 * When a clip that found the videos full is tried again (00654 file_copies_free_at): as soon as a copy that may not
 * be let go yet could be (a minute after its rest ends, an hour at most), or a few times a day where none ever may.
 * Freed room wakes it sooner either way: a video removed or a copy let go releases what waited for room.
 */
async function roomAfter(taking: Taking): Promise<Date> {
  const now = Date.now();
  const free = await findCopiesFreeAt(taking.db, taking.item.tenant_id, LET_GO.restMs / SECOND_MS);
  if (!free) return new Date(now + TAKE_RESTS_MS.room);
  return new Date(Math.max(free.getTime() + TAKE_RESTS_MS.afterRest, now + TAKE_RESTS_MS.afterRest));
}

/** What the door's answer means for the item, where it is not "write the row": null to go on. */
async function endJudged(taking: Taking, judged: SourcedVideoFate, bytes: number): Promise<TakeEnd | null> {
  if (judged.fate === "here") return endTake(taking, { state: "in", fileId: judged.file_id, bytes });
  if (judged.fate === "let_go") return endTake(taking, { state: "let_go", bytes });
  if (judged.fate === "full")
    return putBack(taking, {
      why: "library_full",
      until: new Date(Date.now() + TAKE_RESTS_MS.libraryFull),
      park: "all",
    });
  if (judged.fate === "minutes")
    return putBack(taking, { why: "room", until: await roomAfter(taking), park: "videos" });
  // The door's own word for what the screen already refuses: a clip longer than AI can watch.
  if (judged.fate === "long") return endTake(taking, { state: "too_big", why: "seconds", bytes });
  return null;
}

/** One clip taken: proven by its first MiB, judged for room, the day's budget spent, then asked of the video platform. */
export async function takeVideo(
  taking: Taking,
  video: { mime: FileVideoMime; bytes: number; seconds: number | null },
): Promise<TakeEnd> {
  const { db, item, record, log } = taking;
  const road = await findVideoRoad(db, item.tenant_id);
  if (!road)
    return putBack(taking, {
      why: "videos_off",
      until: new Date(Date.now() + TAKE_RESTS_MS.videosOff),
      park: "videos",
    });
  if (Date.now() >= taking.deadline)
    return putBack(taking, { why: "deadline", until: new Date(Date.now() + TAKE_RESTS_MS.deadline) });
  const read = await readTakeBytes(taking, { most: FINGERPRINT_BYTES, timeoutMs: TAKE_READ_MS.head });
  if (read.verdict !== "ok") return endUnread(taking, read);
  // The size the bytes' own answer gives is the file's now; a clip that grew past the most since it was listed is not taken.
  const bytes = read.answer.size;
  if (bytes > FILE_VIDEO_BYTES_MAX) return endTake(taking, { state: "too_big", why: "bytes", bytes });
  const id = randomUUID();
  const clip = {
    tenantId: item.tenant_id,
    id,
    itemId: item.id,
    name: uploadNameOf(nameWithoutType(record.name), "video"),
    mime: video.mime,
    bytes,
    seconds: video.seconds,
    fingerprint: fileFingerprintOf(read.answer.bytes, bytes),
  };
  // Room, a twin and what was let go, judged before the video platform is asked for anything. Judged to fit, its
  // room is held from here until its row is written (00654), so the takes beside it are judged with it counted.
  let fate = await recordVideoSourced(db, { ...clip, mediaRef: null });
  // The videos are full: the workspace's least recently used copies are let go for it, and it is judged again. Where
  // nothing may go (uploads, made and found videos fill the sixty minutes), it waits, and its folder's line says so.
  if (fate.fate === "minutes" && (await makeRoom(db, item.tenant_id, video.seconds ?? 0, taking.deadline)))
    fate = await recordVideoSourced(db, { ...clip, mediaRef: null });
  const judged = await endJudged(taking, fate, bytes);
  if (judged) return judged;
  // What is still to be spent at Google is the video platform's own read through the relay: its record, then its bytes.
  const waits = await spendTake(taking, bytes, DRIVE_UNITS.record + DRIVE_UNITS.download);
  if (waits) return waits;
  // Taken before (a try that failed, a take that was lost): a copy that try left with no row to hold it goes first.
  if (item.take_tries > 0 || item.why === "lost") await clearLeftCopies(db, road.account, item);
  const ticket = signRelayTicket(road.ticketKey, {
    item: item.id,
    expiresAt: Math.floor((Date.now() + RELAY_TICKET_MS) / SECOND_MS),
  });
  const fetched = await askStreamToFetch(road.account, {
    url: relayClipAddress(road.relayUrl, { item: item.id, ticket, extension: FILE_TYPES[video.mime] }),
    // Named for its item, so a copy that ends with no row can be traced to its take and deleted (copies.ts).
    name: takeCopyName(item.id),
  });
  if (!fetched.ok) {
    // The platform is preparing as many clips as it takes at once: nothing is wrong with this one. A short rest, and
    // no try is spent.
    if (fetched.busy) return putBack(taking, { why: "busy", until: new Date(Date.now() + TAKE_RESTS_MS.busy) });
    // The account's own storage is spent: nothing a business can change, and every clip waits the same. Its own word
    // (never "videos aren't on"), and one error line for Health, since only the platform's owner can mend it.
    if (fetched.full) {
      taking.log.error("video_storage_full", { item: item.id, road: "take" });
      return putBack(taking, {
        why: "stream_full",
        until: new Date(Date.now() + TAKE_RESTS_MS.videosOff),
        park: "videos",
      });
    }
    // The address is ours, so a refusal of it is a fault of ours or the platform's bad minute: the ledger tries again.
    throw new Error(`source_take: the video platform did not take the clip (${fetched.error})`);
  }
  const letItGo = () =>
    deleteStreamVideo(road.account, fetched.mediaRef).catch(logAndGoOn("source take: let the copy go", false));
  let kept: SourcedVideoFate;
  try {
    kept = await recordVideoSourced(db, { ...clip, mediaRef: fetched.mediaRef });
  } catch (failure) {
    // A lost answer may still have committed: the platform's copy goes only where no row holds it.
    if (!(await findFileForWork(db, item.tenant_id, id).catch(() => true))) await letItGo();
    throw failure;
  }
  if (kept.fate !== "kept") {
    // Another take of the workspace filled the room, or kept the same clip, between the judging and the row.
    await letItGo();
    return (await endJudged(taking, kept, bytes)) ?? { took: "raced" };
  }
  await keepTakeFacts(taking, bytes);
  log.info("source_take", { item: item.id, took: "asked", file: id });
  return { took: "asked" };
}
