/**
 * A subject that claims to answer or pass on an email. A first email a program sends never carries one, because that
 * subject deceives. Two places ask: the wire refuses to build such an email (channels buildEmailRequest), and the
 * reach-out sheet refuses to save such words (validateReachOutWords). One predicate, so they never disagree.
 */
const ANSWER_OR_FORWARD = /^\s*(?:re|aw|sv|rv|antw|fwd?)\s*:/i;

export function posesAsReply(subject: string): boolean {
  return ANSWER_OR_FORWARD.test(subject);
}
