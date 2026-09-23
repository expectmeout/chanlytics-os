/**
 * What a run is read by, wherever it is read: the window a reply counts in, and the reasons a person is held back at
 * the wire, in the owner's words. The broadcast's run report, the Playbooks page and a person's page all read them;
 * they live apart from broadcasts.ts, which imports People's lists, so People can read them without a cycle.
 */

/**
 * A reply is an inbound within this long of the send; a question two weeks later is its own thread. The SQL series
 * keeps the same window (migration 00064's '72 hours'), and every page says it in these words.
 */
export const REPLY_WINDOW_HOURS = 72;
export const REPLY_WINDOW_MS = REPLY_WINDOW_HOURS * 3_600_000;
export const REPLY_WINDOW_WORDS = `within ${REPLY_WINDOW_HOURS / 24} days`;

/**
 * Whether a customer's message at `at` answers a send that reached them at `sentAt`: after it, and inside the reply
 * window. The run report counts its replies by this, and a person's page says "Replied" by it.
 */
export function isReplyTo(sentAt: string, at: string): boolean {
  const s = Date.parse(sentAt);
  const a = Date.parse(at);
  return Number.isFinite(s) && Number.isFinite(a) && a > s && a - s <= REPLY_WINDOW_MS;
}

/** The reasons a person is held back at the wire, in the owner's words. */
export const HELD_REASONS: Record<string, string> = {
  opted_out: "asked to stop",
  not_opted_in: "no recorded yes",
  // The reason the send job writes when the OTHER yes is the missing one. It was
  // added to the wire (00095) and not to these words, so the owner read the raw
  // enum `no_marketing_consent` on the broadcast's own detail pane -- and the
  // distinction it draws is the entire point of the split, so it is the last one
  // that should have arrived untranslated.
  no_marketing_consent: "no yes to offers",
  no_phone: "no number",
  // The number is on file but no thread answers to it on this line: a stored
  // number that does not normalise, or one no contact row matches.
  no_thread: "no thread for that number",
  human_has_it: "a person had the thread",
  paused: "the workspace was paused",
  superseded_by_human: "a person answered first",
  sms_carries_no_promotions: "no offers by text",
  email_marketing_disabled: "no offers by email yet",
  email_suppressed: "their email address stopped accepting mail",
  recipient_changed: "their email address changed",
  erased: "deleted",
  send_failed: "WhatsApp refused",
  missing_value: "a value was missing",
  // Spelled out rather than computed from OUTCOME_UNKNOWN: a computed key makes
  // this object opaque to the bundler, which then carries the whole map into
  // every package that imports anything from here. core-broadcast.test.mjs
  // holds the two spellings together.
  outcome_unknown: "a run that did not finish",
};
