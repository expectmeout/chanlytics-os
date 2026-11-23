/**
 * comment_reply (00699; the content loop PRD's 9.2 and 12.4, call 27): a public answer to a comment on a post. Step
 * `draft`, asked when the comment was kept: AI writes the answer knowing the post (one model call, purpose
 * comment_reply), held to the owner's word before anyone sees it (contracts commentDraftOf), and kept as a draft or as
 * a comment AI can't answer safely. Step `send`, asked by the owner's press: the owner's words posted under the comment
 * as the business, once. The job says it is about to speak the moment before Instagram is called, so a run that dies
 * after is never run again (kinds.ts); an answer whose outcome is not known says so, and is never sent twice blind.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { COMMENT_ANSWER_WORDS, commentAnswerPrompt, commentDraftOf, type PlaceAdapter } from "@chanlytics/contracts";
import {
  findCommentForWork,
  keepCommentDraft,
  readAnswerFacts,
  settleCommentAnswer,
  type CommentForWork,
} from "@chanlytics/db/content";
import { findPostForWork, type PostRow } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import { markSpoke, type ClaimedJob } from "@chanlytics/jobs";
import { callModel } from "../ai/model.js";
import { logger } from "../shared/log.js";

type Db = SupabaseClient<Database>;

/** The place an answer is posted at: its adapter, or the words for why it cannot be from here now. */
type AnswerPlaceOf = (post: PostRow) => Promise<PlaceAdapter | { cant: string }>;

/** Step draft: AI's answer, or why it can't answer safely, kept once; a comment already answered or drafted is left. */
async function draftAnswer(db: Db, job: ClaimedJob, comment: CommentForWork): Promise<void | { skipped: string }> {
  if (comment.answer) return { skipped: comment.answer.state };
  const facts = await readAnswerFacts(db, comment.tenantId, new Date());
  const prompt = commentAnswerPrompt(facts, {
    words: comment.words,
    username: comment.username,
    postKind: comment.post.kind,
    caption: comment.post.caption,
  });
  const answer = await callModel(
    { purpose: "comment_reply", body: { system: prompt.system, messages: [{ role: "user", content: prompt.user }] } },
    { tenantId: comment.tenantId, subjectId: comment.touchId },
  );
  // No key, a paused workspace, a model that failed: no draft, which the comment says; the owner writes their own.
  if (!answer || answer.outcome !== "ok") {
    logger({ tenant_id: job.tenant_id }).info("comment_draft_skipped", {
      touch_id: comment.touchId,
      outcome: answer?.outcome ?? "no_key",
    });
    return { skipped: "no_draft" };
  }
  const draft = commentDraftOf(answer.text, facts.says);
  await keepCommentDraft(db, { tenantId: comment.tenantId, touchId: comment.touchId, ...draft });
  logger({ tenant_id: job.tenant_id }).info("comment_drafted", {
    touch_id: comment.touchId,
    cannot: "cannotWhy" in draft,
  });
}

/** Step send: the owner's words posted under the comment, once, and what Instagram said kept. */
async function sendAnswer(
  db: Db,
  job: ClaimedJob,
  comment: CommentForWork,
  placeOf: AnswerPlaceOf,
): Promise<void | { skipped: string }> {
  const words = comment.answer?.state === "sending" ? comment.answer.words : null;
  if (!words) return { skipped: comment.answer?.state ?? "nothing" };
  const settle = (outcome: { sent: true; externalId: string } | { sent: false; said: string }) =>
    settleCommentAnswer(db, { tenantId: comment.tenantId, touchId: comment.touchId, ...outcome });
  const post = await findPostForWork(db, comment.tenantId, comment.post.id);
  if (!post || post.status !== "published")
    return void (await settle({ sent: false, said: COMMENT_ANSWER_WORDS.postDown }));
  const place = await placeOf(post);
  if ("cant" in place || !place.answerComment)
    return void (await settle({ sent: false, said: COMMENT_ANSWER_WORDS.disconnected }));
  await markSpoke(db, job);
  const sent = await place.answerComment(comment.commentId, words);
  const log = logger({ tenant_id: job.tenant_id });
  if (sent.is === "sent") {
    log.info("comment_answered", { touch_id: comment.touchId });
    return void (await settle({ sent: true, externalId: sent.externalId }));
  }
  log.info("comment_answer_refused", {
    touch_id: comment.touchId,
    is: sent.is,
    code: sent.is === "refused" ? sent.refusal.code : null,
  });
  await settle({ sent: false, said: sent.is === "refused" ? sent.refusal.words : COMMENT_ANSWER_WORDS.unknown });
}

/** comment_reply: AI's draft of a public answer, or the owner's words sent. */
export async function replyToComment(
  db: Db,
  job: ClaimedJob,
  placeOf: AnswerPlaceOf,
): Promise<void | { skipped: string }> {
  const touchId = typeof job.payload.touch_id === "string" ? job.payload.touch_id : "";
  if (!touchId) return { skipped: "unnamed" };
  const comment = await findCommentForWork(db, touchId);
  if (!comment || comment.tenantId !== job.tenant_id) return { skipped: "gone" };
  if (job.payload.step === "draft") return draftAnswer(db, job, comment);
  if (job.payload.step === "send") return sendAnswer(db, job, comment, placeOf);
  return { skipped: "unknown_step" };
}
