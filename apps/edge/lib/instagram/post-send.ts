/**
 * A post sent (00611, decision 0121): post_publish and post_reconcile. Publishing works like a payment: the send is made
 * once, and an answer that never came proves nothing, so it is never sent again blind.
 *
 * Right before the send, the recheck: whoever approved it may still post for the business, the post was not pulled or
 * removed, and Instagram is still connected with posting allowed. Anything moved holds the post in words and sends nothing,
 * up to the moment of sending. Then the job says it is about to speak (ledger markSpoke), and Instagram is asked to publish.
 * A refusal fails the post in the owner's words; no answer leaves it Checking, and two minutes on the reconcile asks
 * Instagram what it has: the container's status and the account's newest posts. Up when Instagram says the container was
 * published, or the account shows a post with the caption this one was sent with; one found by its time alone (a story
 * carries no caption) is where the post is, never proof that it went up. Not up, one more attempt begins, never a third
 * (post-ready.ts: it asks after the first container again before it makes anything).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ON_INSTAGRAM } from "@chanlytics/contracts";
import {
  callInstagram,
  metaContainerStatusRequest,
  metaMediaReadRequest,
  metaPublishRequest,
  parseMetaContainerStatus,
  parseMetaCreatedId,
  parseMetaMedia,
  type InstagramAnswer,
  type MetaPoster,
} from "@chanlytics/channels/instagram";
import {
  closePostAttempt,
  findFileForWork,
  findPostForWork,
  markPostUnanswered,
  mayStillPost,
  movePost,
  openPostAttempt,
  type PostRow,
} from "@chanlytics/db/files";
import { CertainFailure } from "@chanlytics/core";
import { logAndGoOn } from "@chanlytics/log";
import { markSpoke, type ClaimedJob, type JobContext } from "@chanlytics/jobs";
import type { Database } from "@chanlytics/db/types";
import { logger } from "../shared/log.js";
import {
  POST_CALL_MS,
  beginSecondAttempt,
  findOnTheAccount,
  holdPost,
  instagramKindOf,
  keepPublished,
  postJobOf,
  findPoster,
  preparePost,
  refusalKept,
  postRefusalOf,
  type PostDeps,
} from "./post-ready.js";

type Db = SupabaseClient<Database>;

/** The recheck: why the post may not go now, in the owner's words, or the poster it goes through. */
async function recheck(db: Db, post: PostRow): Promise<{ poster: MetaPoster } | { held: string }> {
  if (!post.approved_by || !(await mayStillPost(db, post.tenant_id, post.approved_by)))
    return { held: ON_INSTAGRAM.held.approver };
  const file = await findFileForWork(db, post.tenant_id, post.file_id);
  if (!file || file.removed_at) return { held: ON_INSTAGRAM.held.removed };
  return findPoster(db, post.tenant_id);
}

/** One send in hand: the post, who posts it, which attempt, and the row the send is kept on. */
interface Sending {
  post: PostRow;
  poster: MetaPoster;
  attempt: 1 | 2;
  attemptId: string;
  containerId: string;
}

/**
 * Instagram refused the send. A second send may be of a container that went up through the first after all, which
 * Instagram may refuse to publish again (Meta's pages do not say; seen on no real account yet). So its status is asked:
 * published, the post is up. Any other refusal took nothing: the post did not go up, in the owner's words.
 */
async function refusedSend(db: Db, at: Sending, sent: InstagramAnswer, deps: PostDeps): Promise<void> {
  const { post } = at;
  if (at.attempt === 2) {
    const read = await callInstagram(
      metaContainerStatusRequest(at.poster, at.containerId),
      { timeoutMs: POST_CALL_MS },
      deps,
    );
    if (read.outcome === "ok" && parseMetaContainerStatus(read.json).code === "PUBLISHED") {
      const found = await findOnTheAccount(db, { post, poster: at.poster }, deps).catch(
        logAndGoOn("post's address after a second send found it up", null),
      );
      await closePostAttempt(db, {
        attemptId: at.attemptId,
        outcome: "refused",
        httpStatus: sent.status,
        answer: sent.json,
        externalId: found?.id ?? null,
      });
      await keepPublished(db, post, ["publishing"], found);
      return;
    }
  }
  const error = refusalKept(sent);
  await closePostAttempt(db, {
    attemptId: at.attemptId,
    outcome: "refused",
    httpStatus: sent.status,
    answer: sent.json,
    error,
  });
  await movePost(db, { postId: post.id, from: ["publishing"], to: "failed", patch: { error } });
  const refused = postRefusalOf(sent, `post ${post.id}`);
  throw new CertainFailure(refused.message, error.words);
}

/** post_publish: the recheck, then the one send. */
export async function publishPost(db: Db, job: ClaimedJob, deps: PostDeps = {}): Promise<void | { skipped: string }> {
  const { postId, attempt } = postJobOf(job);
  const post = await findPostForWork(db, job.tenant_id, postId);
  if (!post) return { skipped: "gone" };
  if (post.status !== "preparing" || !post.container_id) return { skipped: post.status };
  instagramKindOf(post);
  const posting = await recheck(db, post);
  if ("held" in posting) return holdPost(db, post, posting.held);
  if (!(await movePost(db, { postId: post.id, from: ["preparing"], to: "publishing" }))) return { skipped: "moved" };
  const opened = await openPostAttempt(db, {
    postId: post.id,
    attemptNo: attempt,
    step: "publish",
    request: { creation_id: post.container_id },
  });
  await markSpoke(db, job);
  const sent = await callInstagram(
    metaPublishRequest(posting.poster, post.container_id),
    { timeoutMs: POST_CALL_MS },
    deps,
  );
  if (sent.outcome === "refused")
    return refusedSend(
      db,
      { post, poster: posting.poster, attempt, attemptId: opened.id, containerId: post.container_id },
      sent,
      deps,
    );
  if (sent.outcome !== "ok") {
    // No answer proves nothing: Checking, and Instagram is asked what it has before anything is sent again.
    await closePostAttempt(db, {
      attemptId: opened.id,
      outcome: "no_answer",
      httpStatus: sent.status || null,
      answer: null,
    });
    await markPostUnanswered(db, post.id, attempt);
    logger({ tenant_id: job.tenant_id }).warn("post_no_answer", { post_id: post.id });
    return;
  }
  const mediaId = parseMetaCreatedId(sent.json);
  await closePostAttempt(db, {
    attemptId: opened.id,
    outcome: "ok",
    httpStatus: sent.status,
    answer: sent.json,
    externalId: mediaId,
  });
  // Its address, for the sheet's See it: a read that fails leaves the post up without one.
  const read = await callInstagram(metaMediaReadRequest(posting.poster, mediaId), { timeoutMs: POST_CALL_MS }, deps);
  const media = (read.outcome === "ok" ? parseMetaMedia(read.json) : null) ?? { id: mediaId };
  await keepPublished(db, post, ["publishing"], media);
}

/** post_reconcile: what Instagram has, read before anything could be sent again. */
export async function reconcilePost(db: Db, job: ClaimedJob, deps: PostDeps = {}): Promise<void | { skipped: string }> {
  const { postId, attempt } = postJobOf(job);
  const post = await findPostForWork(db, job.tenant_id, postId);
  if (!post) return { skipped: "gone" };
  if (post.status !== "checking" || !post.container_id) return { skipped: post.status };
  const posting = await findPoster(db, job.tenant_id);
  // Instagram cannot be asked: the job comes back, and past its last try the post says to look at the account.
  if ("held" in posting) throw new Error(`post ${post.id}: Instagram cannot be asked (${posting.held})`);
  const read = await callInstagram(
    metaContainerStatusRequest(posting.poster, post.container_id),
    { timeoutMs: POST_CALL_MS },
    deps,
  );
  if (read.outcome !== "ok") throw new Error(`post ${post.id}: the container could not be read`);
  const status = parseMetaContainerStatus(read.json);
  const opened = await openPostAttempt(db, {
    postId: post.id,
    attemptNo: attempt,
    step: "reconcile",
    request: { container_id: post.container_id },
  });
  // Published, the account's list is only for its address: one that cannot be read leaves the post up without it.
  const looking = findOnTheAccount(db, { post, poster: posting.poster }, deps);
  const found =
    status.code === "PUBLISHED"
      ? await looking.catch(logAndGoOn("post's address after a send with no answer", null))
      : await looking;
  // Up when Instagram says so of the container, or the account shows it with the caption it was sent with. One found by
  // its time alone is not proof: the owner may have put a story up by hand in the same minute.
  if (status.code === "PUBLISHED" || (found !== null && post.caption !== null)) {
    await closePostAttempt(db, {
      attemptId: opened.id,
      outcome: "ok",
      httpStatus: read.status,
      answer: read.json,
      externalId: found?.id ?? null,
    });
    await keepPublished(db, post, ["checking"], found);
    return;
  }
  // Not up: the send never landed. One fresh attempt, and never a third.
  await closePostAttempt(db, { attemptId: opened.id, outcome: "failed", httpStatus: read.status, answer: read.json });
  if (attempt === 1) return beginSecondAttempt(db, post, "checking");
  await movePost(db, {
    postId: post.id,
    from: ["checking"],
    to: "failed",
    patch: { error: { code: null, subcode: null, words: ON_INSTAGRAM.notSent } },
  });
  throw new CertainFailure(`post ${post.id}: not up after two attempts`, ON_INSTAGRAM.notSent);
}

/** The three post jobs as the job runner is handed them (lib/ops/jobs-tick.ts). */
export function postJobs(db: Db, deps: PostDeps = {}): NonNullable<JobContext["posts"]> {
  return {
    prepare: (job, deadline) => preparePost(db, job, deadline, deps),
    publish: (job) => publishPost(db, job, deps),
    reconcile: (job) => reconcilePost(db, job, deps),
  };
}
