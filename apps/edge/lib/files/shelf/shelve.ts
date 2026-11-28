/**
 * file_shelve: a made video's own file put on Chanlytics' shelf and checked there (the archive plan's B2; 00695). A
 * video made here held its place in a workspace's sixty minutes for good, since nothing could give it back. With a
 * checked copy on the shelf (a private bucket behind the relay) its copy at the video platform can be let go and
 * fetched again, as a watched folder's clip is.
 *
 * As a video is made (piece-make.ts), its copy is begun: one statement writes the copy's row, its piece with the bytes
 * and the SHA-256 taken as the video was made, and this job. One run of the job, in order:
 *
 *   1. the file and its piece are read. A copy that is not saving is none of the job's; a file removed since has
 *      whatever reached the shelf taken off, and its copy stops saying it is on its way.
 *   2. the shelf is asked what it holds. The video's own bytes already (a run that died after its put): checked, and
 *      nothing is pulled.
 *   3. else the relay pulls the video's own kept file (the one its Download gives) from a link signed for a while,
 *      held by the shelf itself to the piece's SHA-256. Other bytes are sent once more, then the copy fails.
 *   4. the file is read again: removed meanwhile, what landed is taken off.
 *   5. the shelf is asked again, and only its own word of what it holds makes the copy checked.
 *
 * Safe to run again at every step. Whatever becomes of it, the video is made and plays: a copy that fails only means
 * the video keeps its place at the video platform. A throw is the relay, the shelf or the database not answering, and
 * the ledger tries again (packages/jobs KIND_POLICY).
 */
import { putOnShelf, readShelfRecord, removeFromShelf, type Shelf } from "@chanlytics/channels/files";
import {
  FILE_SHELF_MINUTES_MAX,
  MIN_MS,
  SECOND_MS,
  fileMadePathOf,
  videoShelfOf,
  type TenantId,
} from "@chanlytics/contracts";
import { findWorkspaceNameAndConfig } from "@chanlytics/db/campaigns";
import {
  beginShelfCopy,
  failShelfCopy,
  filesBucket,
  findFileForWork,
  findShelfPart,
  markShelfChecked,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { ClaimedJob, JobContext } from "@chanlytics/jobs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../../shared/env.js";
import { logger, type Logger } from "../../shared/log.js";

type Db = SupabaseClient<Database>;

/** How long the link the relay pulls a video's kept file from is good for: the pull begins within seconds. */
const SOURCE_LINK_S = (10 * MIN_MS) / SECOND_MS;
/** What a run keeps for a second sending of a copy that did not match: one pull, and a little. */
const SECOND_PULL_NEEDS_MS = 36 * SECOND_MS;
const SECONDS_IN_A_MINUTE = MIN_MS / SECOND_MS;
/** The shelf's room for one workspace, in seconds: the limit every door that judges the room is handed (00729). */
export const SHELF_SECONDS_MAX = FILE_SHELF_MINUTES_MAX * SECONDS_IN_A_MINUTE;

/** What became of a shelving, in a word for its job's line; or why it was not one to run. */
type ShelveEnd = { shelved: string } | { skipped: string };

/**
 * The shelf this deployment asks, or null where it has no relay: the relay's address and the key its tickets are
 * signed with, the same two a watched clip's road reads.
 */
export function shelfOf(): Shelf | null {
  const relayUrl = env.FOOTAGE_RELAY_URL;
  const ticketKey = env.FOOTAGE_TICKET_KEY;
  return relayUrl && ticketKey ? { relayUrl, ticketKey } : null;
}

/**
 * A made video's shelf copy begun, where its workspace keeps one (features.video_shelf) and this deployment has a
 * shelf: its row, its piece and its job, in one statement of the database's. A workspace whose shelf has no room for
 * it says so once, and the video keeps its place at the video platform.
 */
export async function beginShelving(
  db: Db,
  video: { tenantId: TenantId; fileId: string; bytes: number; sha256: string },
): Promise<void> {
  if (!shelfOf()) return;
  const { config } = await findWorkspaceNameAndConfig(db, video.tenantId);
  if (!videoShelfOf(config)) return;
  const fate = await beginShelfCopy(db, { ...video, secondsMax: SHELF_SECONDS_MAX });
  if (fate === "full")
    logger({ tenant_id: video.tenantId }).warn("file_shelve_failed", { file: video.fileId, why: "shelf_full" });
}

/** One shelving: the file, the piece its copy must be, the shelf, and what its job runs with. */
interface Shelving {
  db: Db;
  shelf: Shelf;
  video: { tenantId: TenantId; fileId: string };
  piece: { bytes: number; sha256: string };
  log: Logger;
  deadline: number;
}

/** The copy failed for good, with why: said on its row and on one error line, which Health reads. */
async function failWith(shelving: Shelving, reason: "mismatch" | "not_found"): Promise<ShelveEnd> {
  await failShelfCopy(shelving.db, { ...shelving.video, why: reason });
  return { shelved: `failed:${reason}` };
}

/**
 * The file was removed: whatever reached the shelf is taken off, and its copy stops saying it is on its way. A shelf
 * that will not say it let go is a throw, so the job comes back and nothing is left there.
 */
async function leaveNothing(shelving: Shelving): Promise<ShelveEnd> {
  if (!(await removeFromShelf(shelving.shelf, shelving.video)))
    throw new Error("file_shelve: the shelf did not let a removed video's copy go");
  await failShelfCopy(shelving.db, { ...shelving.video, why: "refused" });
  return { skipped: "the file was removed" };
}

/** A link's or a read's refusal that says the file is not there, as Storage says it: nothing to put the copy from. */
export const saysNotThere = (error: { message?: string; statusCode?: unknown; status?: unknown }): boolean =>
  [error.statusCode, error.status].some((code) => code === 404 || code === "404") ||
  /not[ _]found/i.test(error.message ?? "");

/**
 * The video's own kept file pulled onto the shelf. Other bytes than the piece's are sent once more where the run has
 * time, and then the copy fails. Answers null once the shelf holds it, or how the shelving ended.
 */
async function pullOntoShelf(shelving: Shelving): Promise<ShelveEnd | null> {
  const { db, shelf, video, piece, log, deadline } = shelving;
  const signed = await filesBucket(db).createSignedUrl(
    fileMadePathOf(video.tenantId, video.fileId, "video"),
    SOURCE_LINK_S,
  );
  if (signed.error) {
    if (!saysNotThere(signed.error)) throw new Error("file_shelve: the kept file's link could not be signed");
    log.error("file_shelve_failed", { file: video.fileId, why: "not_found" });
    return failWith(shelving, "not_found");
  }
  const send = () => putOnShelf(shelf, { ...video, from: signed.data.signedUrl, ...piece });
  let put = await send();
  if (!put.ok && put.why === "mismatch") {
    log.error("file_shelve_failed", { file: video.fileId, why: "mismatch", sent: 1 });
    if (deadline - Date.now() < SECOND_PULL_NEEDS_MS)
      throw new Error("file_shelve: the copy did not match, and this run has no time to send it again");
    put = await send();
    if (!put.ok && put.why === "mismatch") {
      log.error("file_shelve_failed", { file: video.fileId, why: "mismatch", sent: 2 });
      return failWith(shelving, "mismatch");
    }
  }
  if (!put.ok) throw new Error(`file_shelve: the shelf did not take the video (${put.why})`);
  return null;
}

async function shelveVideo(
  db: Db,
  job: Pick<ClaimedJob, "tenant_id" | "payload">,
  deadline: number,
): Promise<ShelveEnd> {
  const tenantId: TenantId = job.tenant_id;
  const fileId = String(job.payload.file_id);
  const video = { tenantId, fileId };
  const log = logger({ tenant_id: tenantId });
  const part = await findShelfPart(db, tenantId, fileId);
  if (!part) return { skipped: "no shelf copy" };
  if (part.state !== "saving") return { skipped: `its copy is ${part.state}` };
  const shelf = shelfOf();
  if (!shelf) throw new Error("file_shelve: this deployment has no relay");
  // A piece with no SHA-256 could be held to nothing: the door never writes one.
  if (!part.sha256) throw new Error("file_shelve: the copy's piece names no SHA-256");
  const shelving: Shelving = { db, shelf, video, piece: { bytes: part.bytes, sha256: part.sha256 }, log, deadline };
  const isTheVideo = (record: { bytes: number; sha256: string | null } | null): boolean =>
    record !== null && record.bytes === part.bytes && record.sha256 === part.sha256;

  const file = await findFileForWork(db, tenantId, fileId);
  if (!file || file.removed_at) return leaveNothing(shelving);
  const began = Date.now();
  const held = await readShelfRecord(shelf, video);
  if (!held.ok) throw new Error("file_shelve: the shelf gave no answer");
  const pulled = !isTheVideo(held.record);
  if (pulled) {
    const ended = await pullOntoShelf(shelving);
    if (ended) return ended;
  }
  // Removed while the pull ran: what landed is taken off, so nothing of a removed file stays on the shelf.
  const now = await findFileForWork(db, tenantId, fileId);
  if (!now || now.removed_at) return leaveNothing(shelving);
  // Only the shelf's own word of what it holds makes the copy checked.
  const back = pulled ? await readShelfRecord(shelf, video) : held;
  if (!back.ok || !back.record) throw new Error("file_shelve: the shelf did not say what it holds");
  const checked = await markShelfChecked(db, { ...video, bytes: back.record.bytes, sha256: back.record.sha256 });
  if (checked === "mismatch") {
    log.error("file_shelve_failed", { file: fileId, why: "mismatch" });
    return { shelved: "failed:mismatch" };
  }
  if (checked !== "checked") return { skipped: "its copy was settled meanwhile" };
  log.info("file_shelved", {
    file: fileId,
    bytes: part.bytes,
    seconds: file.seconds === null ? null : Number(file.seconds),
    took_ms: Date.now() - began,
    pulled,
  });
  return { shelved: "checked" };
}

/** The jobs' door onto a shelving: what the ledger's context holds (packages/jobs `shelf`). */
export function shelver(db: Db): NonNullable<JobContext["shelf"]> {
  return { shelve: (job, deadline) => shelveVideo(db, job, deadline) };
}
