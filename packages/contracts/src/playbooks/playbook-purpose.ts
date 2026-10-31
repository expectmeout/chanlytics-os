/**
 * A moment and its message agree on the yes they need (the campaigns-on-every-channel spec, decision 7, built 2 Oct
 * 2026): the message's kind is the one purpose. A moment under Booking or the follow-ups reaches anyone who said yes to
 * texts, so its message must be about their own visit or proposal; a moment under Standing offers or Re-engage reaches
 * only a yes to offers, so its message is an offer. A playbook whose two disagree is refused when it is made or
 * changed, in these words: before, a moment for texts could carry an offer, enrol everyone who said yes to texts, and
 * see the send refuse each of them at the door.
 */
import { type AskedPurpose, type MessageAbout, purposeOfPlaybook, purposeOfTemplate } from "../consent/consent";
import { triggerOf } from "./playbook-triggers";

/**
 * What a moment's message is about (consent.ts MessageAbout, decision D1): a visit's, a follow-up's and a freed time's are
 * theirs, the visit they booked, the proposal their deal waits on and the time they asked about (0081); every other
 * moment's, and a broadcast's (no moment at all), is news the business chose to send. THE one reading of it: the
 * enrolment asks it of the playbook's moment, and the send asks it of the run's (the trigger its audience keeps), so the
 * two cannot disagree about anyone.
 * Kept here, beside the yes a moment's message needs, so the run's reach and the playbooks' words both import it without
 * importing each other.
 */
export function messageAboutOfTrigger(trigger: string | null | undefined): MessageAbout {
  const kind = triggerOf(trigger ?? "")?.kind;
  return kind === "visit" || kind === "deal" || kind === "freed" ? "theirs" : "ours";
}

/**
 * Whether a moment's send passes the 24-hour handover pause (a thread's `paused_until`, which any owner reply sets 24 hours
 * ahead; the door is core deliver.ts), decision D4 of the Campaigns wiring review: only the day-before reminder does. It is
 * about the customer's own booking, and booking systems send it whatever the chat is doing: a customer who writes the evening
 * before and is answered by the team would otherwise lose it to a pause that runs past the visit. Every other moment keeps
 * the pause: the after-visit message most often follows a complaint, where "how was your visit?" does harm, and an offer, the
 * business's news, a win-back or a proposal's follow-up has no business in the middle of a conversation. THE one reading of
 * it, asked by the batch of the run's moment and by the door of what the batch hands it. A LIVE hold (a call in progress, a
 * teammate holding the thread right now) holds the reminder too, but for a while: the batch waits for it, never skips for it.
 */
export function passesHandoverPause(trigger: string | null | undefined): boolean {
  return trigger === "visit_tomorrow";
}

/**
 * The message a run is counted for: its template's category, as Meta filed it. Null where no message is in view (a
 * moment counted before any playbook sends one), which says nothing; a category of null is a message nobody filed, and
 * fails closed (purposeOfTemplate).
 */
export type RunMessage = { category: string | null } | null;

/**
 * The yes a run enrols by: the stricter of its moment's class and its message's category, marketing if either is, so
 * nobody is enrolled whom the message cannot reach at the door. They agree for a playbook made since the check
 * (messageFitsMoment); they part for one made before it, such as an After-the-visit playbook that moved from Re-engage
 * to Booking while still sending the offer it was made with, which then enrols only a yes to offers.
 */
export function enrolPurpose(policyClass: string | null | undefined, message: RunMessage | undefined): AskedPurpose {
  const byClass = purposeOfPlaybook(policyClass);
  if (!message || byClass === "marketing") return byClass;
  return purposeOfTemplate(message.category);
}

/** The two ways a moment and its message disagree, and what each says. */
export const MESSAGE_MOMENT_WORDS = {
  offer_on_texts:
    "This moment reaches anyone who said yes to texts, and this message is an offer, which only a yes to offers may get. Pick a reminder, a check after, or a follow-up.",
  texts_on_offers:
    "This moment sends offers, which only a yes to offers may get, and this message is a reminder, a check after or a follow-up. Pick an offer, or the moment it was written for.",
} as const;

/**
 * Whether a moment's class and its message's category agree, and if not which way they part. Meta's category is the
 * message's; one no channel ever named (null) is an offer, as the send reads it (purposeOfTemplate).
 */
export function messageFitsMoment(
  policyClass: string,
  category: string | null | undefined,
): { ok: true } | { ok: false; why: keyof typeof MESSAGE_MOMENT_WORDS; words: string } {
  const moment = purposeOfPlaybook(policyClass);
  const message = purposeOfTemplate(category);
  if (moment === message) return { ok: true };
  const why = moment === "conversational" ? "offer_on_texts" : "texts_on_offers";
  return { ok: false, why, words: MESSAGE_MOMENT_WORDS[why] };
}
