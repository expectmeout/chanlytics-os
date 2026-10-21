/**
 * What a connected mailbox may send in a day, and why its own mail may hold it (decision 0056, 4 and 8): the cold ramp,
 * its owner's cap and the customer domain's ceiling, and the words for a hold. Its own module, apart from everything
 * Connections says (mailbox-connections.ts), since the reach-out sheet, the Activity log and the Reports lens read only
 * these, and a page that says a hold carries none of the rest.
 */

/** Why a mailbox's own mail held it (00423 mailbox_connections.held_why): only its owner's Resume lifts one. */
export const MAILBOX_HOLDS = ["bounces", "complaint", "unsubscribes"] as const;
export type MailboxHold = (typeof MAILBOX_HOLDS)[number];

/* --------------------------------------------------------------------------------------------------- the limits */

/** The highest cap an owner may set: the ramp's top (MAILBOX_RAMP), so a cap above it is one the ramp never reaches. */
export const MAILBOX_DAILY_CAP_MAX = 40;
/** A mailbox on the domain the business's customers write to never sends more than this a day (decision 0056, 4). */
export const CUSTOMER_DOMAIN_DAILY_MAX = 20;

type RampStep = { days: number; perDay: number };

/**
 * The cold ramp (decision 0056, 4): per mailbox, by the days it has actually sent since it was clean (D15, counted by
 * the database's mailbox_capacity over the last 90), never the calendar's. A mailbox that has sent on two days is two
 * days into its ramp, whenever it was connected.
 */
export const MAILBOX_RAMP: readonly [RampStep, ...RampStep[]] = [
  { days: 0, perDay: 10 },
  { days: 7, perDay: 20 },
  { days: 14, perDay: 30 },
  { days: 21, perDay: 40 },
];

/** The ramp's share for the days a mailbox has sent on. */
export function mailboxRampShare(sentDays: number): number {
  const days = Math.max(0, Math.floor(Number(sentDays) || 0));
  let cap = 0;
  for (const step of MAILBOX_RAMP) if (days >= step.days) cap = step.perDay;
  return cap;
}

/**
 * How many a day a mailbox may send now: the least of its ramp's share, its owner's cap, and the customer domain's
 * ceiling. The claim, the timetable, the door and the page all ask this one rule.
 */
export function mailboxDailyCap(m: { sent_days: number; daily_cap: number; customer_domain: boolean }): number {
  const owner = Math.max(0, Math.min(MAILBOX_DAILY_CAP_MAX, Math.floor(Number(m.daily_cap) || 0)));
  const ceiling = m.customer_domain ? CUSTOMER_DOMAIN_DAILY_MAX : MAILBOX_DAILY_CAP_MAX;
  return Math.min(mailboxRampShare(m.sent_days), owner, ceiling);
}

/* ------------------------------------------------------------------------------------------------- its holds */

const HOLD_WORDS: Record<MailboxHold, string> = {
  bounces: "more than 3% of its recent emails bounced or were refused",
  complaint: "someone marked an email from it as spam",
  unsubscribes: "more than 3% of the businesses it wrote to unsubscribed",
};

/** Why a mailbox was held, as a clause: the row, the Activity log and the owner's notice say it alike. */
export function mailboxHoldWords(why: string | null | undefined): string {
  return (why && HOLD_WORDS[why as MailboxHold]) || "it was held";
}

const HOLD_FIX_WORDS: Record<MailboxHold, string> = {
  bounces: "Check the addresses it writes to and its domain's records below, then resume it.",
  complaint: "Read the email again (a clear reason for writing, and fewer a day), then resume it.",
  unsubscribes: "Write to fewer, and to the ones it fits best, then resume it.",
};

/** What to do about a hold: on the row, in the Resume confirm, and in the owner's notice. */
export function mailboxHoldFixWords(why: string | null | undefined): string | null {
  return (why && HOLD_FIX_WORDS[why as MailboxHold]) || null;
}
