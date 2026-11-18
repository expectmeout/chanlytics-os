/**
 * An Instagram account's posts and reels brought in (00626, Content's empty state, 14 Nov 2026), from a link its owner pasted
 * and pressed in by Ask's card: the scraping platform's Instagram actor asked for the account's newest posts, the run asked
 * after until it is done, then each post's picture, each slide of a carousel and each reel handed to file_fetch, which keeps
 * each once and waits it in the Library for a Keep. Their addresses expire within hours, so they are handed on the moment the
 * run is read. Only the account's own posts: one another account posted is passed over. The ledger's `instagram` line says
 * where it stands, for the page's card.
 *
 * Platform-spent, as a website's read is: about a fifth of a cent a post, a read at most INSTAGRAM_POSTS_MAX posts. So a
 * read is paced and budgeted (00642 found_read_spend; the footage sources plan's F5 and D21): an account is read once in
 * a day, a workspace asks for a few reads in a day, the platform for so many, and a second paste inside the day spends
 * nothing and says when it was read and what came. A read after the first asks only for what is newer. A read hands on
 * a bounded number of files, newest first, and says each reel's length, so a video is let in by it (F3).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MIN_MS, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { noteImport, spendFoundRead } from "@chanlytics/db/imports";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce, type ClaimedJob, type JobContext } from "@chanlytics/jobs";
import type { ApifyClient } from "@chanlytics/channels/leads";
import { leadSourceClient, watchPins, type WatchedPin } from "../leads/sources.js";
import { askForFoundFiles, type FoundFile } from "../files/found.js";
import { FOUND_READ_BUDGETS } from "../files/takes/budgets.js";
import type { PagePorts } from "../shared/alerts/page-operator.js";
import { logger } from "../shared/log.js";

type Db = SupabaseClient<Database>;

/** What a post's item says, of what the actor writes (its dataset's fields). */
const ITEM_FIELDS = [
  "type",
  "shortCode",
  "ownerUsername",
  "displayUrl",
  "videoUrl",
  "videoDuration",
  "timestamp",
  "images",
  "childPosts",
];

/**
 * Apify's own Instagram actor, pinned: the build a read starts, and that build's id, which the health sweep reads each
 * tick (leads/sources.ts watchPins), so a build the provider deleted pages us before an owner's paste meets it. Pinned
 * 18 Nov 2026 to the build its `latest` named that day. Before the pin a read started whatever build was latest.
 */
const INSTAGRAM_PIN: WatchedPin = {
  actor: "apify/instagram-scraper",
  build: "0.0.867",
  buildId: "OlhAMG6xbGzbdIKRQ",
  source: "photo source",
  run: "read of an Instagram account",
  probe:
    `with one account's read (a few posts), check its items carry what the read takes (${ITEM_FIELDS.join(", ")}), ` +
    "then pin its number and id in apps/edge/lib/imports/instagram-read.ts.",
};

/** Each health sweep: the Instagram actor's pin, watched as the lead finder's are. Answers how many were gone. */
export const watchInstagramPin = (
  db: Db,
  apify: ApifyClient | null,
  pager: Omit<PagePorts, "db"> = {},
): Promise<number> => watchPins(db, apify, [INSTAGRAM_PIN], pager);

/** The newest posts a read brings: enough to make from, at about $0.12 a read. */
const INSTAGRAM_POSTS_MAX = 50;
/** The most a read may spend at the platform, its run's own cap. */
const RUN_CHARGE_MAX_USD = 0.5;
const RUN_TIMEOUT_S = 300;
/** How long after a step the run is asked after again, and how many times before the read is said to have stopped. */
const ASK_AFTER_MS = MIN_MS / 2;
const ASKS_MAX = 20;

/** The words the ledger's line says when the read stopped. */
const READ_STOPPED = {
  noKey: "Instagram can't be read on this deployment yet.",
  failed: "Instagram didn't answer. Paste the link again in a while.",
} as const;

/** A post's pictures and video, as file_fetch takes them, each known by its post's code so the same post is one file. */
function instagramFilesOf(raw: unknown, handle: string): FoundFile[] {
  const post = recordOrEmpty(raw);
  const code = typeof post.shortCode === "string" ? post.shortCode : "";
  const owner = typeof post.ownerUsername === "string" ? post.ownerUsername.toLowerCase() : "";
  // Only the account's own posts: a collaboration another account posted is theirs.
  if (!code || owner !== handle) return [];
  const one = (part: Record<string, unknown>, ref: string): FoundFile[] => {
    // A reel says its own length, in seconds: the door lets it in by it. One that says none is judged when the video
    // platform says it.
    const seconds =
      typeof part.videoDuration === "number" && Number.isFinite(part.videoDuration) && part.videoDuration > 0
        ? part.videoDuration
        : null;
    if (part.type === "Video" && typeof part.videoUrl === "string" && part.videoUrl)
      return [{ url: part.videoUrl, ref: `instagram:${ref}`, kind: "video", seconds }];
    return typeof part.displayUrl === "string" && part.displayUrl
      ? [{ url: part.displayUrl, ref: `instagram:${ref}` }]
      : [];
  };
  if (post.type === "Sidecar" && Array.isArray(post.childPosts))
    return post.childPosts.flatMap((child, i) => one(recordOrEmpty(child), `${code}:${i}`));
  return one(post, code);
}

/** A post's own time, as the actor writes it (ISO, so it sorts as text); "" for one that says none. */
const postedAt = (raw: unknown): string => {
  const at = recordOrEmpty(raw).timestamp;
  return typeof at === "string" ? at : "";
};

/**
 * What a read hands on: the account's own posts newest first (a pinned post comes first in the feed, however old), each
 * its files, and at most a read's files of them, a carousel's slides counted (D21).
 */
function readFilesOf(items: readonly unknown[], handle: string): FoundFile[] {
  const newestFirst = [...items].sort((a, b) => postedAt(b).localeCompare(postedAt(a)));
  return newestFirst.flatMap((item) => instagramFilesOf(item, handle)).slice(0, FOUND_READ_BUDGETS.filesARead);
}

/**
 * What became of a read that was asked for: started; read inside the day already (when, whether it is still on its way,
 * and what it brought); or one of the day's budgets binds, and until when.
 */
type InstagramReadAsked =
  | { fate: "instagram" }
  | { fate: "read_lately"; readAt: Date; reading: boolean; photos: number; videos: number }
  | { fate: "wait"; binds: "workspace_reads" | "platform_reads"; until: Date };

/**
 * The read asked for. Its pace and budget first, in one statement (00642 found_read_spend): an account read inside the
 * day is not read again, and a budget that binds starts nothing. Then its first step, once while one waits for the
 * account, and the ledger's line set to say it is on its way, under the account's handle.
 */
export async function scheduleInstagramRead(db: Db, tenantId: TenantId, handle: string): Promise<InstagramReadAsked> {
  const spent = await spendFoundRead(db, {
    tenantId,
    source: "instagram",
    account: handle,
    workspaceMax: FOUND_READ_BUDGETS.workspaceReadsADay,
    platformMax: FOUND_READ_BUDGETS.platformReadsADay,
  });
  if (spent.fate === "wait") {
    // A day's budget bound, as a take's does: one name for both, told apart by its road.
    logger({ tenant_id: tenantId }).info("source_take_waits", { road: "instagram", binds: spent.binds });
    return spent;
  }
  if (spent.fate === "read_lately")
    return {
      fate: "read_lately",
      readAt: spent.readAt,
      reading: spent.state === "queued" || spent.state === "running",
      photos: spent.counts.photos ?? 0,
      videos: spent.counts.videos ?? 0,
    };
  await noteImport(db, { tenantId, source: "instagram", state: "queued", via: handle, counts: {} });
  await scheduleJobOnce(db, {
    tenantId,
    kind: "instagram_read",
    dueAt: new Date(),
    payload: { handle, step: "start", try: "0", ...(spent.since ? { since: spent.since.toISOString() } : {}) },
  });
  return { fate: "instagram" };
}

async function noteStopped(db: Db, tenantId: TenantId, handle: string, error: string): Promise<void> {
  await noteImport(db, { tenantId, source: "instagram", state: "failed", via: handle, error });
}

async function askAfter(
  db: Db,
  job: ClaimedJob,
  payload: { handle: string; run_id: string; dataset_id: string },
  tries: number,
): Promise<void> {
  await scheduleJobOnce(db, {
    tenantId: job.tenant_id,
    kind: "instagram_read",
    dueAt: new Date(Date.now() + ASK_AFTER_MS),
    payload: { ...payload, step: "collect", try: String(tries) },
  });
}

/** A payload's word, as the job carries it: text, or nothing. */
const payloadText = (v: unknown): string => (typeof v === "string" ? v : "");

/** One step of a read: the run started, or asked after and, once done, its posts handed on. */
async function readInstagram(db: Db, job: ClaimedJob): Promise<void> {
  const handle = payloadText(job.payload.handle).toLowerCase();
  const log = logger({ tenant_id: job.tenant_id });
  const client = leadSourceClient();
  if (!client) return noteStopped(db, job.tenant_id, handle, READ_STOPPED.noKey);
  if (job.payload.step !== "collect") {
    const since = payloadText(job.payload.since);
    const run = await client.startRun(
      INSTAGRAM_PIN.actor,
      {
        directUrls: [`https://www.instagram.com/${handle}/`],
        resultsType: "posts",
        resultsLimit: INSTAGRAM_POSTS_MAX,
        addParentData: false,
        // Only what is newer than the account's last whole read: it costs less, and brings no twins.
        ...(since ? { onlyPostsNewerThan: since } : {}),
      },
      { build: INSTAGRAM_PIN.build, timeoutSecs: RUN_TIMEOUT_S, maxTotalChargeUsd: RUN_CHARGE_MAX_USD, webhooks: [] },
    );
    await noteImport(db, { tenantId: job.tenant_id, source: "instagram", state: "running", via: handle });
    return askAfter(db, job, { handle, run_id: run.id, dataset_id: run.datasetId }, 1);
  }
  const runId = payloadText(job.payload.run_id);
  const datasetId = payloadText(job.payload.dataset_id);
  const tries = Number(payloadText(job.payload.try)) || 0;
  const run = await client.getRun(runId);
  if (run.status === "READY" || run.status === "RUNNING") {
    if (tries >= ASKS_MAX) return noteStopped(db, job.tenant_id, handle, READ_STOPPED.failed);
    return askAfter(db, job, { handle, run_id: runId, dataset_id: datasetId }, tries + 1);
  }
  if (run.status !== "SUCCEEDED") {
    log.warn("file_fetch_failed", { source: "instagram", step: "run", status: run.status });
    return noteStopped(db, job.tenant_id, handle, READ_STOPPED.failed);
  }
  const { items } = await client.listItems(datasetId, 0, INSTAGRAM_POSTS_MAX, ITEM_FIELDS);
  const files = readFilesOf(items, handle);
  // Nothing of the account's own: the line says so, with nothing to wait for.
  if (files.length === 0) {
    await noteImport(db, { tenantId: job.tenant_id, source: "instagram", state: "done", via: handle, counts: {} });
    return;
  }
  await askForFoundFiles(db, job.tenant_id, { source: "instagram", items: files });
}

export function instagramReader(db: Db): NonNullable<JobContext["instagram"]> {
  return { read: (job: ClaimedJob) => readInstagram(db, job) };
}
