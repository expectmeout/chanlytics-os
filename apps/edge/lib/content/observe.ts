/**
 * post_observe (00699; the content loop PRD's 9.1): one read of a post's numbers at one step, through its place's
 * adapter, every number Chanlytics names kept at once (post_observations_keep). A place that gives no numbers for a post
 * (Google, until a listing proves it) writes every number unsupported; one that cannot be asked now (not connected, the
 * numbers line off) writes them failed, and the next step reads again. Asked by the health sweep for each read that is
 * due and not kept (content/observe-due.ts); a read asked again writes over itself. And a post's last numbers, read by
 * its take-down just before the place is asked (keepLastNumbers).
 *
 * A read that gave no number asks the place whether it still holds the post: one removed on the place itself (by its
 * owner there, or by the place) is taken down here too, and its owner told once (settleGone).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isOneOf,
  OBSERVE_STEPS,
  POST_METRICS,
  POST_PLACES,
  storyRanItsDay,
  type MetricAvailability,
  type Observation,
  type ObserveStep,
  type PlaceAdapter,
  type TenantId,
} from "@chanlytics/contracts";
import { keepPostObservations } from "@chanlytics/db/content";
import { findPostForWork, isPostTakeDownAsking, movePost, type PostRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { ClaimedJob } from "@chanlytics/jobs";
import { logAndGoOn } from "@chanlytics/log";
import { tellPostGone } from "../files/post-told.js";
import { logger } from "../shared/log.js";
import { sentPlacementOf } from "./placement.js";

type Db = SupabaseClient<Database>;

/** The place a post's numbers are asked of: its adapter, or why it cannot be asked from here now. */
type ObservePlaceOf = (post: PostRow) => Promise<PlaceAdapter | { cant: string }>;

/** Every number at once, all standing the same way: none given, or a read that could not be made. */
const allAs = (availability: MetricAvailability): Observation[] =>
  POST_METRICS.map((metric) => ({ metric, value: null, availability }));

/** What one read came to: a row a number, and the place it asked, where one could be asked. */
interface NumbersRead {
  rows: Observation[];
  place: PlaceAdapter | null;
}

/** What the place says of the post's numbers now, as one row a number. */
async function readNumbersOf(post: PostRow, placeOf: ObservePlaceOf): Promise<NumbersRead> {
  if (!isOneOf(POST_PLACES, post.place)) return { rows: allAs("unsupported"), place: null };
  const place = await placeOf(post);
  if ("cant" in place) return { rows: allAs("failed"), place: null };
  if (!place.observe) return { rows: allAs("unsupported"), place };
  return { rows: (await place.observe(sentPlacementOf(post))).observations, place };
}

/** A read in which the place gave no number at all: every one asked failed (none given, kept back or not there yet). */
const noNumberCame = (rows: readonly Observation[]): boolean =>
  rows.some((row) => row.availability === "failed") &&
  rows.every((row) => row.availability === "failed" || row.availability === "unsupported");

/**
 * Whether the place no longer holds a post whose numbers did not come, asked of the account itself as "I deleted it"
 * is (Instagram's status: by the post's own id, then the account's own list, with the same connection). Meta answers a
 * read of a post that is gone as it answers one it may not read (code 100, subcode 33: the 21 Nov 2026 picture, read on
 * 24 Nov), so a failed read proves nothing alone. Not asked: a post with no id at its place (only its time and words
 * could find it, too little to call it gone), and a story past its day, which ended by itself. A read that fails says
 * nothing, and the next step asks again.
 */
async function askWhetherGone(place: PlaceAdapter, post: PostRow, nowMs: number): Promise<boolean> {
  if (!post.external_id || !place.status) return false;
  if (storyRanItsDay(post, nowMs)) return false;
  const state = await place
    .status(sentPlacementOf(post))
    .catch(logAndGoOn("a post's place, asked if it holds it", null));
  return state?.is === "not_up";
}

/**
 * A post its place no longer holds: taken down, as the place shows, and its owner told once, as a take-down that came
 * through is. Moved from published only, so two reads never both move it nor both ring. A take-down still asking is
 * left to settle it, and to ring once.
 */
async function settleGone(db: Db, tenantId: TenantId, post: PostRow, step: ObserveStep): Promise<void> {
  const log = logger({ tenant_id: tenantId });
  if (await isPostTakeDownAsking(db, tenantId, post.id)) {
    log.info("post_gone", { post_id: post.id, place: post.place, step, moved: false, take_down: "asking" });
    return;
  }
  const moved = await movePost(db, { postId: post.id, from: ["published"], to: "taken_down" });
  log.info("post_gone", { post_id: post.id, place: post.place, step, moved });
  if (moved) await tellPostGone(db, post);
}

/** post_observe: one read of one post's numbers, kept; where none came, and the place no longer holds it, taken down. */
export async function readPostResults(
  db: Db,
  job: ClaimedJob,
  placeOf: ObservePlaceOf,
): Promise<void | { skipped: string }> {
  const postId = typeof job.payload.post_id === "string" ? job.payload.post_id : "";
  const step = job.payload.step;
  if (!postId || !isOneOf(OBSERVE_STEPS, step)) return { skipped: "unnamed" };
  const post = await findPostForWork(db, job.tenant_id, postId);
  if (!post) return { skipped: "gone" };
  // A post taken down, or never up, has no numbers to read now; what was read before it came down stays.
  if (post.status !== "published") return { skipped: post.status };
  const { rows, place } = await readNumbersOf(post, placeOf);
  await keepPostObservations(db, { tenantId: job.tenant_id, postId, step, rows });
  logger({ tenant_id: job.tenant_id }).info("observation_read", {
    post_id: postId,
    step,
    available: rows.filter((row) => row.availability === "available").length,
    withheld: rows.filter((row) => row.availability === "withheld").length,
    failed: rows.filter((row) => row.availability === "failed").length,
  });
  if (place && noNumberCame(rows) && (await askWhetherGone(place, post, Date.now())))
    await settleGone(db, job.tenant_id, post, step);
}

/**
 * A post's last numbers, read just before its take-down asks the place (the content loop PRD's 8.3 and 9.1): once the
 * post is down Meta answers for them as for nothing (code 100, subcode 33), so what is not read now never can be. Kept at
 * the step `last`, with only what the read gave: a number that failed or is not there yet is left out, so the reading
 * before it stands, and a read that gave nothing keeps nothing.
 */
export async function keepLastNumbers(
  db: Db,
  tenantId: TenantId,
  post: PostRow,
  placeOf: ObservePlaceOf,
): Promise<void> {
  const { rows: read } = await readNumbersOf(post, placeOf);
  const rows = read.filter((row) => row.availability !== "failed" && row.availability !== "delayed");
  if (!rows.some((row) => row.availability === "available" || row.availability === "withheld")) return;
  await keepPostObservations(db, { tenantId, postId: post.id, step: "last", rows });
  logger({ tenant_id: tenantId }).info("observation_read", {
    post_id: post.id,
    step: "last",
    available: rows.filter((row) => row.availability === "available").length,
    withheld: rows.filter((row) => row.availability === "withheld").length,
    failed: read.length - rows.length,
  });
}
