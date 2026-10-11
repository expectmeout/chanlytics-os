import type { DeliveryRefusal } from "../consent/consent";
import { HOUR_MS } from "../shared/time";
/**
 * What a run is read by, wherever it is read: the window a reply counts in, the reasons a person is held back at
 * the wire, in the owner's words, and the week's breath a send by hand keeps (who waits a week, and the words for them). The broadcast's run report, the Playbooks page and a person's page all read them;
 * they live apart from broadcasts.ts, which imports People's lists, so People can read them without a cycle.
 */

/**
 * A reply is an inbound within this long of the send; a question two weeks later is its own thread. The SQL series
 * keeps the same window (migration 00064's '72 hours'), and every page says it in these words.
 */
export const REPLY_WINDOW_HOURS = 72;
export const REPLY_WINDOW_MS = REPLY_WINDOW_HOURS * HOUR_MS;
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

/**
 * The reason a person a send by hand enrols is skipped for when they heard from a campaign or a broadcast within the
 * week (the week's breath, PLAYBOOK_BREATH_MS): written on their row the moment the run exists (core createBroadcast),
 * never by the wire, unless the person sending it chose to send to them too. HELD_REASONS words it, spelled out there.
 */
export const RECIPIENT_REASON_HEARD = "heard_this_week";

/**
 * The week's breath on a send by hand: of the people a send reaches, who goes now and who waits a week, having heard from a
 * campaign or a broadcast within it (`touched`: packages/db touchesSince over PLAYBOOK_BREATH_MS, the one read the
 * composer, Ask's card and core createBroadcast are each handed). The composer's "N wait a week" (audiencePreview's
 * `heard`) and Ask's card count by it, and the send skips the waiting with RECIPIENT_REASON_HEARD unless the person sends
 * to them too (`breathe: false`).
 */
export function breathSplit<T>(
  reached: readonly T[],
  idOf: (person: T) => string,
  touched: ReadonlySet<string>,
): { goes: T[]; waits: T[] } {
  const goes: T[] = [];
  const waits: T[] = [];
  for (const person of reached) (touched.has(idOf(person)) ? waits : goes).push(person);
  return { goes, waits };
}

/**
 * The composer's note on who of those it reaches heard from a run this week, and Ask's card's: while the send breathes they
 * wait a week ("3 wait a week"); sent to them too, who they are. Null when none did.
 */
export function heardWords(n: number, breathe: boolean): string | null {
  if (n <= 0) return null;
  if (breathe) return `${n} ${n === 1 ? "waits" : "wait"} a week`;
  return `${n === 1 ? "One" : n} of them heard from a campaign or a broadcast this week.`;
}

/** The composer's switch that sends to them too, off by default, in the words beside it. Ask never offers it. */
export function heardTooWords(n: number): string {
  return `Also send to the ${n === 1 ? "one" : n} who heard this week`;
}

/** Why a send that breathes reaches nobody: everyone it would reach heard this week. The composer's foot, Ask's and the route's. */
export function allWaitWords(label: string, n: number): string {
  return n === 1
    ? `The one person on “${label}” it reaches heard from a campaign or a broadcast this week, so it waits a week.`
    : `All ${n} on “${label}” it reaches heard from a campaign or a broadcast this week, so they wait a week.`;
}

/**
 * How many a send's receipt says it goes to (POST broadcasts' answer): everyone it enrolled less those who wait a week.
 * A receipt from before the breath has no `waits_a_week`, and went to everyone it enrolled.
 */
export function goesToOf(receipt: { recipient_count: number; waits_a_week?: number }): number {
  return receipt.recipient_count - (receipt.waits_a_week ?? 0);
}

/**
 * The reasons a person is held back at the wire, in the owner's words: every door refusal (the compiler holds it,
 * consent.ts DELIVERY_REFUSALS), and the run's own. A type import only, so the bundler still sees a plain object.
 */
export const HELD_REASONS: Record<DeliveryRefusal, string> & Record<string, string> = {
  opted_out: "asked to stop",
  not_opted_in: "no recorded yes",
  // The reason the send job writes when the OTHER yes is the missing one. It was
  // added to the wire (00095) and not to these words, so the owner read the raw
  // enum `no_marketing_consent` on the broadcast's own detail pane -- and the
  // distinction it draws is the entire point of the split, so it is the last one
  // that should have arrived untranslated.
  no_marketing_consent: "no yes to offers",
  no_phone: "no number",
  // The channel picked was email and no address is on file (step 3), or no channel the send ticks could carry it.
  no_address: "no email address",
  no_channel: "no channel it can go by",
  sms_line_not_active: "the texting line is not active",
  // The workspace's month of emails or texts is used up (CAMPAIGN_MONTH_ALLOWANCE): held on its channel, never moved.
  month_allowance: "this month's allowance is used up",
  // A send by hand skipped them at enrolment: they heard from a campaign or a broadcast that week (the week's breath).
  // Spelled out rather than computed from RECIPIENT_REASON_HEARD, as outcome_unknown is below; run-report.test.mjs
  // holds the two spellings together.
  heard_this_week: "waited a week: heard from you this week",
  // The message's WhatsApp version is no longer one a send can use: it holds the people who go by WhatsApp, and only them.
  template_not_approved: "its WhatsApp version is no longer approved",
  // The number is on file but no thread answers to it on this line: a stored
  // number that does not normalise, or one no contact row matches.
  no_thread: "no thread for that number",
  human_has_it: "a person had the thread",
  paused: "the workspace was paused",
  superseded_by_human: "a person answered first",
  sms_carries_no_promotions: "no offers by text",
  // The campaigns domain offers leave from is not this deployment's to use, or the provider does not verify it: the business's
  // news by email is an offer at the door (decision D2), so it waits as an offer does. Each person's own skip, final.
  email_marketing_disabled: "offers and news by email can't leave yet: the campaigns domain isn't switched on",
  // The workspace's offers by email are paused while complaints or bounces settle (email-offers.ts), and the business's news
  // by email with them (decision D2); a visit's reminder and a reply still go.
  email_offers_paused: "offers and news by email are paused",
  // An offer's foot names the business's address, and it has none on file: the person is held until it does.
  no_business_address: "no business address on file",
  email_suppressed: "their email address stopped accepting mail",
  recipient_changed: "their email address changed",
  erased: "deleted",
  // The provider refused the send, on whichever channel the person was reached by: a page that knows the channel says
  // it by SEND_REFUSED_WORDS, and a row that does not (a person's own page, a run made before rows kept theirs) says this.
  send_failed: "the provider refused it",
  missing_value: "a value was missing",
  // A reminder's appointment moved, was cancelled or marked missed, or left the calendar between the run and the send
  // (calendar/feed-appointments.ts appointmentHolds): held, never sent for a time that no longer stands.
  appointment_changed: "their appointment moved or was cancelled",
  // Spelled out rather than computed from OUTCOME_UNKNOWN: a computed key makes
  // this object opaque to the bundler, which then carries the whole map into
  // every package that imports anything from here. core-broadcast.test.mjs
  // holds the two spellings together.
  outcome_unknown: "a run that did not finish",
  // Reach out's (a cold email), short, for a run's line.
  unsubscribed: "unsubscribed",
  outreach_is_email_only: "cold email goes by email only",
  outreach_not_a_lead: "not a business your searches found",
  outreach_lead_closed: "no longer being written to",
  outreach_suppressed: "on the never-again list",
  outreach_wrote_back: "wrote back or called",
  outreach_away: "away until the day they're back",
  outreach_stopped: "you stopped writing to them",
  outreach_without_unsubscribe: "no unsubscribe link",
  outreach_needs_own_domain: "not from your own domain",
  sending_domain_not_ready: "the domain isn't sending",
  sending_domain_at_cap: "the domain's day is full",
};

/**
 * Whose word "delivered" is, under a count of it: a campaign goes by WhatsApp, text and email, and each wire reports
 * its own deliveries. The pages said "WhatsApp's receipts" over totals that had come to include the other two.
 */
export const DELIVERY_RECEIPTS_WORDS = "each channel's own receipts";
/** The same, alone in a tooltip. */
export const DELIVERY_RECEIPTS_TIP = "Each channel's own receipts";

/**
 * The two reasons the workspace, not the person, holds an email for: its offers and news by email paused by a gate, and a
 * campaigns domain that cannot be used. A run that also goes another way skips each email person for them, one by one, and
 * goes on (core broadcast-stops.ts).
 */
export const EMAIL_HOLDS = [
  "email_offers_paused",
  "email_marketing_disabled",
] as const satisfies readonly DeliveryRefusal[];
export type EmailHold = (typeof EMAIL_HOLDS)[number];

/**
 * The reasons a finished run gives for the people it held back, in one list for its news (core broadcast.ts finishedNews):
 * a run's tally counts who was held, not why, so the news names what any run is held for, each in the words the run's own
 * page gives (HELD_REASONS). The workspace's holds on email are named only where this run skipped someone for one
 * (`emailHeld`): a run that went on past its email people must say that is what happened to them, and a run nobody was
 * held on for it must not suggest it.
 */
export function finishedRunHeldWhy(emailHeld: readonly EmailHold[]): string {
  const why = [
    HELD_REASONS.not_opted_in,
    HELD_REASONS.opted_out,
    HELD_REASONS.no_phone,
    HELD_REASONS.human_has_it,
    ...EMAIL_HOLDS.filter((r) => emailHeld.includes(r)).map((r) => HELD_REASONS[r]),
  ];
  return `${why.join(", ")}, or ${HELD_REASONS.outcome_unknown}`;
}
