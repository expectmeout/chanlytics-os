/** The closed sets of consent's: its states, and the words that mean a person said stop or yes. Held to their columns as every set is (shared/enums.ts). */
export const CONSENT_STATES = ["unknown", "opted_in", "opted_out"] as const;
export type ConsentState = (typeof CONSENT_STATES)[number];

/** Customer texts that mean opt-out (webhook consent handling, §4). */
export const OPT_OUT_PATTERN = /^\s*(stop|baja|unsubscribe|alto)\s*[.!]?\s*$/i;

/**
 * What stops EVERYTHING when a person writes it by email: the same STOP words, but not UNSUBSCRIBE. An unsubscribe is
 * not a STOP (the spec's decision 12): by email it ends offers by email and leaves their visit messages
 * (EMAIL_UNSUBSCRIBE_PATTERN), exactly as the link's page does. A WhatsApp message keeps OPT_OUT_PATTERN, which reads it
 * as a STOP there.
 */
export const EMAIL_STOP_PATTERN = /^\s*(stop|baja|alto)\s*[.!]?\s*$/i;

/**
 * An email that asks to stop the offers and nothing more: "unsubscribe", "please unsubscribe me", "desuscribirme", the
 * whole of the words they wrote. It goes through the same door as the unsubscribe link (set_email_marketing).
 */
export const EMAIL_UNSUBSCRIBE_PATTERN = /^\s*(?:please\s+)?(?:unsubscribe(?:\s+me)?|desuscribir(?:me)?)\s*[.!]?\s*$/i;

/**
 * The carriers' opt-out words, for a TEXTING LINE only.
 *
 * Twilio's default list (STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE,
 * OPTOUT, per the FCC ruling) blocks the number at the carrier whatever our
 * record says, so on SMS our record must agree with theirs: a QUIT we did not
 * recognise left a customer opted in on our side and unreachable on the
 * carrier's, with the next send bouncing and an owner told a delivery failed.
 *
 * WhatsApp has no carrier rule, and its appointment templates carry "Cancel"
 * and "End" buttons that mean a booking, not a goodbye -- so these words are
 * never applied to a WhatsApp message. Whole-message only: "stop by at 4?" is
 * a booking on either channel.
 */
export const SMS_OPT_OUT_PATTERN =
  /^\s*(stop|stopall|end|cancel|quit|unsubscribe|revoke|optout|baja|alto)\s*[.!]?\s*$/i;

/**
 * Customer texts that mean opt back IN — the way out of an opt-out.
 *
 * Without this, enforcing opt-out silences someone permanently: they text STOP
 * once and nothing they ever send again gets a reply, including "start". Only
 * these exact words count. A looser test (any message means they're back)
 * would lift the block the moment they said anything, which is the same as not
 * having one — and "sí"/"yes" is deliberately excluded because it is how
 * people answer an ordinary question, not how they rejoin a list.
 */
// NOT what the wire reads any more. The inbound reading takes the two split
// patterns below, one per question, because a message that answers both is one
// opt-in enrolling a person in two programs -- which the carriers refuse a
// campaign for (30913), and which the message flow then had to confess. Kept
// for the readers that want "any opt-in word at all".
export const OPT_IN_PATTERN = /^\s*(start|unstop|resume|alta|yes offers|si ofertas|s\u00ed ofertas)\s*[.!]?\s*$/i;

/**
 * The words that answer the MARKETING question, and only that one.
 *
 * THE DEFECT THIS SPLITS. OPT_IN_PATTERN above treats "YES OFFERS" and "START"
 * as the same event: both set the single `consent` column, which then gates
 * appointment reminders, the receptionist's replies and promotional broadcasts
 * alike. So one message gave one yes that covered three purposes -- which is
 * carrier error 30913 exactly: "marketing consent was combined with other
 * consents. Marketing consent must be collected separately."
 *
 * These words say offers, in both languages this product speaks. Nothing here
 * is a bare "yes": that is how a person answers an ordinary question, and it
 * must never be read as express written consent to be marketed to.
 */
export const MARKETING_OPT_IN_PATTERN = /^\s*(yes offers|si ofertas|s\u00ed ofertas)\s*[.!]?\s*$/i;

/**
 * The words that answer the CONVERSATIONAL question: messages about your own
 * visit, and the receptionist writing back.
 *
 * START/UNSTOP/RESUME are the carriers' own standard words and are declared to
 * them in the campaign's opt-in keywords. ALTA is their Spanish equivalent.
 */
export const CONVERSATION_OPT_IN_PATTERN = /^\s*(start|unstop|resume|alta)\s*[.!]?\s*$/i;

/** Which question a customer's message answers, or null when it answers neither. */
export function optInPurposeOf(text: string): "conversational" | "marketing" | null {
  if (MARKETING_OPT_IN_PATTERN.test(text)) return "marketing";
  if (CONVERSATION_OPT_IN_PATTERN.test(text)) return "conversational";
  return null;
}

/**
 * The phrase a customer sends to say yes to offers. Unambiguous on purpose,
 * so it can ride a wa.me link or a QR at the desk without "yes" to an
 * ordinary question ever counting; the ingest records it as their own
 * message, the strongest consent there is.
 */
export const OFFERS_OPT_IN_PHRASES = { en: "YES OFFERS", es: "SI OFERTAS" } as const;
