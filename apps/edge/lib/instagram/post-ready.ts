/**
 * A post made ready on Instagram (00611, decision 0121; 00681): post_prepare. The approved bytes (a picture's shape, or a
 * made video for a reel) are signed for a day and Instagram is asked, through its adapter (place.ts), to
 * make a container of them; once the container says it is ready, the send is scheduled for the post's time. Nothing here
 * puts anything in front of anyone: the container is Instagram's draft, and lapses in a day.
 *
 * Every run first reads the post and stops where it no longer stands where this job expects it (pulled, held), and where it
 * no longer stands as approved (00681 post_as_approved: its words, its bytes or its version moved since): held, "Changed
 * since you approved it". The container's id is kept on its send's row, so a run that comes back after a throw asks after
 * the same container rather than making another. A refusal is said in the owner's words (contracts ON_INSTAGRAM.refused)
 * and ends the job for good, which tells the owner and settles the post (packages/jobs settle-post.ts); Instagram's bad
 * minute is tried again.
 *
 * A second attempt asks after the first container before it makes anything: a send whose answer never came may have landed
 * since the reconcile looked. Up, the post is up and nothing more is sent. Still ready, it is the one sent again, so
 * Instagram is handed the same post twice at most, never two posts. Only a container that lapsed or failed is made afresh.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DAY_MS,
  INSTAGRAM_POST_KINDS,
  ON_INSTAGRAM,
  SECOND_MS,
  fileMadePathOf,
  isOneOf,
  metaLinesOf,
  postPathOf,
  postPlanOf,
  postSentencesOf,
  recordOrEmpty,
  type InstagramPostKind,
  type PlaceAdapter,
  type PlaceRefusal,
  type PlacedMedia,
  type PostStatus,
  type PreparedState,
} from "@chanlytics/contracts";
import { metaContainerFields, metaContainerFieldsKept, type MetaPoster } from "@chanlytics/channels/instagram";
import { findMetaInstagramRow } from "@chanlytics/db/channels";
import {
  closePostAttempt,
  filesBucket,
  findPostForWork,
  listKeptPostIds,
  listPostAttempts,
  movePost,
  openPostAttempt,
  queuePostAgain,
  type PostRow,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { CertainFailure } from "@chanlytics/core";
import { logAndGoOn } from "@chanlytics/log";
import { scheduleJobOnce, type ClaimedJob } from "@chanlytics/jobs";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";
import { readKeptSecret } from "./credentials.js";
import { tellPostMoved } from "../files/post-told.js";
import { INSTAGRAM_CALL_MS, instagramPlace, type InstagramPlaceDeps } from "./place.js";
import { holdPlacement, readSendRecheck, type SendHold } from "../content/recheck.js";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** What a post job is handed besides its database: the network, and a pause between two looks at a container. */
export interface PostDeps extends InstagramPlaceDeps {
  pause?: (ms: number) => Promise<void>;
}

/** How long Instagram has to fetch the media: a day, as long as a container lives. */
const MEDIA_LINK_S = DAY_MS / SECOND_MS;
/**
 * How often a container is looked at, and how many times, before the job comes back later: a picture is ready in seconds,
 * a reel in under a minute (the first-post sitting's, 47 seconds, for 13 seconds of video).
 */
const LOOKS: Readonly<Record<InstagramPostKind, { everyMs: number; times: number }>> = {
  picture: { everyMs: 3 * SECOND_MS, times: 3 },
  story: { everyMs: 3 * SECOND_MS, times: 3 },
  reel: { everyMs: 10 * SECOND_MS, times: 6 },
};
/** The longest one call to Instagram waits (KIND_POLICY longestCallMs is 20 s). */
const POST_CALL_MS = INSTAGRAM_CALL_MS;

/** Where a post still stands while nothing was sent: it can be held from here. */
export const HOLDABLE: readonly PostStatus[] = ["queued", "preparing"];

/** What a post job names: the post, and which of its two attempts this is. */
export function postJobOf(job: ClaimedJob): { postId: string; attempt: 1 | 2 } {
  const postId = typeof job.payload.post_id === "string" ? job.payload.post_id : "";
  return { postId, attempt: job.payload.attempt === "2" ? 2 : 1 };
}

/** The kind Instagram is sent: a picture, a story or a reel (00681); anything else is no post of ours to send. */
export function instagramKindOf(post: PostRow): InstagramPostKind {
  if (isOneOf(INSTAGRAM_POST_KINDS, post.kind)) return post.kind;
  throw new CertainFailure(`post ${post.id}: a ${String(post.kind)} cannot go`, ON_INSTAGRAM.notSent);
}

/** Who posts: the workspace's account connected through Meta, its token, and the app's secret; else why it may not now. */
export async function findPoster(db: Db, tenantId: TenantId): Promise<{ poster: MetaPoster } | SendHold> {
  const appSecret = env.META_APP_SECRET;
  if (!appSecret) throw new Error("post: META_APP_SECRET is not set on this deployment");
  const row = await findMetaInstagramRow(db, tenantId);
  if (!row) return { held: ON_INSTAGRAM.held.disconnected, why: "disconnected" };
  const config = recordOrEmpty(row.config);
  if (config.token_lapsed_at) return { held: ON_INSTAGRAM.held.disconnected, why: "disconnected" };
  if (!metaLinesOf(config.scopes).publish) return { held: ON_INSTAGRAM.held.lineOff, why: "line_off" };
  // A Vault that cannot be read throws: the job comes back, and nothing was sent.
  const secret = await readKeptSecret(db, row.id);
  if (!secret?.access_token) return { held: ON_INSTAGRAM.held.disconnected, why: "disconnected" };
  return { poster: { token: secret.access_token, appSecret, accountId: row.external_id } };
}

/** Instagram's adapter for this workspace's account, knowing which of its posts another placement already keeps. */
export function placeFor(db: Db, post: PostRow, poster: MetaPoster, deps: PostDeps): PlaceAdapter {
  return instagramPlace(poster, {
    ...deps,
    keptElsewhere: (ids) => listKeptPostIds(db, post.tenant_id, "instagram", [...ids]),
  });
}

/**
 * Instagram's adapter for a post asked down (00682), or why the account cannot be asked from here: not connected, or
 * posting not allowed, and the take-down is the owner's to do in Instagram.
 */
export async function takeDownPlaceFor(db: Db, post: PostRow): Promise<PlaceAdapter | { cant: string }> {
  const posting = await findPoster(db, post.tenant_id);
  if ("held" in posting) return { cant: ON_INSTAGRAM.takeDown.byHand };
  return placeFor(db, post, posting.poster, {});
}

/** What a refusal comes to: the owner's words for good, or a throw to try again when it was only busy. */
export function postRefusalOf(refusal: PlaceRefusal, subject: string): Error {
  const line = `${subject}: Instagram refused (${refusal.code ?? "-"}/${refusal.subcode ?? "-"})`;
  return refusal.busy ? new Error(line) : new CertainFailure(line, refusal.words);
}

/** The refusal as the post and its send keep it: Instagram's code, and the owner's sentence. */
export const refusalKept = (refusal: PlaceRefusal) => ({
  code: refusal.code,
  subcode: refusal.subcode,
  words: refusal.words,
});

/**
 * The post is up: its id, its address and its time kept where they are known, the account it went to, when it was seen
 * there (only when the account was read holding it), and the line that says so.
 */
export async function keepPublished(
  db: Db,
  post: PostRow,
  at: { from: readonly PostStatus[]; media: PlacedMedia | null; accountId: string; seen: boolean },
): Promise<void> {
  const moved = await movePost(db, {
    postId: post.id,
    from: at.from,
    to: "published",
    patch: {
      external_id: at.media?.externalId || null,
      permalink: at.media?.permalink ?? null,
      published_at: at.media?.publishedAt ?? null,
      account_id: at.accountId,
      verified_at: at.seen ? new Date().toISOString() : null,
    },
  });
  if (!moved) return;
  logger({ tenant_id: post.tenant_id }).info("post_published", { post_id: post.id, place: post.place, seen: at.seen });
  // One that waited for its time went up with no one there to see it: the bell says so (00616).
  await tellPostMoved(db, post, { is: "up" });
}

/**
 * Of the account's newest, the one a send of this post made; null when none is, or nothing says which. Looked for since the
 * post's first send, whichever attempt asks: a second send may be of the same container, and the post may have gone up
 * through the first. One another placement of this workspace already keeps is never it. Throws when the account's posts
 * could not be read.
 */
export async function findOnTheAccount(
  db: Db,
  at: { post: PostRow; poster: MetaPoster },
  deps: PostDeps,
): Promise<PlacedMedia | null> {
  const sends = await listPostAttempts(db, at.post.tenant_id, at.post.id);
  // In the order they were made: the first send is the earliest a post of this one can be.
  const send = sends.find((a) => a.step === "publish");
  if (!send) return null;
  const state = await placeFor(db, at.post, at.poster, deps).status?.({
    postId: at.post.id,
    kind: instagramKindOf(at.post),
    externalId: at.post.external_id,
    caption: at.post.caption,
    sentAt: send.started_at,
  });
  if (!state || state.is === "unknown") throw new Error(`post ${at.post.id}: the account's posts could not be read`);
  return state.is === "up" ? state.media : null;
}

/** What the picture says, for someone who cannot see it: the words drawn on it, in the order they are read. */
function pictureSays(file: { made: unknown }): string | null {
  const plan = postPlanOf(recordOrEmpty(recordOrEmpty(file.made).plan));
  return postSentencesOf([plan.over, plan.line, plan.under]) || null;
}

/**
 * Where the bytes Instagram fetches are kept: the approved shape's own path (00681), or, for a post approved before
 * approvals were kept, the post's own shape (a picture's portrait, a story's) as before.
 */
function mediaPathOf(post: PostRow, kind: InstagramPostKind, approvedPath: string | null): string {
  if (approvedPath) return approvedPath;
  if (kind === "reel") return fileMadePathOf(post.tenant_id, post.file_id, "video");
  return postPathOf(post.tenant_id, post.file_id, kind === "story" ? "story" : "portrait");
}

/** The signed address Instagram fetches the media from. */
async function mediaLinkOf(db: Db, post: PostRow, path: string): Promise<string> {
  const signed = await filesBucket(db).createSignedUrl(path, MEDIA_LINK_S);
  if (signed.error) throw new Error(`post ${post.id}: the media could not be signed`);
  return signed.data.signedUrl;
}

/** What a run of post_prepare works on: the post, which of its two attempts, how it goes, who posts it, and its bytes. */
interface Preparing {
  post: PostRow;
  attempt: 1 | 2;
  kind: InstagramPostKind;
  poster: MetaPoster;
  place: PlaceAdapter;
  path: string;
}

/** A container Instagram already has for this post, and where it stands now. */
interface FirstContainer {
  id: string;
  state: PreparedState;
}

/**
 * Where the first attempt's container stands now, asked before a second is made. Null when there was none, or Instagram
 * answered that it no longer has it. No answer throws: the job comes back, and nothing is made blind.
 */
async function firstContainerNow(db: Db, at: Preparing): Promise<FirstContainer | null> {
  const sends = await listPostAttempts(db, at.post.tenant_id, at.post.id);
  const id = sends.find((a) => a.attempt_no === 1 && a.step === "container")?.container_id;
  if (!id || !at.place.preparedState) return null;
  const state = await at.place.preparedState(id, at.kind);
  if (state.is === "gone") return null;
  if (state.is === "unknown") throw new Error(`post ${at.post.id}: the first container could not be read`);
  return { id, state };
}

/** The first send landed after all: the post is up, how that was learned is kept on a row of its own, and nothing is sent. */
async function keepLanded(db: Db, at: Preparing, first: FirstContainer, deps: PostDeps): Promise<{ skipped: string }> {
  const opened = await openPostAttempt(db, {
    postId: at.post.id,
    attemptNo: 2,
    step: "reconcile",
    request: { container_id: first.id },
  });
  // Its address, for the sheet's See it: an account that cannot be read leaves the post up without one.
  const found = await findOnTheAccount(db, { post: at.post, poster: at.poster }, deps).catch(
    logAndGoOn("post's address after its first send landed", null),
  );
  await closePostAttempt(db, {
    attemptId: opened.id,
    outcome: "ok",
    httpStatus: first.state.kept.status,
    answer: first.state.kept.json,
    externalId: found?.externalId ?? null,
  });
  await keepPublished(db, at.post, {
    from: ["queued"],
    media: found,
    accountId: at.poster.accountId,
    seen: found !== null,
  });
  return { skipped: "landed" };
}

/** The first container, still ready, is the one sent again: nothing new is made, and Instagram holds one post of it. */
async function containerAgain(db: Db, at: Preparing, containerId: string): Promise<string> {
  const opened = await openPostAttempt(db, {
    postId: at.post.id,
    attemptNo: at.attempt,
    step: "container",
    request: { container_id: containerId },
  });
  if (opened.finished && opened.outcome === "ok" && opened.containerId) return opened.containerId;
  await closePostAttempt(db, { attemptId: opened.id, outcome: "ok", httpStatus: null, answer: null, containerId });
  return containerId;
}

/** The container made, or the one an earlier run made: its id on the send's row and on the post. */
async function containerOf(db: Db, at: Preparing & { says: string | null }): Promise<string> {
  const { post, attempt, kind, place } = at;
  const link = await mediaLinkOf(db, post, at.path);
  const toSend = {
    postId: post.id,
    kind,
    caption: post.caption,
    mediaUrl: link,
    says: at.says,
    language: null,
    book: false,
  };
  // The request as kept: the media's host alone, never its signed address or a token.
  const request = metaContainerFieldsKept(metaContainerFields(kind, link, { caption: post.caption, says: at.says }));
  const opened = await openPostAttempt(db, { postId: post.id, attemptNo: attempt, step: "container", request });
  if (opened.finished && opened.outcome === "ok" && opened.containerId) return opened.containerId;
  const prepared = await place.prepare?.(toSend);
  if (!prepared) throw new Error(`post ${post.id}: Instagram has no draft to make`);
  if (prepared.is === "refused") {
    // Refused for good: the send's row says so. Only busy: it stays open, and the next run asks again on it.
    const refused = postRefusalOf(prepared.refusal, `post ${post.id}`);
    if (!prepared.refusal.busy)
      await closePostAttempt(db, {
        attemptId: opened.id,
        outcome: "refused",
        httpStatus: prepared.kept.status,
        answer: prepared.kept.json,
        error: refusalKept(prepared.refusal),
      });
    throw refused;
  }
  // No answer: the send's row stays open, and the next run makes the container again (an unused one lapses by itself).
  if (prepared.is === "unknown")
    throw new Error(`post ${post.id}: Instagram did not answer the container (${prepared.kept.status ?? 0})`);
  await closePostAttempt(db, {
    attemptId: opened.id,
    outcome: "ok",
    httpStatus: prepared.kept.status,
    answer: prepared.kept.json,
    containerId: prepared.ref,
  });
  return prepared.ref;
}

/** A second attempt, from a fresh container: the post queued again with its job, together, and only ever once (00611). */
export async function beginSecondAttempt(db: Db, post: PostRow, from: "preparing" | "checking"): Promise<void> {
  if (await queuePostAgain(db, post.id, from))
    logger({ tenant_id: post.tenant_id }).info("post_tried_again", { post_id: post.id });
}

/** post_prepare: the post made ready on Instagram, and its send scheduled for its time. */
export async function preparePost(
  db: Db,
  job: ClaimedJob,
  deadline: number,
  deps: PostDeps = {},
): Promise<void | { skipped: string }> {
  const { postId, attempt } = postJobOf(job);
  const post = await findPostForWork(db, job.tenant_id, postId);
  if (!post) return { skipped: "gone" };
  if (post.status !== "queued" && post.status !== "preparing") return { skipped: post.status };
  const kind = instagramKindOf(post);
  // Nothing is made on Instagram for a post that may not go up (the recheck asks again at the send).
  const bytes = await readSendRecheck(db, post, { approver: false });
  if ("held" in bytes) return holdPlacement(db, post, { ...bytes, from: HOLDABLE });
  const posting = await findPoster(db, job.tenant_id);
  if ("held" in posting) return holdPlacement(db, post, { ...posting, from: HOLDABLE });
  const at: Preparing = {
    post,
    attempt,
    kind,
    poster: posting.poster,
    place: placeFor(db, post, posting.poster, deps),
    path: mediaPathOf(post, kind, bytes.path),
  };
  // Before a second container, the first is asked after: it may be up by now, or still ready to be the one sent.
  const first = attempt === 2 && post.status === "queued" ? await firstContainerNow(db, at) : null;
  if (first?.state.is === "published") return keepLanded(db, at, first, deps);
  const containerId =
    first?.state.is === "ready"
      ? await containerAgain(db, at, first.id)
      : await containerOf(db, { ...at, says: kind === "picture" ? pictureSays(bytes) : null });
  // Whichever run kept the container: from here the post is being made ready. A run that died right after keeping it left
  // the post queued, and its send would have found nothing to send.
  await movePost(db, { postId: post.id, from: ["queued"], to: "preparing" });
  return sendWhenReady(db, at, { containerId, deadline }, deps);
}

/** The container looked at until it is ready, and the send scheduled for the post's time. */
async function sendWhenReady(
  db: Db,
  at: Preparing,
  wait: { containerId: string; deadline: number },
  deps: PostDeps,
): Promise<void> {
  const { post, attempt, place } = at;
  const pause = deps.pause ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const looks = LOOKS[at.kind];
  for (let look = 0; look < looks.times && Date.now() + POST_CALL_MS < wait.deadline; look += 1) {
    if (look > 0) await pause(looks.everyMs);
    const state = await place.preparedState?.(wait.containerId, at.kind);
    if (!state) break;
    if (state.is === "ready") {
      await scheduleJobOnce(db, {
        tenantId: post.tenant_id,
        kind: "post_publish",
        dueAt: new Date(Math.max(Date.now(), Date.parse(post.scheduled_for))),
        payload: { post_id: post.id, attempt: String(attempt) },
      });
      return;
    }
    if (state.is === "failed")
      throw new CertainFailure(
        `post ${post.id}: the container failed (${state.refusal.subcode ?? "-"})`,
        state.refusal.words,
      );
    if (state.is === "expired") {
      if (attempt === 2) throw new CertainFailure(`post ${post.id}: the container lapsed twice`, ON_INSTAGRAM.notSent);
      await beginSecondAttempt(db, post, "preparing");
      return;
    }
  }
  // Not ready yet: the ledger brings the job back in two minutes, and it asks after the same container.
  throw new Error(`post ${post.id}: the container is not ready yet`);
}
