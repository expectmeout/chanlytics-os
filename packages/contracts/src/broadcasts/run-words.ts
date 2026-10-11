import type { DeliveryRefusal } from "../consent/consent";
import type { ConsentChannel } from "../consent/consent-channels";
import { HOUR_MS } from "../shared/time";
import type { ReachSplit } from "./reach-for";
/**
 * What a run is read by, wherever it is read: the window a reply counts in, the reasons a person is held back at the
 * wire, in the owner's words, and the week's breath a send by hand keeps (who it leaves out, and the words for them).
 * The broadcast's run report, the Playbooks page and a person's page all read them; they live apart from broadcasts.ts,
 * which imports People's lists, so People can read them without a cycle.
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
 * week (the week's breath, PLAYBOOK_BREATH_MS): they are left out, never sent it. Written on their row the moment the run
 * exists (core createBroadcast), and by the send's own check at the wire for a row whose skip that write did not reach
 * (LEFT_OUT_FACTS), unless the person sending it chose to send to them too. HELD_REASONS words it, spelled out there.
 */
export const RECIPIENT_REASON_HEARD = "heard_this_week";

/**
 * What the row of a person a send leaves out keeps (`broadcast_recipients.facts`), written with the run in its own
 * transaction (00381 assemble_broadcast): the send's check at the wire skips them for it (core messages/broadcast.ts),
 * whatever the hold after the run did. Its one word is the reason.
 */
export const LEFT_OUT_FACTS: Readonly<Record<string, string>> = { breath: RECIPIENT_REASON_HEARD };

/** Whether a recipient's facts say the send left them out for the week's breath (LEFT_OUT_FACTS). */
export function leftOutByFacts(facts: Readonly<Record<string, unknown>>): boolean {
  return facts.breath === RECIPIENT_REASON_HEARD;
}

/**
 * The week's breath on a send by hand: of the people a send reaches, who goes and who is left out, having heard from a
 * campaign or a broadcast within the week (`touched`: packages/db recentTouches, the one read the composer, Ask and core
 * createBroadcast are each handed). The composer's count (audiencePreview's `heard`, by channel `heardBy`) and Ask's card
 * count by it, and the send skips those left out with RECIPIENT_REASON_HEARD unless the person sends to them too
 * (`breathe: false`).
 */
export function breathSplit<T>(
  reached: readonly T[],
  idOf: (person: T) => string,
  touched: ReadonlySet<string>,
): { goes: T[]; leftOut: T[] } {
  const goes: T[] = [];
  const leftOut: T[] = [];
  for (const person of reached) (touched.has(idOf(person)) ? leftOut : goes).push(person);
  return { goes, leftOut };
}

/**
 * Who a send reaches by channel, under the week's breath: while it breathes, each channel less those on it who heard this
 * week (`heardBy`, the preview's), who are left out and so neither reached nor held; sent to them too, as it was. The
 * composer's channel clause, its bar, its month's line and its day's limit read this, never the split unbroken.
 */
export function reachAfterBreath(
  split: ReachSplit,
  heardBy: Readonly<Partial<Record<ConsentChannel, number>>>,
  breathe: boolean,
): ReachSplit {
  if (!breathe) return split;
  const byChannel = {
    whatsapp: split.byChannel.whatsapp - (heardBy.whatsapp ?? 0),
    sms: split.byChannel.sms - (heardBy.sms ?? 0),
    email: split.byChannel.email - (heardBy.email ?? 0),
  };
  return { ...split, byChannel, reached: byChannel.whatsapp + byChannel.sms + byChannel.email };
}

/** What a send says of the people it leaves out, before it goes: "3 left out: heard from you this week". */
const leftOutWords = (n: number): string => `${n} left out: heard from you this week`;

/**
 * The composer's note on who of those it reaches heard from a run this week, and Ask's card's: while the send breathes they
 * are left out ("3 left out: heard from you this week"); sent to them too, who they are. Null when none did.
 */
export function heardWords(n: number, breathe: boolean): string | null {
  if (!(n > 0)) return null;
  if (breathe) return leftOutWords(n);
  return `${n === 1 ? "One" : n} of them heard from a campaign or a broadcast this week.`;
}

/** The composer's switch that sends to them too, off by default, in the words beside it. Ask never offers it. */
export function heardTooWords(n: number): string {
  return `Also send to the ${n === 1 ? "one" : n} who heard this week`;
}

/**
 * Why a send that breathes reaches nobody: everyone it would reach heard this week. The composer's foot, the route's
 * refusal and Ask's. The plural rule is said once, here.
 */
export function allLeftOutWords(label: string, n: number): string {
  return `Everyone it reaches on “${label}” heard from you this week, so ${n === 1 ? "the one person is" : `all ${n} are`} left out.`;
}

/**
 * What the composer says when who heard this week could not be read: the send still leaves them out (it reads them again,
 * and is refused while it cannot), so its count may be fewer than the page's.
 */
export const HEARD_UNREAD_WORDS =
  "Who heard from you this week could not be read just now: the send still leaves them out, so it may go to fewer.";

/**
 * How many a send's receipt says it goes to (POST broadcasts' answer): everyone it enrolled less those left out. A
 * receipt from before the breath has no `left_out`, and went to everyone it enrolled.
 */
export function goesToOf(receipt: { recipient_count: number; left_out?: number }): number {
  return receipt.recipient_count - (receipt.left_out ?? 0);
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
  // A send by hand left them out: they heard from a campaign or a broadcast within the week (the week's breath), and were
  // never sent it. Spelled out rather than computed from RECIPIENT_REASON_HEARD, as outcome_unknown is below;
  // run-report.test.mjs holds the two spellings together.
  heard_this_week: "not sent: heard from you within the week",
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
