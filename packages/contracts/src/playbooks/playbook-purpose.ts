/**
 * A moment and its message agree on the yes they need (the campaigns-on-every-channel spec, decision 7, built 2 Oct
 * 2026): the message's kind is the one purpose. A moment under Booking or the follow-ups reaches anyone who said yes to
 * texts, so its message must be about their own visit or proposal; a moment under Standing offers or Re-engage reaches
 * only a yes to offers, so its message is an offer. A playbook whose two disagree is refused when it is made or
 * changed, in these words: before, a moment for texts could carry an offer, enrol everyone who said yes to texts, and
 * see the send refuse each of them at the door.
 */
import { type AskedPurpose, purposeOfPlaybook, purposeOfTemplate } from "../consent/consent";

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
    "This moment reaches anyone who said yes to texts, and this message is an offer, which only a yes to offers may get. Pick a message about their own visit or proposal.",
  texts_on_offers:
    "This moment sends offers, which only a yes to offers may get, and this message is about a person's own visit or proposal. Pick an offer, or a moment for visits.",
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
