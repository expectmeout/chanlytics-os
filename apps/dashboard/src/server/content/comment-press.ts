import "server-only";

/**
 * The owner's presses on a comment (00692; the content loop PRD's 12.4, call 27), each on their own session through its
 * door. Send: their words posted as the business's public answer, kept as on its way with the job that posts it, once
 * (comment_answer_send); an answer on its way or up is not sent twice, and the press answers where it stands. The owner's
 * own typed words are theirs: no check refuses them by a guess at what they mean. Leave it: no answer, and no point on
 * Today; Answer it after all brings AI's draft back (comment_answer_leave). A comment that is not this workspace's is
 * the door's refusal (P0002), said in its own words.
 */
import type { CommentAnswerState } from "@chanlytics/contracts";
import { leaveComment, sendCommentAnswer } from "@chanlytics/db/content";
import type { Member } from "../shared/route";
import type { RouteContext } from "../shared/with-route";

/** What a press on a comment asks. */
type CommentPress =
  | { act: "send"; touch_id: string; words: string }
  | { act: "leave"; touch_id: string }
  | { act: "back"; touch_id: string };

/** Where the answer stands after the press, and whether this press sent it. */
interface CommentPressed {
  sent: boolean;
  state: CommentAnswerState | null;
}

/** One press on one comment. */
export async function sendCommentPress(
  ctx: RouteContext,
  member: Member,
  press: CommentPress,
): Promise<CommentPressed> {
  const target = { tenantId: member.tenantId, touchId: press.touch_id };
  if (press.act === "send") return sendCommentAnswer(ctx.supabase, { ...target, words: press.words });
  const state = await leaveComment(ctx.supabase, { ...target, left: press.act === "leave" });
  return { sent: false, state };
}
