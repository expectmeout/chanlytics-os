/**
 * What keeps a business's files honest over time (decision 0099): a removed one let go, bytes that never became a file emptied,
 * and the sweep's half-hourly pass over what has not finished. And the jobs' three doors onto this folder.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS, FILE_LOOK_EDITION, HOUR_MS, SECOND_MS, WEEK_MS, fileFolderOf } from "@chanlytics/contracts";
import { deleteClaudeFile } from "@chanlytics/channels/ai";
import {
  findFileForWork,
  recordFilePurged,
  filesBucket,
  listFilesToLookAgain,
  listFilesToPurgeAgain,
} from "@chanlytics/db/files";
import { type Database } from "@chanlytics/db/types";
import { scheduleJobOnce, type ClaimedJob, type JobContext } from "@chanlytics/jobs";
import { env } from "../shared/env.js";
import { errField, logger } from "../shared/log.js";
import { fetchFiles } from "./found.js";
import { lookAtFile } from "./look.js";

type Db = SupabaseClient<Database>;

/** How many files one pass of the sweep asks after, and how far apart their looks come due. */
const SWEEP_TAKES = 50;
const SWEEP_LOOK_PACE_MS = 2 * SECOND_MS;
/** A removal is given this long to finish by itself before the sweep asks again, and this long before it stops asking. */
const PURGE_AGAIN_AFTER_MS = HOUR_MS;
const PURGE_AGAIN_UNTIL_MS = WEEK_MS;

/**
 * file_purge: what a file left, let go. Throws when anything stays, so the ledger tries again. It also comes a day after every
 * upload begins (00551 file_start), so a live file is left alone, and bytes that never became a file only empty their
 * folder. What it empties that way is logged: an upload that arrived and was never told done, which nobody else can see.
 */
async function purgeFile(db: Db, job: ClaimedJob): Promise<void> {
  const fileId = String(job.payload.file_id);
  const row = await findFileForWork(db, job.tenant_id, fileId);
  if (row && !row.removed_at) return;
  const folder = fileFolderOf(job.tenant_id, fileId);
  const listed = await filesBucket(db).list(folder);
  if (listed.error) throw new Error(`file_purge: ${listed.error.message}`);
  const paths = (listed.data ?? []).map((f) => `${folder}/${f.name}`);
  if (paths.length) {
    const gone = await filesBucket(db).remove(paths);
    if (gone.error) throw new Error(`file_purge: ${gone.error.message}`);
  }
  if (!row) {
    if (paths.length) logger({ tenant_id: job.tenant_id }).info("file_never_filed", { file: fileId });
    return;
  }
  const copy = (row.claude_copy as { id?: unknown } | null)?.id;
  if (typeof copy === "string") {
    // The owner was told it can't be brought back, so a copy we can't reach holds the row until we can.
    const key = env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("file_purge: no key to let Anthropic's copy go");
    if (!(await deleteClaudeFile(key, copy))) throw new Error("file_purge: Anthropic's copy stayed");
  }
  await recordFilePurged(db, job.tenant_id, fileId);
}

/**
 * The sweep's pass, every half hour: a look that failed or was lost is tried again a day on while the file is young, a raised
 * edition reads what the last one read, and a removal that has not finished is asked for again. Few at a time, with no clock
 * of its own. It catches its own failures: nothing else the sweep does waits on files.
 */
export async function keepFilesMoving(db: Db, nowMs = Date.now()): Promise<{ looks: number; purges: number }> {
  const log = logger({});
  try {
    const looks = await listFilesToLookAgain(db, {
      edition: FILE_LOOK_EDITION,
      triedBefore: new Date(nowMs - DAY_MS).toISOString(),
      bornAfter: new Date(nowMs - WEEK_MS).toISOString(),
      limit: SWEEP_TAKES,
    });
    for (const [i, f] of looks.entries()) {
      await scheduleJobOnce(db, {
        tenantId: f.tenant_id,
        kind: "file_look",
        dueAt: new Date(nowMs + i * SWEEP_LOOK_PACE_MS),
        payload: { file_id: f.id, edition: String(FILE_LOOK_EDITION) },
      });
    }
    const purges = await listFilesToPurgeAgain(db, {
      removedBefore: new Date(nowMs - PURGE_AGAIN_AFTER_MS).toISOString(),
      removedAfter: new Date(nowMs - PURGE_AGAIN_UNTIL_MS).toISOString(),
      limit: SWEEP_TAKES,
    });
    for (const f of purges) {
      await scheduleJobOnce(db, {
        tenantId: f.tenant_id,
        kind: "file_purge",
        dueAt: new Date(nowMs),
        payload: { file_id: f.id, why: "sweep" },
      });
    }
    return { looks: looks.length, purges: purges.length };
  } catch (e) {
    log.error("files_sweep_failed", { error: errField(e) });
    return { looks: 0, purges: 0 };
  }
}

export function fileJobs(db: Db): NonNullable<JobContext["files"]> {
  return {
    look: (job, deadline) => lookAtFile(db, job, deadline),
    fetch: (job, deadline) => fetchFiles(db, job, deadline),
    purge: (job) => purgeFile(db, job),
  };
}
