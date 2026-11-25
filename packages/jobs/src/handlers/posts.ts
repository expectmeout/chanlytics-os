/**
 * The handlers of a business's pieces and posts (00613, 00611, 00616, 00682, 00699): one step of a video made, a post made
 * ready, sent, sent to Google, asked about, taken down, its numbers read, its places asked what they hold, and a comment
 * on it answered. Each hands its
 * job to what the edge injects (ctx.files, ctx.posts) and says so when this runtime holds none. Apart from handlers.ts,
 * the table of every kind, since these are the content loop's own.
 */
import type { ClaimedJob, JobContext } from "../runner/context";

/** piece_make: one step of a video made from a business's clips (00613, decision 0122), through what the edge injects. payload: { piece_id, step, tick } */
export async function pieceMake(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.files) throw new Error("piece_make: this runtime holds no file reader");
  await ctx.files.piece(job, ctx.deadline);
}

/** post_prepare: a post made ready on Instagram (00611, decision 0121), through what the edge injects. payload: { post_id, attempt } */
export async function postPrepare(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.posts) throw new Error("post_prepare: this runtime holds no poster");
  return ctx.posts.prepare(job, ctx.deadline);
}

/** post_publish: a post sent, once, after the recheck (00611). payload: { post_id, attempt } */
export async function postPublish(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.posts) throw new Error("post_publish: this runtime holds no poster");
  return ctx.posts.publish(job, ctx.deadline);
}

/** post_google: a post on its way to Google at its time, sent once after the recheck (00616). payload: { post_id, attempt } */
export async function postGoogle(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.posts) throw new Error("post_google: this runtime holds no poster");
  return ctx.posts.google(job, ctx.deadline);
}

/** post_reconcile: Instagram asked what it has after a send with no answer (00611). payload: { post_id, attempt } */
export async function postReconcile(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.posts) throw new Error("post_reconcile: this runtime holds no poster");
  return ctx.posts.reconcile(job, ctx.deadline);
}

/** post_take_down: a post asked down at its place (00682). payload: { action_id, attempt, by_hand? } */
export async function postTakeDown(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.posts) throw new Error("post_take_down: this runtime holds no poster");
  return ctx.posts.takeDown(job, ctx.deadline);
}

/** post_observe: a post's numbers read back from its place at one step (00699). payload: { post_id, step } */
export async function postObserve(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.posts?.observe) throw new Error("post_observe: this runtime reads no post's numbers");
  return ctx.posts.observe(job, ctx.deadline);
}

/** posts_read: a workspace's places asked which of its posts they still hold, once a day. payload: {} or { dry } */
export async function postsRead(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.posts?.held) throw new Error("posts_read: this runtime asks no place what it holds");
  const answer = await ctx.posts.held(job, ctx.deadline);
  return "skipped" in answer ? answer : undefined;
}

/** comment_reply: a public answer to a comment, AI's draft or the owner's words sent (00699). payload: { touch_id, step, attempt? } */
export async function commentReply(ctx: JobContext, job: ClaimedJob): Promise<void | { skipped: string }> {
  if (!ctx.posts?.commentReply) throw new Error("comment_reply: this runtime answers no comment");
  return ctx.posts.commentReply(job, ctx.deadline);
}
