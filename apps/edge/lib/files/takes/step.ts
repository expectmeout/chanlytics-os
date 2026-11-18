/**
 * source_take: one item of a watched folder taken into the Library, one step a job (the footage sources plan, "Taking
 * a file in"). The clock's hand-out moved the item to `taking` and wrote this job in one statement; the step reads the
 * item's own record at its provider, screens it for free, and hands a photo or a clip to its road. Everything it
 * writes names the state it leaves, so the job run again, or beside the sync, changes nothing twice.
 *
 * A folder that is not being read (paused, its account signed out) is not read here either: the item waits. A
 * provider or the database not answering throws, and the ledger tries the job again.
 *
 * Bytes its provider's own checksum says are already taken are shared, with no download (the review's finding 8). As a
 * take ends its workspace's next is handed its job (5), and the units it spent are counted once (20).
 *
 * An item that left its folder and came back keeps the file it had on its row (the sync, 18 Nov 2026): where that
 * file is still in the Library the item is in again, with nothing asked of its provider and nothing downloaded.
 */
import type { TenantId } from "@chanlytics/contracts";
import {
  findFileForWork,
  findSourceItem,
  findSourceTwin,
  moveSourceTake,
  type SourceTakeItem,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { ClaimedJob, JobContext } from "@chanlytics/jobs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errField, logger } from "../../shared/log.js";
import { DRIVE_UNITS, TAKE_RESTS_MS } from "./budgets.js";
import {
  countUnits,
  endTake,
  endUnread,
  keepUnitsSpent,
  putBack,
  type TakeEnd,
  type Taking,
  type UnitsSpent,
} from "./ends.js";
import { handOutTakes } from "./hand-out.js";
import { takePhoto } from "./photo.js";
import { screenItem } from "./screen.js";
import { takeSync, type TakeSync } from "./sync.js";
import { takeVideo } from "./video.js";

type Db = SupabaseClient<Database>;

/**
 * Bytes already taken, by their provider's own checksum and size, which the record gives for free: where another item
 * of the workspace came in with them, this one shares its file, and where its owner removed that file this one is let
 * go too. Nothing is downloaded and none of the day's budget is spent. Null where the bytes are new here.
 */
async function shareTakenBytes(taking: Taking): Promise<TakeEnd | null> {
  const { db, item, record } = taking;
  if (!record.checksum || record.bytes === null) return null;
  const twin = await findSourceTwin(db, item.tenant_id, {
    checksum: record.checksum,
    size: record.bytes,
    exceptId: item.id,
  });
  if (!twin) return null;
  return twin.state === "in"
    ? endTake(taking, { state: "in", fileId: twin.fileId, bytes: record.bytes })
    : endTake(taking, { state: "let_go", bytes: record.bytes });
}

/**
 * The file an item already holds as its take begins, and what that means for the take. Its clip is on its way at the
 * video platform (this take's own, its job run again): the platform's word finishes it, and no second copy is asked
 * for. Or the item was in, left its folder and came back, and the sync kept its file on its row: a file still in the
 * Library is the item's, so it is in again, with no read of its provider, no download and none of the day's budget.
 * Null where it holds none, or the one it held is no longer there (removed, or a clip never prepared): the row lets
 * go of it and the take goes on as for any waiting file, whose doors say if its owner let it go.
 */
async function endHeldFile(db: Db, item: SourceTakeItem): Promise<TakeEnd | { skipped: string } | null> {
  if (!item.file_id) return null;
  const held = await findFileForWork(db, item.tenant_id, item.file_id);
  const from = ["taking"] as const;
  if (!held || held.removed_at || held.media_status === "failed") {
    await moveSourceTake(db, { tenantId: item.tenant_id, id: item.id, from, patch: { file_id: null } });
    return null;
  }
  if (held.media_status === "uploading" || held.media_status === "processing")
    return { skipped: "its clip is with the video platform" };
  const patch = { state: "in", why: null, take_after: null } as const;
  const moved = await moveSourceTake(db, { tenantId: item.tenant_id, id: item.id, from, patch });
  logger({ tenant_id: item.tenant_id }).info("source_take", { item: item.id, took: "in", held: held.id, moved });
  return { took: "in" };
}

/** What one job's take runs with: when its time ends, the sync it reads through, and the units it has spent. */
interface TakeRun {
  deadline: number;
  sync: TakeSync;
  spent: UnitsSpent;
}

/** One item's take: what became of it, or why it was not one to take now. */
async function takeItem(
  db: Db,
  job: Pick<ClaimedJob, "tenant_id" | "payload">,
  { deadline, sync, spent }: TakeRun,
): Promise<TakeEnd | { skipped: string }> {
  const tenantId: TenantId = job.tenant_id;
  const log = logger({ tenant_id: tenantId });
  const found = await findSourceItem(db, tenantId, String(job.payload.item_id));
  if (!found) return { skipped: "no such item" };
  // Moved on since its job was written (the sync marked it gone, a take before this one ended it): nothing to do.
  if (found.state !== "taking") return { skipped: `the item is ${found.state}` };
  const held = await endHeldFile(db, found);
  if (held) return held;
  // It holds no file, or the one it held is no longer there: it is taken as any waiting file is.
  const item: SourceTakeItem = { ...found, file_id: null };
  const key = await sync.open(db, { tenantId, sourceId: item.source_id }, log);
  if (!key.ok) {
    await putBack({ db, item, log }, { why: "folder", until: new Date(Date.now() + TAKE_RESTS_MS.folder) });
    return { skipped: key.skipped };
  }
  const read = await sync.record(key.accessToken, item.provider_id);
  countUnits(spent, DRIVE_UNITS.record);
  if (read.verdict !== "ok") return endUnread({ db, item, log }, read);
  const taking: Taking = { db, item, record: read.answer, accessToken: key.accessToken, log, deadline, spent };
  const screened = screenItem(read.answer, item.first_seen_at, Date.now());
  // In its provider's bin: where it went is the sync's to say, at its next read. Until then it only waits.
  if (screened.fate === "away")
    return putBack(taking, { why: "folder", until: new Date(Date.now() + TAKE_RESTS_MS.folder) });
  if (screened.fate === "not_media" || screened.fate === "too_big")
    return endTake(taking, { state: screened.fate, why: screened.why });
  const shared = await shareTakenBytes(taking);
  if (shared) return shared;
  if (screened.fate === "wait")
    return putBack(taking, { why: screened.why, until: new Date(Date.now() + TAKE_RESTS_MS.length) });
  return screened.fate === "photo" ? takePhoto(taking, screened) : takeVideo(taking, screened);
}

/**
 * The jobs' door onto a take: what the ledger's context holds (packages/jobs `takes`). However the take ends, the
 * units it spent are counted once, and its workspace's next waiting file is handed its job, so files arrive one
 * after another and not a few a clock turn. A hand-out that fails is a line: the clock's next turn is the floor.
 */
export function sourceTaker(db: Db, sync: TakeSync = takeSync): NonNullable<JobContext["takes"]> {
  return {
    take: async (job, deadline) => {
      const spent: UnitsSpent = { units: 0 };
      try {
        return await takeItem(db, job, { deadline, sync, spent });
      } finally {
        await keepUnitsSpent(db, spent);
        await handOutTakes(db, job.tenant_id).catch((error: unknown) =>
          logger({ tenant_id: job.tenant_id }).error("source_take_failed", { why: "hand_out", error: errField(error) }),
        );
      }
    },
  };
}
