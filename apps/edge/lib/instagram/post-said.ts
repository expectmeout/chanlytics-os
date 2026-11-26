/**
 * What a person says about a post, as Meta delivers it to the Instagram door (00699; the content loop PRD's 9.2,
 * Appendix A.3 to A.5; the first-post sitting's answers 5-6 and 6.2):
 *
 *   a comment        on a post Chanlytics sent, kept once with its person (found by the Instagram-scoped id a DM's sender
 *                    carries, or made by the comment) and AI's draft of a public answer asked for, in one transaction.
 *                    One on a post made by hand in the Instagram app is kept only where Meta says it was left on an ad
 *                    this workspace holds (00719): on the ad, counted for its drawer, and answered by its owner.
 *   our own comment  the business answering a kept comment from the Instagram app: that comment is answered, by hand.
 *   a code alone     an ig.me link that opened a chat already under way arrives as its code with no message: where the
 *                    code is a post's link's, it is kept as that person's touch of the post, in their thread, so the
 *                    visit they ask for next can record what it answered.
 *
 * Each is safe to receive twice (the comment's id, the code's moment). A write the database refused is owed again (1),
 * as a DM is; anything that is not ours is said in the log and acknowledged.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InstagramEvent } from "@chanlytics/channels/instagram";
import { findPersonOfInstagramId, type RoutedChannel } from "@chanlytics/db/channels";
import { findPostOfCode, findThreadOfPerson, keepOwnComment, keepPostComment, keepTouch } from "@chanlytics/db/content";
import type { Database } from "@chanlytics/db/types";
import { errField, logger } from "../shared/log.js";

type Db = SupabaseClient<Database>;

type AboutAPost = Extract<InstagramEvent, { kind: "comment" | "own_comment" | "opened" }>;

/** A person's comment on a post, kept once. */
async function takeComment(db: Db, routed: RoutedChannel, event: Extract<AboutAPost, { kind: "comment" }>) {
  const kept = await keepPostComment(db, {
    tenantId: routed.tenantId,
    account: routed.externalId,
    from: event.from,
    username: event.username,
    commentId: event.commentId,
    mediaId: event.mediaId,
    parentId: event.parentId,
    words: event.text,
    at: event.atIso,
    adId: event.adId,
  });
  logger({ tenant_id: routed.tenantId }).info(kept.kept ? "ig_comment_kept" : "ig_comment_left", {
    comment: event.commentId,
    ...(kept.kept
      ? { post_id: kept.postId, ad_id: kept.adId, new_person: kept.newPerson }
      : { why: kept.why, on_ad: event.adId !== null }),
  });
}

/** A post's link's code arriving alone as an existing chat opens: the person's touch of the post, in their thread. */
async function takeOpened(db: Db, routed: RoutedChannel, event: Extract<AboutAPost, { kind: "opened" }>) {
  const log = logger({ tenant_id: routed.tenantId });
  const of = await findPostOfCode(db, event.ref);
  if (!of || of.tenantId !== routed.tenantId) return log.info("ig_code_left", { why: of ? "elsewhere" : "unknown" });
  const person = await findPersonOfInstagramId(db, routed.tenantId, event.from);
  if (!person) return log.info("ig_code_left", { why: "nobody" });
  const at = event.atIso ?? new Date().toISOString();
  const kept = await keepTouch(db, {
    tenantId: routed.tenantId,
    kind: "coded_message",
    subject: { type: "post", id: of.postId },
    contactId: person,
    place: "instagram",
    eventId: `ref:${event.ref}:${event.from}:${at}`,
    at,
    conversationId: await findThreadOfPerson(db, routed.tenantId, person),
    messageId: null,
  });
  log.info("touch_recorded", { kind: "coded_message", kept: kept.kept });
}

/** One item about a post: 0 when it is done with, 1 when the database did not take it and it is owed again. */
export async function takeAboutAPost(db: Db, routed: RoutedChannel, event: AboutAPost): Promise<number> {
  try {
    if (event.kind === "comment") await takeComment(db, routed, event);
    else if (event.kind === "opened") await takeOpened(db, routed, event);
    else if (
      await keepOwnComment(db, { tenantId: routed.tenantId, commentId: event.commentId, parentId: event.parentId })
    )
      logger({ tenant_id: routed.tenantId }).info("ig_comment_answered_by_hand", { comment: event.parentId });
    return 0;
  } catch (err) {
    logger({ tenant_id: routed.tenantId }).error("ig_post_said_failed", { what: event.kind, error: errField(err) });
    return 1;
  }
}
