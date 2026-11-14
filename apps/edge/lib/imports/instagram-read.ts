/**
 * An Instagram account's posts and reels brought in (00626, Content's empty state, 14 Nov 2026), from a link its owner pasted
 * and pressed in by Ask's card: the scraping platform's Instagram actor asked for the account's newest posts, the run asked
 * after until it is done, then each post's picture, each slide of a carousel and each reel handed to file_fetch, which keeps
 * each once and waits it in the Library for a Keep. Their addresses expire within hours, so they are handed on the moment the
 * run is read. Only the account's own posts: one another account posted is passed over. The ledger's `instagram` line says
 * where it stands, for the page's card.
 *
 * Platform-spent, as a website's read is: about a fifth of a cent a post, a read at most INSTAGRAM_POSTS_MAX posts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MIN_MS, recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { noteImport } from "@chanlytics/db/imports";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce, type ClaimedJob, type JobContext } from "@chanlytics/jobs";
import { leadSourceClient } from "../leads/sources.js";
import { askForFoundFiles, type FoundFile } from "../files/found.js";
import { logger } from "../shared/log.js";

type Db = SupabaseClient<Database>;

/** Apify's own Instagram actor, at its latest build: no pin of ours yet (a pin is the operator's, read with the key). */
const INSTAGRAM_ACTOR = "apify/instagram-scraper";
const INSTAGRAM_BUILD = "latest";
/** The newest posts a read brings: enough to make from, at about $0.12 a read. */
const INSTAGRAM_POSTS_MAX = 50;
/** The most a read may spend at the platform, its run's own cap. */
const RUN_CHARGE_MAX_USD = 0.5;
const RUN_TIMEOUT_S = 300;
/** How long after a step the run is asked after again, and how many times before the read is said to have stopped. */
const ASK_AFTER_MS = MIN_MS / 2;
const ASKS_MAX = 20;

/** What a post's item says, of what the actor writes (its dataset's fields). */
const ITEM_FIELDS = ["type", "shortCode", "ownerUsername", "displayUrl", "videoUrl", "images", "childPosts"];

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
    if (part.type === "Video" && typeof part.videoUrl === "string" && part.videoUrl)
      return [{ url: part.videoUrl, ref: `instagram:${ref}`, kind: "video" }];
    return typeof part.displayUrl === "string" && part.displayUrl
      ? [{ url: part.displayUrl, ref: `instagram:${ref}` }]
      : [];
  };
  if (post.type === "Sidecar" && Array.isArray(post.childPosts))
    return post.childPosts.flatMap((child, i) => one(recordOrEmpty(child), `${code}:${i}`));
  return one(post, code);
}

/**
 * The read asked for: its first step, once while one waits for the account, and the ledger's line set to say it is on its
 * way, under the account's handle.
 */
export async function scheduleInstagramRead(db: Db, tenantId: TenantId, handle: string): Promise<void> {
  await noteImport(db, { tenantId, source: "instagram", state: "queued", via: handle, counts: {} });
  await scheduleJobOnce(db, {
    tenantId,
    kind: "instagram_read",
    dueAt: new Date(),
    payload: { handle, step: "start", try: "0" },
  });
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
    const run = await client.startRun(
      INSTAGRAM_ACTOR,
      {
        directUrls: [`https://www.instagram.com/${handle}/`],
        resultsType: "posts",
        resultsLimit: INSTAGRAM_POSTS_MAX,
        addParentData: false,
      },
      { build: INSTAGRAM_BUILD, timeoutSecs: RUN_TIMEOUT_S, maxTotalChargeUsd: RUN_CHARGE_MAX_USD, webhooks: [] },
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
  const files = items.flatMap((item) => instagramFilesOf(item, handle));
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
