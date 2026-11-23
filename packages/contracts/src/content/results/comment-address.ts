/**
 * Inbox's comments' addresses (00692; the content loop PRD's 9.2): the comments on the business's posts, listed apart
 * from its conversations (`inbox/comments`), and one comment opened where it is answered (`inbox/cm-<touch id>`, as
 * `rq-<id>` names a form's request and `th-<id>` a conversation).
 *
 * A module of its own and small: the frame's route chunk and the Inbox's route read it, so nothing of the pages rides in.
 */
import { UUID } from "../../shared/identity";

/** The Inbox's param that lists the comments. */
const COMMENTS_PARAM = "comments";

/** The address of the comments' list. */
export const COMMENTS_ROUTE = `inbox/${COMMENTS_PARAM}`;

/** Whether an Inbox param lists the comments. */
export const isCommentsParam = (param: string | null | undefined): boolean => param === COMMENTS_PARAM;

/** A comment's own address in Inbox: where Today's point and its row open, and where it is answered. */
export const commentAddress = (touchId: string): string => `inbox/cm-${touchId}`;

/** The comment an Inbox param names (`cm-<id>`), or null for any other. */
export function commentIdOf(param: string | null | undefined): string | null {
  const id = param?.startsWith("cm-") ? param.slice(3) : "";
  return UUID.test(id) ? id : null;
}
