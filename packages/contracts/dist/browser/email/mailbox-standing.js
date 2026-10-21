export const MAILBOX_HOLDS = ["bounces", "complaint", "unsubscribes"];
export const MAILBOX_DAILY_CAP_MAX = 40;
export const CUSTOMER_DOMAIN_DAILY_MAX = 20;
export const MAILBOX_RAMP = [
  { days: 0, perDay: 10 },
  { days: 7, perDay: 20 },
  { days: 14, perDay: 30 },
  { days: 21, perDay: 40 }
];
export function mailboxRampShare(sentDays) {
  const days = Math.max(0, Math.floor(Number(sentDays) || 0));
  let cap = 0;
  for (const step of MAILBOX_RAMP) if (days >= step.days) cap = step.perDay;
  return cap;
}
export function mailboxDailyCap(m) {
  const owner = Math.max(0, Math.min(MAILBOX_DAILY_CAP_MAX, Math.floor(Number(m.daily_cap) || 0)));
  const ceiling = m.customer_domain ? CUSTOMER_DOMAIN_DAILY_MAX : MAILBOX_DAILY_CAP_MAX;
  return Math.min(mailboxRampShare(m.sent_days), owner, ceiling);
}
const HOLD_WORDS = {
  bounces: "more than 3% of its recent emails bounced or were refused",
  complaint: "someone marked an email from it as spam",
  unsubscribes: "more than 3% of the businesses it wrote to unsubscribed"
};
export function mailboxHoldWords(why) {
  return why && HOLD_WORDS[why] || "it was held";
}
const HOLD_FIX_WORDS = {
  bounces: "Check the addresses it writes to and its domain's records below, then resume it.",
  complaint: "Read the email again (a clear reason for writing, and fewer a day), then resume it.",
  unsubscribes: "Write to fewer, and to the ones it fits best, then resume it."
};
export function mailboxHoldFixWords(why) {
  return why && HOLD_FIX_WORDS[why] || null;
}
