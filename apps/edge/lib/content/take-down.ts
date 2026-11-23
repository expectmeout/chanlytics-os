/**
 * post_take_down (00682; the content loop PRD's 5.3 and 8.3): one remediation action asked of its place, through the
 * place's adapter, and what the place said kept by the action's own door. A post is taken down only when its place said
 * so. A place that cannot be asked, or that refuses, leaves the step to the owner in words (needs_person), with the
 * place's own link on the piece; a place that gives no answer is asked again, further apart each time, for a day, and
 * then the job fails to us: the action stays pending, and the piece says Chanlytics is on it.
 *
 * After the owner's "I deleted it" (payload `by_hand`), nothing is asked down: the place is only read. Gone settles it;
 * still up hands it back to the owner; a place that cannot be read takes their word.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HOUR_MS,
  MIN_MS,
  ON_INSTAGRAM,
  TAKE_DOWN_WORDS,
  isOneOf,
  POST_PLACES,
  type PlaceAdapter,
  type SentPlacement,
  type TakeDownSettled,
} from "@chanlytics/contracts";
import { findPostForWork, findTakeDownAction, settlePostTakeDown, type PostRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce, type ClaimedJob } from "@chanlytics/jobs";
import { tellTakeDownMoved } from "../files/post-told.js";
import { logger } from "../shared/log.js";

type Db = SupabaseClient<Database>;

/**
 * How long each ask waits for the next where the place gave no answer: two minutes, ten, an hour, six, and at a day the
 * last. Past the last the job fails, and a take-down nobody confirmed in a day is ours to chase.
 */
const TAKE_DOWN_WAITS_MS = [2 * MIN_MS, 10 * MIN_MS, HOUR_MS, 6 * HOUR_MS, 17 * HOUR_MS] as const;

const attemptOf = (job: ClaimedJob): number => {
  const n = Number.parseInt(typeof job.payload.attempt === "string" ? job.payload.attempt : "1", 10);
  return Number.isInteger(n) && n >= 1 ? n : 1;
};

/** A post as its place's adapter is asked about it (its take-down here, its numbers in observe.ts). */
export const sentPlacementOf = (post: PostRow): SentPlacement => ({
  postId: post.id,
  kind: post.kind === "story" || post.kind === "reel" ? post.kind : "picture",
  externalId: post.external_id,
  caption: post.caption,
  sentAt: post.published_at ?? post.updated_at,
});

/**
 * The place a post is asked down at: its adapter, or the words for why the place cannot be asked from here (not
 * connected). Handed in by the job runner's wiring (ops/jobs-tick.ts), which knows each place.
 */
type TakeDownPlaceOf = (post: PostRow) => Promise<PlaceAdapter | { cant: string }>;

/** The same action asked again later, or, past the last wait, a failure that is ours: no answer in a day. */
async function askDownAgain(db: Db, job: ClaimedJob, actionId: string, byHand: boolean): Promise<{ skipped: string }> {
  const attempt = attemptOf(job);
  const wait = TAKE_DOWN_WAITS_MS[attempt - 1];
  if (wait === undefined) {
    logger({ tenant_id: job.tenant_id }).error("take_down_unconfirmed", { action_id: actionId, attempts: attempt });
    throw new Error(`take-down ${actionId}: no answer from the place in a day`);
  }
  await scheduleJobOnce(db, {
    tenantId: job.tenant_id,
    kind: "post_take_down",
    dueAt: new Date(Date.now() + wait),
    payload: { action_id: actionId, attempt: String(attempt + 1), ...(byHand ? { by_hand: "yes" } : {}) },
  });
  return { skipped: "asked_again" };
}

/** What the place holds after "I deleted it": gone, still up (the owner's again), or no answer. */
async function readAfterByHand(place: PlaceAdapter, post: PostRow): Promise<TakeDownSettled | "pending"> {
  // A place that cannot be read takes the owner's word.
  if (!place.status) return "done";
  const state = await place.status(sentPlacementOf(post));
  if (state.is === "not_up") return "done";
  return state.is === "up" ? "needs_person" : "pending";
}

/** post_take_down: one action asked of its place, and what the place said kept. */
export async function takePostDown(
  db: Db,
  job: ClaimedJob,
  placeOf: TakeDownPlaceOf,
): Promise<void | { skipped: string }> {
  const actionId = typeof job.payload.action_id === "string" ? job.payload.action_id : "";
  const byHand = job.payload.by_hand === "yes";
  const action = await findTakeDownAction(db, actionId);
  if (!action) return { skipped: "gone" };
  if (action.outcome !== "pending") return { skipped: action.outcome };
  const post = await findPostForWork(db, action.tenant_id, action.target_id);
  const settle = async (outcome: TakeDownSettled, words: string | null) => {
    const answer = await settlePostTakeDown(db, { actionId, outcome, said: words });
    logger({ tenant_id: action.tenant_id }).info("take_down_settled", {
      action_id: actionId,
      outcome,
      kept: answer.kept,
    });
    // The bell: gone from every place, or, at a place's first refusal of a post still up, the owner's to delete there.
    const toOwner = outcome !== "done" && !byHand && post?.status === "published";
    await tellTakeDownMoved(db, action.tenant_id, answer, { toOwner });
  };
  // The post's row is gone with its file: nothing here is left to say it is up.
  if (!post) return settle("not_possible", null);
  if (post.status === "taken_down") return settle("done", null);
  // Still being sent: it cannot be asked down before the place has it. Asked again once the send has landed.
  if (post.status === "publishing" || post.status === "checking") return askDownAgain(db, job, actionId, byHand);
  if (post.status !== "published") return settle("not_possible", null);
  if (!isOneOf(POST_PLACES, post.place)) return settle("not_possible", null);
  const place = await placeOf(post);
  if ("cant" in place) return settle("needs_person", place.cant);
  if (byHand) {
    const seen = await readAfterByHand(place, post);
    if (seen === "pending") return askDownAgain(db, job, actionId, true);
    return settle(seen, seen === "needs_person" ? TAKE_DOWN_WORDS.stillUp(post.place) : null);
  }
  if (!place.takeDown) return settle("needs_person", ON_INSTAGRAM.takeDown.byHand);
  const answer = await place.takeDown(sentPlacementOf(post));
  if (answer.outcome === "pending") return askDownAgain(db, job, actionId, false);
  return settle(answer.outcome, answer.said);
}
