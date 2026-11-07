/**
 * What keeps a business's files honest over time (decision 0099): a removed one let go, bytes that never became a file emptied,
 * and the sweep's half-hourly pass over what has not finished. And the jobs' four doors onto this folder.
 *
 * A video (stage B) is kept by Stream, so letting one go starts there: its video is deleted at Stream first, which frees its
 * minutes at once, then its folder (sheet, poster, sound), Anthropic's copy and its row. One whose bytes never arrived is let
 * go the same way a day after its upload began. Where Stream's webhook did not come (lost, or a preview, which has none), the
 * sweep asks Stream itself and writes what the webhook would have.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DAY_MS,
  FILE_LOOK_EDITION,
  HOUR_MS,
  MIN_MS,
  SECOND_MS,
  VIDEO_LOOK_EDITION,
  WEEK_MS,
  fileFolderOf,
} from "@chanlytics/contracts";
import { deleteClaudeFile } from "@chanlytics/channels/ai";
import { deleteStreamVideo, readStreamVideo } from "@chanlytics/channels/files";
import {
  filesBucket,
  findFileForWork,
  listFilesToLookAgain,
  listFilesToPurgeAgain,
  listVideosToDigestAgain,
  listVideosWaiting,
  markFileMediaFailed,
  markFileMediaReady,
  recordFilePurged,
  removeLapsedUpload,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce, type ClaimedJob, type JobContext } from "@chanlytics/jobs";
import { env } from "../shared/env.js";
import { errField, logger } from "../shared/log.js";
import { fetchFiles } from "./found.js";
import { lookAtFile } from "./look.js";
import { digestVideo, scheduleVideoStep } from "./video-digest.js";
import { streamAccount } from "./video-keys.js";

type Db = SupabaseClient<Database>;

/** How many files one pass of the sweep asks after, and how far apart their looks come due. */
const SWEEP_TAKES = 50;
const SWEEP_LOOK_PACE_MS = 2 * SECOND_MS;
/** A removal is given this long to finish by itself before the sweep asks again, and this long before it stops asking. */
const PURGE_AGAIN_AFTER_MS = HOUR_MS;
const PURGE_AGAIN_UNTIL_MS = WEEK_MS;
/** A video Stream has not answered for this long is asked after; one past a day is its purge's to let go. */
const VIDEO_ASK_AFTER_MS = 2 * MIN_MS;

/**
 * file_purge: what a file left, let go. Throws when anything stays, so the ledger tries again. It also comes a day after every
 * upload begins (00551 file_start), so a live file is left alone, and bytes that never became a file only empty their
 * folder. What it empties that way is logged: an upload that arrived and was never told done, which nobody else can see. A
 * video still on its way a day on never arrived: it is removed then (00556 file_upload_lapsed), and let go as any removed one.
 */
async function purgeFile(db: Db, job: ClaimedJob): Promise<void> {
  const fileId = String(job.payload.file_id);
  let row = await findFileForWork(db, job.tenant_id, fileId);
  if (
    row &&
    !row.removed_at &&
    row.kind === "video" &&
    row.media_status === "uploading" &&
    job.payload.why === "start"
  ) {
    if (await removeLapsedUpload(db, job.tenant_id, fileId)) {
      logger({ tenant_id: job.tenant_id }).info("video_upload_lapsed", { file: fileId });
      row = await findFileForWork(db, job.tenant_id, fileId);
    }
  }
  if (row && !row.removed_at) return;
  if (row?.kind === "video" && row.media_ref) {
    // Stream first: the minutes are freed at once, and a video it no longer has (a 404) is gone already.
    const account = streamAccount();
    if (!account) throw new Error("file_purge: no Stream key to let the video go");
    if (!(await deleteStreamVideo(account, row.media_ref))) throw new Error("file_purge: Stream kept the video");
  }
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
 * The sweep's videos: one Stream has not answered for is asked after (ready is written as the webhook would, an error as a
 * failure, anything else left for the next pass), and one whose digest stopped short has the step it lacks scheduled again.
 */
async function keepVideosMoving(db: Db, nowMs: number): Promise<{ asked: number; digests: number }> {
  const account = streamAccount();
  const waiting = account
    ? await listVideosWaiting(db, {
        updatedBefore: new Date(nowMs - VIDEO_ASK_AFTER_MS).toISOString(),
        updatedAfter: new Date(nowMs - DAY_MS).toISOString(),
        limit: SWEEP_TAKES,
      })
    : [];
  for (const video of waiting) {
    if (!account || !video.media_ref) continue;
    const read = await readStreamVideo(account, video.media_ref);
    if (read.ok && read.video.ready)
      await markFileMediaReady(db, {
        mediaRef: video.media_ref,
        seconds: read.video.seconds,
        width: read.video.width,
        height: read.video.height,
      });
    else if (read.ok && read.video.state === "error")
      await markFileMediaFailed(db, video.media_ref, read.video.errorCode);
    // A video Stream no longer has, though it was sent: deleted there by hand, or lapsed. Its owner deletes the row.
    else if (!read.ok && read.gone && video.media_status === "processing")
      await markFileMediaFailed(db, video.media_ref, "ERR_NOT_AT_STREAM");
  }
  const stopped = await listVideosToDigestAgain(db, {
    triedBefore: new Date(nowMs - DAY_MS).toISOString(),
    bornAfter: new Date(nowMs - WEEK_MS).toISOString(),
    limit: SWEEP_TAKES,
  });
  for (const v of stopped) await scheduleVideoStep(db, v);
  return { asked: waiting.length, digests: stopped.length };
}

/**
 * The sweep's pass, every half hour: a look that failed or was lost is tried again a day on while the file is young, a raised
 * edition reads what the last one read, and a removal that has not finished is asked for again. Few at a time, with no clock
 * of its own. It catches its own failures: nothing else the sweep does waits on files.
 */
export async function keepFilesMoving(
  db: Db,
  nowMs = Date.now(),
): Promise<{ looks: number; purges: number; videos: number }> {
  const log = logger({});
  try {
    const looksOf = (kind: "image" | "video") =>
      listFilesToLookAgain(db, {
        kind,
        edition: kind === "image" ? FILE_LOOK_EDITION : VIDEO_LOOK_EDITION,
        triedBefore: new Date(nowMs - DAY_MS).toISOString(),
        bornAfter: new Date(nowMs - WEEK_MS).toISOString(),
        limit: SWEEP_TAKES,
        // A young video's wait is its digest's (keepVideosMoving): only an older edition's read is the look's alone.
        young: kind === "image",
      }).then((files) => files.map((f) => ({ ...f, kind })));
    const looks = [...(await looksOf("image")), ...(await looksOf("video"))].slice(0, SWEEP_TAKES);
    for (const [i, f] of looks.entries()) {
      await scheduleJobOnce(db, {
        tenantId: f.tenant_id,
        kind: "file_look",
        dueAt: new Date(nowMs + i * SWEEP_LOOK_PACE_MS),
        payload: { file_id: f.id, edition: String(f.kind === "image" ? FILE_LOOK_EDITION : VIDEO_LOOK_EDITION) },
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
    const videos = await keepVideosMoving(db, nowMs).catch((e: unknown) => {
      log.error("videos_sweep_failed", { error: errField(e) });
      return { asked: 0, digests: 0 };
    });
    return { looks: looks.length, purges: purges.length, videos: videos.asked + videos.digests };
  } catch (e) {
    log.error("files_sweep_failed", { error: errField(e) });
    return { looks: 0, purges: 0, videos: 0 };
  }
}

export function fileJobs(db: Db): NonNullable<JobContext["files"]> {
  return {
    look: (job, deadline) => lookAtFile(db, job, deadline),
    fetch: (job, deadline) => fetchFiles(db, job, deadline),
    purge: (job) => purgeFile(db, job),
    digest: (job, deadline) => digestVideo(db, job, deadline),
  };
}
