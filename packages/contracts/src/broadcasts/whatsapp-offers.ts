/**
 * Offers on WhatsApp to a US number, which Meta does not deliver. Since 1 April 2025 Meta has paused marketing template
 * messages to United States phone numbers, with no end announced (Meta's notice to businesses, and its partners' help pages,
 * read 6 October 2026). Utility templates (a reminder about a visit), authentication templates and every reply inside the
 * customer service window are delivered as before. One rule, read by a campaign's tick (reach-for.ts channelRefuses), the
 * note under an offer (offersNote), the pick of a channel for each person and Ask: a workspace whose WhatsApp number is a US
 * number has US customers, so its offers on WhatsApp are held, and go by email where the workspace can send them. The first
 * cut reads the number's country from its calling code, so a Canadian +1 number is held with the US ones; its area code is
 * the refinement, a table this does not keep.
 */
import type { EmailOffers } from "./email-offers";

/** A number of the North American plan, as E.164 writes it: +1 and ten digits. */
const PLUS_ONE = /^\+1\d{10}$/;

/**
 * The tick's reason, the note's clause and the composer's refusal: one sentence, with what still goes (an offer's plan
 * says it in Spanish too, offer-plan-words.ts).
 */
export const US_PAUSED = "Meta has paused offers on WhatsApp to US numbers. Appointment messages and replies still go.";

/** Whether Meta's pause holds for the offers this WhatsApp number sends: a US number's customers are in the US. */
function whatsappOffersPaused(e164: string | null | undefined): boolean {
  return typeof e164 === "string" && PLUS_ONE.test(e164.trim());
}

/**
 * Whether offers on WhatsApp can go from this number, and why not, in the shape email's offers answer in (email-offers.ts
 * EmailOffers), so a tick asks one question of either channel. Nothing of a gate's pause: Meta's is not a gate of ours.
 */
export function whatsappOffersOpen(e164: string | null | undefined): EmailOffers {
  return whatsappOffersPaused(e164)
    ? { ok: false, why: US_PAUSED, paused: null }
    : { ok: true, why: null, paused: null };
}
