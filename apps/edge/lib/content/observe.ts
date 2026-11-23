/**
 * post_observe (00692; the content loop PRD's 9.1): one read of a post's numbers at one step, through its place's
 * adapter, every number Chanlytics names kept at once (post_observations_keep). A place that gives no numbers for a post
 * (Google, until a listing proves it) writes every number unsupported; one that cannot be asked now (not connected, the
 * numbers line off) writes them failed, and the next step reads again. Asked by the health sweep for each read that is
 * due and not kept (content/observe-due.ts); a read asked again writes over itself.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isOneOf,
  OBSERVE_STEPS,
  POST_METRICS,
  POST_PLACES,
  type MetricAvailability,
  type Observation,
  type PlaceAdapter,
} from "@chanlytics/contracts";
import { keepPostObservations } from "@chanlytics/db/content";
import { findPostForWork, type PostRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { ClaimedJob } from "@chanlytics/jobs";
import { logger } from "../shared/log.js";
import { sentPlacementOf } from "./take-down.js";

type Db = SupabaseClient<Database>;

/** The place a post's numbers are asked of: its adapter, or why it cannot be asked from here now. */
type ObservePlaceOf = (post: PostRow) => Promise<PlaceAdapter | { cant: string }>;

/** Every number at once, all standing the same way: none given, or a read that could not be made. */
const allAs = (availability: MetricAvailability): Observation[] =>
  POST_METRICS.map((metric) => ({ metric, value: null, availability }));

/** What the place says of the post's numbers now, as one row a number. */
async function observedNumbersOf(post: PostRow, placeOf: ObservePlaceOf): Promise<Observation[]> {
  if (!isOneOf(POST_PLACES, post.place)) return allAs("unsupported");
  const place = await placeOf(post);
  if ("cant" in place) return allAs("failed");
  if (!place.observe) return allAs("unsupported");
  return (await place.observe(sentPlacementOf(post))).observations;
}

/** post_observe: one read of one post's numbers, kept. */
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
  const rows = await observedNumbersOf(post, placeOf);
  await keepPostObservations(db, { tenantId: job.tenant_id, postId, step, rows });
  logger({ tenant_id: job.tenant_id }).info("observation_read", {
    post_id: postId,
    step,
    available: rows.filter((row) => row.availability === "available").length,
    withheld: rows.filter((row) => row.availability === "withheld").length,
    failed: rows.filter((row) => row.availability === "failed").length,
  });
}
