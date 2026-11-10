/**
 * A post made ready on Instagram (00611, decision 0121): post_prepare. The post's picture, kept in its file's folder, is signed
 * for a day and Instagram is asked to make a container of it; once the container says FINISHED, the send is scheduled for the
 * post's time. Nothing here puts anything in front of anyone: the container is Instagram's draft, and lapses in a day.
 *
 * Every run first reads the post and stops where it no longer stands where this job expects it (pulled, held). The
 * container's id is kept on its send's row, so a run that comes back after a throw asks after the same container rather
 * than making another. A refusal is said in the owner's words (contracts ON_INSTAGRAM.refused) and ends the job for good,
 * which tells the owner and settles the post (packages/jobs settle-post.ts); Instagram's bad minute is tried again.
 *
 * A second attempt asks after the first container before it makes anything: a send whose answer never came may have landed
 * since the reconcile looked. Up, the post is up and nothing more is sent. Still ready, it is the one sent again, so
 * Instagram is handed the same post twice at most, never two posts. Only a container that lapsed or failed is made afresh.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DAY_MS,
  ON_INSTAGRAM,
  SECOND_MS,
  metaLinesOf,
  postPathOf,
  postPlanOf,
  postSentencesOf,
  recordOrEmpty,
  type InstagramPostKind,
  type PostStatus,
} from "@chanlytics/contracts";
import {
  callInstagram,
  metaContainerFields,
  metaContainerRequest,
  metaContainerStatusRequest,
  metaMediaSentBy,
  metaNewestMediaRequest,
  metaPostLimitRequest,
  metaPostRefusalOf,
  parseMetaContainerStatus,
  parseMetaCreatedId,
  parseMetaMediaList,
  parseMetaPostLimit,
  type InstagramAnswer,
  type InstagramDeps,
  type MetaContainerStatus,
  type MetaMedia,
  type MetaPoster,
} from "@chanlytics/channels/instagram";
import { findMetaInstagramRow } from "@chanlytics/db/channels";
import {
  closePostAttempt,
  filesBucket,
  findFileForWork,
  findPostForWork,
  listKeptPostIds,
  listPostAttempts,
  movePost,
  openPostAttempt,
  queuePostAgain,
  type PostRow,
} from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { CertainFailure, isCertainFailure } from "@chanlytics/core";
import { logAndGoOn } from "@chanlytics/log";
import { scheduleJobOnce, type ClaimedJob } from "@chanlytics/jobs";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";
import { readKeptSecret } from "./credentials.js";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** What a post job is handed besides its database: the network, and a pause between two looks at a container. */
export interface PostDeps extends InstagramDeps {
  pause?: (ms: number) => Promise<void>;
}

/** How long Instagram has to fetch the picture: a day, as long as a container lives. */
const PICTURE_LINK_S = DAY_MS / SECOND_MS;
/** A picture's container is ready in seconds: looked at this often, three times, before the job comes back later. */
const LOOK_EVERY_MS = 3 * SECOND_MS;
const LOOKS = 3;
/** The longest one call to Instagram waits (KIND_POLICY longestCallMs is 20 s). */
export const POST_CALL_MS = 15 * SECOND_MS;

/** What a post job names: the post, and which of its two attempts this is. */
export function postJobOf(job: ClaimedJob): { postId: string; attempt: 1 | 2 } {
  const postId = typeof job.payload.post_id === "string" ? job.payload.post_id : "";
  return { postId, attempt: job.payload.attempt === "2" ? 2 : 1 };
}

/** The kind Instagram is sent: a reel waits for its road (decision 0121), so a reel's post never reaches here. */
export function instagramKindOf(post: PostRow): InstagramPostKind {
  if (post.kind === "picture" || post.kind === "story") return post.kind;
  throw new CertainFailure(`post ${post.id}: a ${post.kind} cannot go yet`, ON_INSTAGRAM.notYet);
}

/** Who posts: the workspace's account connected through Meta, its token, and the app's secret; else why it may not now. */
export async function findPoster(db: Db, tenantId: TenantId): Promise<{ poster: MetaPoster } | { held: string }> {
  const appSecret = env.META_APP_SECRET;
  if (!appSecret) throw new Error("post: META_APP_SECRET is not set on this deployment");
  const row = await findMetaInstagramRow(db, tenantId);
  if (!row) return { held: ON_INSTAGRAM.held.disconnected };
  const config = recordOrEmpty(row.config);
  if (config.token_lapsed_at) return { held: ON_INSTAGRAM.held.disconnected };
  if (!metaLinesOf(config.scopes).publish) return { held: ON_INSTAGRAM.held.lineOff };
  // A Vault that cannot be read throws: the job comes back, and nothing was sent.
  const secret = await readKeptSecret(db, row.id);
  if (!secret?.access_token) return { held: ON_INSTAGRAM.held.disconnected };
  return { poster: { token: secret.access_token, appSecret, accountId: row.external_id } };
}

/** What Instagram's refusal comes to: the owner's words for good, or a throw to try again when it was only busy. */
export function postRefusalOf(answer: Pick<InstagramAnswer, "status" | "json">, subject: string): Error {
  const r = metaPostRefusalOf(answer);
  const line = `${subject}: Instagram refused (${r.code ?? "-"}/${r.subcode ?? "-"})`;
  return r.refusal === "busy" ? new Error(line) : new CertainFailure(line, ON_INSTAGRAM.refused[r.refusal]);
}

/** The refusal as the post and its send keep it: Instagram's code, and the owner's sentence. */
export function refusalKept(answer: Pick<InstagramAnswer, "status" | "json">) {
  const r = metaPostRefusalOf(answer);
  return { code: r.code, subcode: r.subcode, words: ON_INSTAGRAM.refused[r.refusal] };
}

/** The post held: the recheck's words on it, and nothing sent. */
export async function holdPost(db: Db, post: PostRow, words: string): Promise<{ skipped: string }> {
  await movePost(db, { postId: post.id, from: ["queued", "preparing"], to: "held", patch: { held_reason: words } });
  logger({ tenant_id: post.tenant_id }).info("post_held", { post_id: post.id });
  return { skipped: "held" };
}

/** The post is up: its id, its address and its time kept where they are known, and the line that says so. */
export async function keepPublished(
  db: Db,
  post: PostRow,
  from: readonly PostStatus[],
  media: Partial<MetaMedia> | null,
): Promise<void> {
  const moved = await movePost(db, {
    postId: post.id,
    from,
    to: "published",
    patch: {
      external_id: media?.id || null,
      permalink: media?.permalink ?? null,
      published_at: media?.timestamp ?? null,
    },
  });
  if (moved) logger({ tenant_id: post.tenant_id }).info("post_published", { post_id: post.id, place: post.place });
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
): Promise<MetaMedia | null> {
  const sends = await listPostAttempts(db, at.post.tenant_id, at.post.id);
  // In the order they were made: the first send is the earliest a post of this one can be.
  const send = sends.find((a) => a.step === "publish");
  if (!send) return null;
  const listed = await callInstagram(
    metaNewestMediaRequest(at.poster, instagramKindOf(at.post)),
    { timeoutMs: POST_CALL_MS },
    deps,
  );
  if (listed.outcome !== "ok") throw new Error(`post ${at.post.id}: the account's posts could not be read`);
  const newest = parseMetaMediaList(listed.json);
  const kept = await listKeptPostIds(
    db,
    at.post.tenant_id,
    "instagram",
    newest.map((m) => m.id),
  );
  return metaMediaSentBy(
    newest.filter((m) => !kept.includes(m.id)),
    { at: send.started_at, caption: at.post.caption },
  );
}

/** What the picture says, for someone who cannot see it: the words drawn on it, in the order they are read. */
function pictureSays(file: { made: unknown }): string | null {
  const plan = postPlanOf(recordOrEmpty(recordOrEmpty(file.made).plan));
  return postSentencesOf([plan.over, plan.line, plan.under]) || null;
}

/** The signed address Instagram fetches the picture from: the post's own shape for a post, its story shape for a story. */
async function pictureLinkOf(db: Db, post: PostRow, kind: InstagramPostKind): Promise<string> {
  const path = postPathOf(post.tenant_id, post.file_id, kind === "story" ? "story" : "portrait");
  const signed = await filesBucket(db).createSignedUrl(path, PICTURE_LINK_S);
  if (signed.error) throw new Error(`post ${post.id}: the picture could not be signed`);
  return signed.data.signedUrl;
}

/** At the day's limit, said before a container is made; a limit that could not be read lets the post go on. */
async function refuseAtLimit(poster: MetaPoster, deps: PostDeps): Promise<void> {
  const read = await callInstagram(metaPostLimitRequest(poster), { timeoutMs: POST_CALL_MS }, deps);
  const limit = read.outcome === "ok" ? parseMetaPostLimit(read.json) : null;
  if (limit && limit.used >= limit.total)
    throw new CertainFailure("post: the account's day of posts is used", ON_INSTAGRAM.refused.limit);
}

/** What a run of post_prepare works on: the post, which of its two attempts, how it goes, and who posts it. */
interface Preparing {
  post: PostRow;
  attempt: 1 | 2;
  kind: InstagramPostKind;
  poster: MetaPoster;
}

/** A container Instagram already has for this post, and where it stands now. */
interface FirstContainer {
  id: string;
  code: MetaContainerStatus;
  answer: InstagramAnswer;
}

/**
 * Where the first attempt's container stands now, asked before a second is made. Null when there was none, or Instagram
 * answered that it no longer has it. No answer throws: the job comes back, and nothing is made blind.
 */
async function firstContainerNow(db: Db, at: Preparing, deps: PostDeps): Promise<FirstContainer | null> {
  const sends = await listPostAttempts(db, at.post.tenant_id, at.post.id);
  const id = sends.find((a) => a.attempt_no === 1 && a.step === "container")?.container_id;
  if (!id) return null;
  const answer = await callInstagram(metaContainerStatusRequest(at.poster, id), { timeoutMs: POST_CALL_MS }, deps);
  if (answer.outcome === "refused") return null;
  if (answer.outcome !== "ok") throw new Error(`post ${at.post.id}: the first container could not be read`);
  return { id, code: parseMetaContainerStatus(answer.json).code, answer };
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
    httpStatus: first.answer.status,
    answer: first.answer.json,
    externalId: found?.id ?? null,
  });
  await keepPublished(db, at.post, ["queued"], found);
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
async function containerOf(db: Db, at: Preparing & { says: string | null }, deps: PostDeps): Promise<string> {
  const { post, attempt, kind, poster } = at;
  const link = await pictureLinkOf(db, post, kind);
  const fields = metaContainerFields(kind, link, { caption: post.caption, says: at.says });
  // The request as kept: the picture's host alone, never its signed address or a token.
  const request = { ...fields, image_url: new URL(link).host };
  const opened = await openPostAttempt(db, { postId: post.id, attemptNo: attempt, step: "container", request });
  if (opened.finished && opened.outcome === "ok" && opened.containerId) return opened.containerId;
  await refuseAtLimit(poster, deps);
  const container = await callInstagram(metaContainerRequest(poster, fields), { timeoutMs: POST_CALL_MS }, deps);
  if (container.outcome === "refused") {
    // Refused for good: the send's row says so. Only busy: it stays open, and the next run asks again on it.
    const refused = postRefusalOf(container, `post ${post.id}`);
    if (isCertainFailure(refused))
      await closePostAttempt(db, {
        attemptId: opened.id,
        outcome: "refused",
        httpStatus: container.status,
        answer: container.json,
        error: refusalKept(container),
      });
    throw refused;
  }
  // No answer: the send's row stays open, and the next run makes the container again (an unused one lapses by itself).
  if (container.outcome !== "ok")
    throw new Error(`post ${post.id}: Instagram did not answer the container (${container.status})`);
  const containerId = parseMetaCreatedId(container.json);
  await closePostAttempt(db, {
    attemptId: opened.id,
    outcome: "ok",
    httpStatus: container.status,
    answer: container.json,
    containerId,
  });
  return containerId;
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
  const file = await findFileForWork(db, job.tenant_id, post.file_id);
  if (!file || file.removed_at) return holdPost(db, post, ON_INSTAGRAM.held.removed);
  const posting = await findPoster(db, job.tenant_id);
  if ("held" in posting) return holdPost(db, post, posting.held);
  const at: Preparing = { post, attempt, kind, poster: posting.poster };
  // Before a second container, the first is asked after: it may be up by now, or still ready to be the one sent.
  const first = attempt === 2 && post.status === "queued" ? await firstContainerNow(db, at, deps) : null;
  if (first?.code === "PUBLISHED") return keepLanded(db, at, first, deps);
  const containerId =
    first?.code === "FINISHED"
      ? await containerAgain(db, at, first.id)
      : await containerOf(db, { ...at, says: pictureSays(file) }, deps);
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
  const { post, attempt } = at;
  const pause = deps.pause ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  for (let look = 0; look < LOOKS && Date.now() + POST_CALL_MS < wait.deadline; look += 1) {
    if (look > 0) await pause(LOOK_EVERY_MS);
    const read = await callInstagram(
      metaContainerStatusRequest(at.poster, wait.containerId),
      { timeoutMs: POST_CALL_MS },
      deps,
    );
    if (read.outcome !== "ok") continue;
    const status = parseMetaContainerStatus(read.json);
    if (status.code === "FINISHED") {
      await scheduleJobOnce(db, {
        tenantId: post.tenant_id,
        kind: "post_publish",
        dueAt: new Date(Math.max(Date.now(), Date.parse(post.scheduled_for))),
        payload: { post_id: post.id, attempt: String(attempt) },
      });
      return;
    }
    if (status.code === "ERROR")
      throw new CertainFailure(
        `post ${post.id}: the container failed (${status.detail})`,
        ON_INSTAGRAM.refused.picture,
      );
    if (status.code === "EXPIRED") {
      if (attempt === 2) throw new CertainFailure(`post ${post.id}: the container lapsed twice`, ON_INSTAGRAM.notSent);
      await beginSecondAttempt(db, post, "preparing");
      return;
    }
  }
  // Not ready yet: the ledger brings the job back in two minutes, and it asks after the same container.
  throw new Error(`post ${post.id}: the container is not ready yet`);
}
