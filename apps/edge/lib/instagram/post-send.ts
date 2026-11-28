/**
 * A post sent (00611, decision 0121; 00681): post_publish and post_reconcile, through Instagram's adapter
 * (place.ts). Publishing works like a payment: the send is made once, and an answer that never came
 * proves nothing, so it is never sent again blind.
 *
 * Right before the send, the recheck: whoever approved it may still post for the business, the post was not pulled or
 * removed, everything is not stopped, it still stands as approved (00681 post_as_approved: its words, its bytes and its
 * version), and Instagram is still connected with posting allowed. Anything moved holds the post in words and sends
 * nothing, up to the moment of sending. Then the job says it is about to speak (ledger markSpoke), and Instagram is asked
 * to publish. A refusal fails the post in the owner's words, but for Instagram being busy on a first send, which is asked
 * again as a send with no answer is; no answer leaves it Checking, and two minutes on the reconcile asks Instagram what it
 * has: the container's status and the account's newest posts. Up when Instagram says the container was published, or the
 * account shows a post with the caption this one was sent with; one found by its time alone (a story carries no caption)
 * is where the post is, never proof that it went up. Not up, one more attempt begins, never a third (post-ready.ts: it
 * asks after the first container again before it makes anything).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MIN_MS,
  ON_INSTAGRAM,
  POST_PLACES,
  isOneOf,
  type PlaceAdapter,
  type PlacementToSend,
} from "@chanlytics/contracts";
import {
  closePostAttempt,
  findPostForWork,
  markPostUnanswered,
  movePost,
  openPostAttempt,
  type PostRow,
} from "@chanlytics/db/files";
import { CertainFailure, isCertainFailure } from "@chanlytics/core";
import { logAndGoOn } from "@chanlytics/log";
import { MAX_ATTEMPTS, markSpoke, scheduleJobOnce, type ClaimedJob, type JobContext } from "@chanlytics/jobs";
import { findVersionDrawing } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { settleNeverUp } from "../files/post-never-up.js";
import { logger } from "../shared/log.js";
import {
  OPENING_ASK_MS,
  askAgainOrHold,
  holdPlacement,
  readSendRecheck,
  type SendHold,
  type SendUnread,
} from "../content/recheck.js";
import type { Posting } from "../content/posting.js";
import {
  HOLDABLE,
  beginSecondAttempt,
  findOnTheAccount,
  instagramKindOf,
  keepPublished,
  postingOf,
  postJobOf,
  preparePost,
  refusalKept,
  postRefusalOf,
  type PostDeps,
} from "./post-ready.js";

type Db = SupabaseClient<Database>;

/**
 * The recheck: why the post may not go now, in the owner's words, that the open time it promises could not be read, or
 * the poster it goes through.
 */
async function recheck(db: Db, post: PostRow, deps: PostDeps): Promise<Posting | SendHold | SendUnread> {
  const bytes = await readSendRecheck(db, post, { approver: true });
  if ("held" in bytes || "unread" in bytes) return bytes;
  return postingOf(db, post, deps);
}

/** One send in hand: the post, who posts it, which attempt, and the row the send is kept on. */
interface Sending {
  post: PostRow;
  posting: Posting;
  place: PlaceAdapter;
  attempt: 1 | 2;
  attemptId: string;
  containerId: string;
}

/** The post as its place is handed it at the send: the container already holds its media and its words. */
const sendingOf = (post: PostRow): PlacementToSend => ({
  postId: post.id,
  kind: instagramKindOf(post),
  caption: post.caption,
  mediaUrl: "",
  says: null,
  language: null,
  book: false,
});

/**
 * Instagram refused the send. A second send may be of a container that went up through the first after all, which
 * Instagram may refuse to publish again (Meta's pages do not say; seen on no real account yet). So its status is asked:
 * published, the post is up. Any other refusal took nothing: the post did not go up, in the owner's words.
 */
async function refusedSend(
  db: Db,
  at: Sending,
  sent: Extract<Awaited<ReturnType<PlaceAdapter["publish"]>>, { is: "refused" }>,
): Promise<void> {
  const { post } = at;
  if (at.attempt === 2) {
    const state = await at.place.preparedState?.(at.containerId, instagramKindOf(post));
    if (state?.is === "published") {
      const found = await findOnTheAccount(db, { post, posting: at.posting }).catch(
        logAndGoOn("post's address after a second send found it up", null),
      );
      await closePostAttempt(db, {
        attemptId: at.attemptId,
        outcome: "refused",
        httpStatus: sent.kept.status,
        answer: sent.kept.json,
        externalId: found?.externalId ?? null,
      });
      await keepPublished(db, post, {
        from: ["publishing"],
        media: found,
        accountId: at.posting.accountId,
        seen: found !== null,
      });
      return;
    }
  }
  const error = refusalKept(sent.refusal);
  await closePostAttempt(db, {
    attemptId: at.attemptId,
    outcome: "refused",
    httpStatus: sent.kept.status,
    answer: sent.kept.json,
    error,
  });
  const refused = postRefusalOf(sent.refusal, `post ${post.id}`);
  // Only busy, on the first send: a refusal took nothing, so it is tried once more by itself, the way a send with no answer
  // is: Checking, the reconcile two minutes on, then the second and last attempt, which asks after this container before it
  // sends (post-ready.ts). The owner hears of it only when that one is refused too (Ruben, 12 Nov 2026).
  if (at.attempt === 1 && !isCertainFailure(refused) && (await markPostUnanswered(db, post.id, 1))) return;
  await movePost(db, { postId: post.id, from: ["publishing"], to: "failed", patch: { error } });
  throw new CertainFailure(refused.message, error.words);
}

/** How long a send waits for a new version of its piece, a minute at a time: a version is drawn in a minute or two. */
const VERSION_WAIT_MS = MIN_MS;
const VERSION_WAITS_MOST = 10;

/**
 * How often a send has asked again already, for each thing it asks again for (a version being made; an opening that
 * could not be read), as its next ask carries them: both, always, so the next ask's once-only key is its own
 * (job_kinds.once_parts, 00728) and never the key of the send that writes it.
 */
const asksMadeOf = (job: ClaimedJob): { wait: string; unread: string } => ({
  wait: String(Number(job.payload.wait ?? 0) || 0),
  unread: String(Number(job.payload.unread ?? 0) || 0),
});

/**
 * Nothing of a piece goes up while a new version of it is drawn (00708, the version board's call 14): the send asks again a
 * minute on. Once the version plays, what was approved of the one before stops standing and the recheck holds it; a
 * version that could not be made leaves the post to go as approved. Past its most waits, it goes as approved.
 */
async function waitsForVersion(db: Db, post: PostRow, job: ClaimedJob): Promise<boolean> {
  if (!post.piece_id) return false;
  const drawing = await findVersionDrawing(db, post.tenant_id, post.piece_id);
  const waits = Number(job.payload.wait ?? 0) || 0;
  if (!drawing || drawing.failed || waits >= VERSION_WAITS_MOST) return false;
  await scheduleJobOnce(db, {
    tenantId: post.tenant_id,
    kind: "post_publish",
    dueAt: new Date(Date.now() + VERSION_WAIT_MS),
    payload: {
      post_id: post.id,
      attempt: String(postJobOf(job).attempt),
      ...asksMadeOf(job),
      wait: String(waits + 1),
    },
  });
  logger({ tenant_id: post.tenant_id }).info("placement_waits_for_version", { post_id: post.id, waits: waits + 1 });
  return true;
}

/** post_publish: the recheck, then the one send. */
async function publishPost(db: Db, job: ClaimedJob, deps: PostDeps = {}): Promise<void | { skipped: string }> {
  const { postId, attempt } = postJobOf(job);
  const post = await findPostForWork(db, job.tenant_id, postId);
  if (!post) return { skipped: "gone" };
  if (post.status !== "preparing" || !post.container_id) return { skipped: post.status };
  instagramKindOf(post);
  if (await waitsForVersion(db, post, job)) return { skipped: "version" };
  const posting = await recheck(db, post, deps);
  // The open time it promises could not be read (00728): asked again a minute on, then held, never sent on a guess.
  if ("unread" in posting)
    return askAgainOrHold(db, post, job, {
      ...posting,
      from: HOLDABLE,
      again: (unread) =>
        scheduleJobOnce(db, {
          tenantId: post.tenant_id,
          kind: "post_publish",
          dueAt: new Date(Date.now() + OPENING_ASK_MS),
          payload: { post_id: post.id, attempt: String(attempt), ...asksMadeOf(job), unread },
        }),
    });
  if ("held" in posting) return holdPlacement(db, post, { ...posting, from: HOLDABLE });
  if (!(await movePost(db, { postId: post.id, from: ["preparing"], to: "publishing" }))) return { skipped: "moved" };
  const { place } = posting;
  const opened = await openPostAttempt(db, {
    postId: post.id,
    attemptNo: attempt,
    step: "publish",
    request: { creation_id: post.container_id },
  });
  await markSpoke(db, job);
  const sent = await place.publish(sendingOf(post), post.container_id);
  if (sent.is === "refused")
    return refusedSend(
      db,
      { post, posting, place, attempt, attemptId: opened.id, containerId: post.container_id },
      sent,
    );
  if (sent.is === "unknown") {
    // No answer proves nothing: Checking, and Instagram is asked what it has before anything is sent again.
    await closePostAttempt(db, {
      attemptId: opened.id,
      outcome: "no_answer",
      httpStatus: sent.kept.status,
      answer: null,
    });
    await markPostUnanswered(db, post.id, attempt);
    logger({ tenant_id: job.tenant_id }).warn("post_no_answer", { post_id: post.id });
    return;
  }
  await closePostAttempt(db, {
    attemptId: opened.id,
    outcome: "ok",
    httpStatus: sent.kept.status,
    answer: sent.kept.json,
    externalId: sent.media.externalId,
  });
  await keepPublished(db, post, {
    from: ["publishing"],
    media: sent.media,
    accountId: posting.accountId,
    seen: sent.seen,
  });
  // Up, and not read back: the move itself wrote the job that asks for it again in two minutes (00681 post_moved), so it
  // says it is on Instagram only once it was seen there.
}

/**
 * A post that went up unseen, asked for by its own id (post_reconcile, payload `seen`): seen, it says so from now; no
 * answer, the job comes back. Not there, by its id and by the account's own list: a first look can be early, so the
 * job comes back, and where its last try still finds none the post never went up: it is a post that did not go, never
 * left as posted (files/post-never-up.ts; the content status review of 24 Nov 2026, A6). Nothing is ever sent from here.
 */
async function verifyPublished(
  db: Db,
  post: PostRow,
  deps: PostDeps,
  lastTry: boolean,
): Promise<void | { skipped: string }> {
  if (post.verified_at || !post.external_id) return { skipped: "seen" };
  const posting = await postingOf(db, post, deps);
  if ("held" in posting) throw new Error(`post ${post.id}: ${post.place} cannot be asked (${posting.held})`);
  const state = await posting.place.status?.({
    postId: post.id,
    kind: instagramKindOf(post),
    externalId: post.external_id,
    caption: post.caption,
    sentAt: post.published_at ?? post.updated_at,
  });
  if (!state || state.is === "unknown") throw new Error(`post ${post.id}: Instagram did not say whether it is up`);
  if (state.is === "not_up") {
    if (!lastTry) throw new Error(`post ${post.id}: ${post.place} does not hold it yet`);
    await settleNeverUp(db, post, "seen");
    return { skipped: "not_seen" };
  }
  await movePost(db, {
    postId: post.id,
    from: ["published"],
    to: "published",
    patch: { permalink: state.media.permalink, verified_at: new Date().toISOString() },
  });
  logger({ tenant_id: post.tenant_id }).info("placement_verified", { post_id: post.id, place: post.place });
}

/** post_reconcile: what Instagram has, read before anything could be sent again. */
async function reconcilePost(db: Db, job: ClaimedJob, deps: PostDeps = {}): Promise<void | { skipped: string }> {
  const { postId, attempt } = postJobOf(job);
  const post = await findPostForWork(db, job.tenant_id, postId);
  if (!post) return { skipped: "gone" };
  // A place with no draft to ask after settles its own unanswered send (Google: its profile's own list).
  const own = isOneOf(POST_PLACES, post.place) ? deps.reconcileAt?.[post.place] : undefined;
  if (own) return own(db, post, job);
  if (post.status === "published" && job.payload.seen === "ask")
    return verifyPublished(db, post, deps, (job.attempts ?? 1) >= MAX_ATTEMPTS);
  if (post.status !== "checking" || !post.container_id) return { skipped: post.status };
  const posting = await postingOf(db, post, deps);
  // The place cannot be asked: the job comes back, and past its last try the post says to look at the account.
  if ("held" in posting) throw new Error(`post ${post.id}: ${post.place} cannot be asked (${posting.held})`);
  const { place } = posting;
  const state = await place.preparedState?.(post.container_id, instagramKindOf(post));
  if (!state || state.is === "unknown" || state.is === "gone")
    throw new Error(`post ${post.id}: the container could not be read`);
  const opened = await openPostAttempt(db, {
    postId: post.id,
    attemptNo: attempt,
    step: "reconcile",
    request: { container_id: post.container_id },
  });
  // Published, the account's list is only for its address: one that cannot be read leaves the post up without it.
  const looking = findOnTheAccount(db, { post, posting });
  const found =
    state.is === "published"
      ? await looking.catch(logAndGoOn("post's address after a send with no answer", null))
      : await looking;
  // Up when Instagram says so of the container, or the account shows it with the caption it was sent with. One found by
  // its time alone is not proof: the owner may have put a story up by hand in the same minute.
  if (state.is === "published" || (found !== null && post.caption !== null)) {
    await closePostAttempt(db, {
      attemptId: opened.id,
      outcome: "ok",
      httpStatus: state.kept.status,
      answer: state.kept.json,
      externalId: found?.externalId ?? null,
    });
    await keepPublished(db, post, {
      from: ["checking"],
      media: found,
      accountId: posting.accountId,
      seen: found !== null,
    });
    return;
  }
  // Not up: the send never landed. One fresh attempt, and never a third.
  await closePostAttempt(db, {
    attemptId: opened.id,
    outcome: "failed",
    httpStatus: state.kept.status,
    answer: state.kept.json,
  });
  if (attempt === 1) return beginSecondAttempt(db, post, "checking");
  await movePost(db, {
    postId: post.id,
    from: ["checking"],
    to: "failed",
    patch: { error: { code: null, subcode: null, words: ON_INSTAGRAM.notSent } },
  });
  throw new CertainFailure(`post ${post.id}: not up after two attempts`, ON_INSTAGRAM.notSent);
}

/** Instagram's three post jobs as the job runner is handed them, beside Google's at its time (lib/ops/jobs-tick.ts). */
export function postJobs(db: Db, deps: PostDeps = {}): Omit<NonNullable<JobContext["posts"]>, "google" | "takeDown"> {
  return {
    prepare: (job, deadline) => preparePost(db, job, deadline, deps),
    publish: (job) => publishPost(db, job, deps),
    reconcile: (job) => reconcilePost(db, job, deps),
  };
}
