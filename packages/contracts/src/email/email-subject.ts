/**
 * An email's subject as it leaves, and the one that poses as something it is not. One rule each, read by the wire
 * (channels buildEmailRequest), by a draft its owner sends and by Send me a test, so they never disagree.
 */

/** A header value is one line: a newline in one is how a second header is smuggled in. */
export const oneLine = (s: string): string =>
  s
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The longest subject an email leaves with. */
const SUBJECT_MAX = 200;

const REPLY_PREFIX = /^\s*(?:re|aw|sv|rv|antw)\s*:\s*/i;

/** A first email's subject as it leaves: one line, at most SUBJECT_MAX. */
export function firstSubject(subject: string): string {
  return oneLine(subject).slice(0, SUBJECT_MAX);
}

/** "Re: <their subject>", once, however many prefixes the chain has stacked. A parent without one still gets a subject a person can find. */
export function replySubject(parentSubject: string | null | undefined): string {
  let s = oneLine(parentSubject ?? "");
  while (REPLY_PREFIX.test(s)) s = s.replace(REPLY_PREFIX, "");
  return `Re: ${s || "your message"}`.slice(0, SUBJECT_MAX);
}

/**
 * A subject that claims to answer or pass on an email. A first email a program sends never carries one, because that
 * subject deceives. Two places ask: the wire refuses to build such an email (channels buildEmailRequest), and the
 * reach-out sheet refuses to save such words (validateReachOutWords). One predicate, so they never disagree.
 */
const ANSWER_OR_FORWARD = /^\s*(?:re|aw|sv|rv|antw|fwd?)\s*:/i;

export function posesAsReply(subject: string): boolean {
  return ANSWER_OR_FORWARD.test(subject);
}
