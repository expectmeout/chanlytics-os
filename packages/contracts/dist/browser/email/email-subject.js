const ANSWER_OR_FORWARD = /^\s*(?:re|aw|sv|rv|antw|fwd?)\s*:/i;
export function posesAsReply(subject) {
  return ANSWER_OR_FORWARD.test(subject);
}
