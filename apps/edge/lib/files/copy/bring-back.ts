/**
 * copy_return: a video's copy brought back to the video platform (the footage sources plan, "Availability"; 00654).
 * The door (ensure.ts) puts this job on the ledger when something wants a copy that is away, held once per file, so
 * play, AI and a video being made asking at once are one return.
 *
 * What can give a copy back is asked in one order, written here and nowhere else (the archive PRD's FR-6.1): first
 * Chanlytics' own shelf, where a video made here keeps a checked copy (the archive plan's B2; 00690), then a watched
 * folder's item. The shelf needs no key and spends nothing of a provider's day: the video platform fetches the copy
 * from the relay's address for the shelf, under a ticket that reads that one file. A shelf that does not hold the
 * video's bytes when it is asked puts the copy back from the video's own kept file (shelf/check.ts); the return then
 * goes by a folder's item where one holds the file, and waits where none does.
 *
 * A watched clip's return, as before:
 *
 * It goes by the road the clip first came by: the video platform fetches it again from the relay's address, under a
 * ticket that names the clip's item, so its bytes never pass through the app. Before anything is asked of the
 * platform: the clip's folder is opened through the sync for a return (one watched, or stopped while its account reads;
 * one whose account needs connecting again, or that Drive can't open, gives nothing back, and the copy says which); the
 * item's own record is read, and bytes that are no longer the ones this file is of are never
 * fetched into it; then the return is judged and begun in one place (file_copy_return_begin): room for its own length,
 * found by letting the least recently used copies go where there is none, and the day's budgets. Begun, the copy is
 * `returning` and its length is held in the minutes.
 *
 * The platform's word finishes it (00654 file_media_ready: here again and nothing else, no look and no digest). A
 * return that does not happen leaves the file as it was, away, with why, and its media_status untouched. A copy the
 * platform holds that no row does is deleted, as a take's is (takes/copies.ts): named for its file, found before the
 * next return and at the platform's word about it.
 */
import {
  askStreamToFetch,
  deleteStreamVideo,
  relayClipAddress,
  relayShelfAddress,
  signRelayTicket,
  type StreamVideo,
} from "@chanlytics/channels/files";
import {
  FILE_TYPES,
  SECOND_MS,
  isVideoMime,
  type FileCopyWait,
  type SourceItemRecord,
  type TenantId,
} from "@chanlytics/contracts";
import {
  beginCopyReturn,
  failCopyReturn,
  findFileForWork,
  findReturnAnywhere,
  findSourceItem,
  keepCopyWait,
  keepReturningCopy,
  settleFileCopy,
  type CopyReturnBegun,
  type FileRow,
  type MediaFate,
  type SourceTakeItem,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { ClaimedJob, JobContext } from "@chanlytics/jobs";
import { logAndGoOn } from "@chanlytics/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger, type Logger } from "../../shared/log.js";
import { askShelf } from "../shelf/check.js";
import { COPY_RETURN, DRIVE_UNITS, RELAY_TICKET_MS, RETURN_BUDGETS, TAKE_BUDGETS } from "../takes/budgets.js";
import { clearCopiesNamed, idOfCopyNamed } from "../takes/copies.js";
import { countUnits, keepUnitsSpent, type UnitsSpent } from "../takes/ends.js";
import { takeSync, type TakeSync } from "../takes/sync.js";
import { findVideoRoad, type VideoRoad } from "../takes/video.js";
import { streamAccount } from "../video-keys.js";
import { makeRoom } from "./let-go.js";

type Db = SupabaseClient<Database>;

const COPY_NAMED = "return:";

/** What a returning copy is called at the video platform: its file, so one that ends with no row can be traced. */
const returnCopyName = (fileId: string): string => `${COPY_NAMED}${fileId}`;

/** What became of a return, in a word for its job's line; or why it was not one to begin. */
type ReturnEnd = { returned: string } | { skipped: string };

/** One return: the file, and what its job runs with. */
interface Returning {
  db: Db;
  tenantId: TenantId;
  file: FileRow;
  log: Logger;
  deadline: number;
  spent: UnitsSpent;
}

/** Where the video platform is sent for the copy: the address, and what stands behind it, for the return's lines. */
interface FetchFrom {
  /** The relay's address, with its ticket: made as the platform is asked, so a failure to make it ends the return. */
  address: () => string;
  origin: "shelf" | "watched";
  /** The watched item the bytes are its provider's; none for the shelf. */
  item?: string;
}

/** The copy stays away, and its row says why it could not come back just now. */
async function leaveAway(returning: Pick<Returning, "db" | "tenantId" | "file" | "log">, reason: FileCopyWait) {
  await keepCopyWait(returning.db, returning.tenantId, returning.file.id, reason);
  returning.log.info("copy_return", { file: returning.file.id, waits: reason });
  return { returned: `waits:${reason}` };
}

/**
 * Whether the bytes its provider holds now are still the ones the file is of, by what the take kept of them: a row is
 * its bytes (its stills, its moments and what was said of it point at them), so other bytes are never fetched into it.
 * The folder's next read says what became of the item: new bytes are a new file.
 */
function sameBytes(origin: SourceTakeItem, record: SourceItemRecord): boolean {
  if (origin.checksum && record.checksum && origin.checksum !== record.checksum) return false;
  return origin.bytes === null || record.bytes === null || Number(origin.bytes) === record.bytes;
}

/**
 * The return judged and begun, with room made for it once where the videos are full. `units` is what the return will
 * still spend at a provider: the platform's own read of a folder's item through the relay, and nothing for the shelf.
 */
async function beginWithRoom(returning: Returning, units: number): Promise<CopyReturnBegun> {
  const { db, tenantId, file, deadline } = returning;
  const begin = () =>
    beginCopyReturn(db, {
      tenantId,
      fileId: file.id,
      units,
      platformBytesMax: TAKE_BUDGETS.platformBytesADay,
      workspaceReturnsMax: RETURN_BUDGETS.workspaceReturnsADay,
      unitsMax: TAKE_BUDGETS.unitsADay,
      staleSeconds: COPY_RETURN.staleSeconds,
    });
  const begun = await begin();
  if (begun.fate !== "room") return begun;
  return (await makeRoom(db, tenantId, begun.seconds ?? 0, deadline)) ? begin() : begun;
}

/** What the door's answer means where it is not "go". */
function endNotBegun(returning: Returning, begun: Exclude<CopyReturnBegun, { fate: "go" }>): ReturnEnd {
  const { file, log } = returning;
  if (begun.fate === "lost") {
    log.warn("copy_return_failed", { file: file.id, why: "lost", lost: begun.loss });
    return { returned: `lost:${begun.loss}` };
  }
  if (begun.fate === "room") {
    log.info("copy_return", { file: file.id, waits: "room" });
    return { returned: "waits:room" };
  }
  if (begun.fate === "wait") {
    log.info("copy_return", { file: file.id, waits: "budget", binds: begun.binds, until: begun.until.toISOString() });
    return { returned: "waits:budget" };
  }
  return { skipped: `its copy is ${begun.fate}` };
}

/** The platform asked to fetch the copy again, and the id it gave kept on the row. The copy is `returning` throughout. */
async function fetchAgain(returning: Returning, road: VideoRoad, from: FetchFrom): Promise<ReturnEnd> {
  const { db, tenantId, file, log } = returning;
  const undo = (reason: FileCopyWait) => failCopyReturn(db, { tenantId, fileId: file.id, reason, mediaRef: null });
  try {
    // A copy an earlier return of this file left at the platform, with no row to hold it, goes first.
    await clearCopiesNamed(db, road.account, returnCopyName(file.id));
    const fetched = await askStreamToFetch(road.account, { url: from.address(), name: returnCopyName(file.id) });
    if (!fetched.ok) {
      // Too many being prepared at once, or the account's own storage spent: nothing is wrong with this clip.
      if (fetched.busy || fetched.full) {
        const reason = fetched.busy ? "busy" : "stream_full";
        // Only the platform's owner can mend its storage: one error line for Health; the business is told it takes longer.
        if (fetched.full) log.error("video_storage_full", { file: file.id, road: "return" });
        await undo(reason);
        log.info("copy_return", { file: file.id, origin: from.origin, waits: reason });
        return { returned: `waits:${reason}` };
      }
      // The address is ours, so a refusal of it is a fault of ours or the platform's bad minute: tried again.
      throw new Error(`copy_return: the video platform did not take the clip (${fetched.error})`);
    }
    if (!(await keepReturningCopy(db, tenantId, file.id, fetched.mediaRef))) {
      // Ended meanwhile (the file was removed, or the sweep gave this return up): the copy has no row to hold it.
      await deleteStreamVideo(road.account, fetched.mediaRef).catch(logAndGoOn("copy: let the copy go", false));
      return { skipped: "its return was ended meanwhile" };
    }
    log.info("copy_return", {
      file: file.id,
      origin: from.origin,
      ...(from.item ? { item: from.item } : {}),
      took: "asked",
    });
    return { returned: "asked" };
  } catch (failure) {
    // Begun and not asked for: the file is away again at once, never left saying it is on its way.
    await undo("stopped").catch(logAndGoOn("copy: end the return", false));
    throw failure;
  }
}

/** The ticket's end for a return's address: the platform fetches within minutes, and asks again after a break. */
const ticketEnds = (): number => Math.floor((Date.now() + RELAY_TICKET_MS) / SECOND_MS);

/**
 * The return from Chanlytics' own shelf, which was just seen to hold the video's very bytes: begun with nothing to
 * spend at a provider, and the platform sent to the relay's address for the shelf. No folder is opened and no key asked.
 */
async function returnFromShelf(returning: Returning): Promise<ReturnEnd> {
  const { db, tenantId, file } = returning;
  // Without the road nothing is asked of the platform: the workspace takes no videos, or this deployment has no relay.
  const road = await findVideoRoad(db, tenantId);
  if (!road) return leaveAway(returning, "videos_off");
  const begun = await beginWithRoom(returning, 0);
  if (begun.fate !== "go") return endNotBegun(returning, begun);
  return fetchAgain(returning, road, {
    address: () => relayShelfAddress(road, { tenantId, fileId: file.id }, ticketEnds()),
    origin: "shelf",
  });
}

/** The return under an hour's key: the item's own record read, the return begun, the platform asked. */
async function returnOpened(
  returning: Returning,
  origin: SourceTakeItem,
  road: VideoRoad,
  under: { accessToken: string; sync: TakeSync },
): Promise<ReturnEnd> {
  const { file, spent } = returning;
  // Counted as it is asked: a call that then throws was still made.
  countUnits(spent, DRIVE_UNITS.record);
  const read = await under.sync.record(under.accessToken, origin.provider_id);
  // Not now, gone or unreadable: where an item went is the sync's to say, and the copy then says it is lost.
  if (read.verdict !== "ok" || read.answer.trashed) return leaveAway(returning, "unreadable");
  if (!sameBytes(origin, read.answer)) return leaveAway(returning, "changed");
  // What is still to be spent at the provider is the platform's own read through the relay: its record, its bytes.
  const begun = await beginWithRoom(returning, DRIVE_UNITS.record + DRIVE_UNITS.download);
  if (begun.fate !== "go") return endNotBegun(returning, begun);
  return fetchAgain(returning, road, {
    address: () => {
      const ticket = signRelayTicket(road.ticketKey, { item: origin.id, expiresAt: ticketEnds() });
      const extension = isVideoMime(file.mime) ? FILE_TYPES[file.mime] : FILE_TYPES["video/mp4"];
      return relayClipAddress(road.relayUrl, { item: origin.id, ticket, extension });
    },
    origin: "watched",
    item: origin.id,
  });
}

async function bringCopyBack(
  db: Db,
  job: Pick<ClaimedJob, "tenant_id" | "payload">,
  run: { deadline: number; sync: TakeSync; spent: UnitsSpent },
): Promise<ReturnEnd> {
  const tenantId: TenantId = job.tenant_id;
  const log = logger({ tenant_id: tenantId });
  const file = await findFileForWork(db, tenantId, String(job.payload.file_id));
  if (!file || file.removed_at || file.kind !== "video") return { skipped: "no such video" };
  const standing = await settleFileCopy(db, tenantId, file.id);
  if (!standing) return { skipped: "no such video" };
  // Here already, being let go, or lost (its row now says why): nothing to bring back.
  if (standing.state !== "away" && standing.state !== "returning") return { skipped: `its copy is ${standing.state}` };
  const returning: Returning = { db, tenantId, file, log, deadline: run.deadline, spent: run.spent };
  // The shelf first, asked at this moment whether it holds the video's very bytes. A clip only a folder holds is not
  // asked about: its row says the shelf has no copy of it, and a folder's item is there.
  const shelf = standing.shelf || !standing.itemId ? await askShelf(db, { tenantId, fileId: file.id }, log) : "none";
  if (shelf === "holds") return returnFromShelf(returning);
  const origin = standing.itemId ? await findSourceItem(db, tenantId, standing.itemId) : null;
  if (!origin) {
    // No folder holds it. Its shelf copy is on its way there or being put back, or the shelf gave no answer: it
    // waits, and whoever asks next finds the shelf holding it. It is lost only once that has failed for good.
    if (shelf === "put_back" || shelf === "unsure") return leaveAway(returning, "unreadable");
    return { skipped: "no origin holds it" };
  }
  // Without the road nothing is asked of the provider: the workspace takes no videos, or this deployment has no relay.
  const road = await findVideoRoad(db, tenantId);
  if (!road) return leaveAway(returning, "videos_off");
  // Opened for a return, which a folder that was stopped gives too while its account reads (the PRD's F1).
  const key = await run.sync.open(db, { tenantId, sourceId: origin.source_id }, log, "return");
  if (!key.ok) {
    // Whose it is to mend, in its own word: the account (connect it again) or the folder (Drive can't open it).
    await leaveAway(returning, key.cause === "account" ? "connection" : "cant_open");
    return { skipped: key.skipped };
  }
  try {
    return await returnOpened(returning, origin, road, { accessToken: key.accessToken, sync: run.sync });
  } catch (error) {
    // A key its provider refused is the sync's to settle; where the account is now signed out, the copy waits for
    // it to be connected again. Anything else is thrown on, and the ledger tries the job again.
    const left = await key.refused(error);
    await leaveAway(returning, "connection");
    return left;
  }
}

/** The jobs' door onto a return: what the ledger's context holds (packages/jobs `copies`). Its units are counted once. */
export function copyReturner(db: Db, sync: TakeSync = takeSync): NonNullable<JobContext["copies"]> {
  return {
    bringBack: async (job, deadline) => {
      const spent: UnitsSpent = { units: 0 };
      try {
        return await bringCopyBack(db, job, { deadline, sync, spent });
      } finally {
        await keepUnitsSpent(db, spent);
      }
    },
  };
}

/**
 * The video platform's word about a copy coming back, heard at its webhook and by the sweep that asks after a lost
 * one. `returned`: here again, and nothing else to do. `unreturned`: the platform could not prepare it, so the file is
 * away again (the row already says so) and the failed copy is deleted there.
 */
export async function hearCopyWord(fate: MediaFate, uid: string): Promise<void> {
  if (!fate.tenant_id || (fate.fate !== "returned" && fate.fate !== "unreturned")) return;
  const log = logger({ tenant_id: fate.tenant_id });
  if (fate.fate === "returned") {
    log.info("copy_return", { file: fate.file_id, took: "returned" });
    return;
  }
  const account = streamAccount();
  const gone = account
    ? await deleteStreamVideo(account, uid).catch(logAndGoOn("copy: let the failed copy go", false))
    : false;
  log.warn("copy_return_failed", { file: fate.file_id, why: "failed", gone });
}

/**
 * The video platform's word about a video no row here holds: where it is a return's copy, of a file this database
 * knows, it is deleted (an earlier attempt's, which its row no longer names). Left alone while its return may still be
 * writing its id (begun, none kept yet, and the word is not that the copy is ready). Answers whether it went.
 */
export async function clearUnheldReturn(db: Db, video: Pick<StreamVideo, "uid" | "name" | "ready">): Promise<boolean> {
  const fileId = idOfCopyNamed(COPY_NAMED, video.name);
  const account = streamAccount();
  if (!fileId || !account) return false;
  const file = await findReturnAnywhere(db, fileId);
  // A copy named for a file this database does not hold may be another deployment's.
  if (!file || (file.awaitsItsId && !video.ready)) return false;
  const gone = await deleteStreamVideo(account, video.uid);
  logger({ tenant_id: file.tenantId }).warn("copy_return_failed", { file: fileId, why: "copy_unheld", gone });
  return gone;
}
