/**
 * What the sender says under a message, in the language of the version it sends (the Campaigns review, finding 4): the
 * line under every text, an email's foot, and the way out. One table, so the starters' footers, a text's STOP line and
 * every email's foot read the same words, and a version written in Spanish does not end in English.
 *
 * Two languages are written, English and Spanish, the two the starter set ships. Any other language reads English,
 * whatever the code, and so does a version that kept none: the words a customer can read are better than none, and the
 * message itself is what the owner wrote in the language they chose. THE LANGUAGE IS REQUIRED wherever these are read
 * (a null says the version kept none), so no sender says its foot without asking which one it is.
 */
import { languageBase } from "./template-languages";

/** The languages the sender's words are written in. */
export type SenderLanguage = "en" | "es";

/** What the sender says in one language. `who` is the business's name. */
export interface SenderWords {
  /** The line under every text, which is also the footer of a starter's WhatsApp message. */
  textStop: string;
  /** The way out of a message about a visit: it carries no unsubscribe link, so a reply of STOP is how a person stops it. */
  emailStop: string;
  /** What a reach-out's email says it is: CAN-SPAM asks a commercial email to identify itself as one. */
  marketing: string;
  /** The cold foot's way out in words, beside the link: a reply. */
  noThanks: string;
  /** What the link in an offer's or a cold email's foot reads. */
  unsubscribe: string;
  /** Who the foot names when the business has no name on file. */
  us: string;
  /** An offer's reason, for someone who asked for offers by email themselves. */
  offerAsked: (who: string) => string;
  /** An offer's reason, for someone who has dealt with the business. */
  offerCustomer: (who: string) => string;
  /** A message about a visit's reasons: their proposal, their visit, or only that they have been in touch. */
  visitProposal: (who: string) => string;
  visitBooked: (who: string) => string;
  visitInTouch: (who: string) => string;
}

export const SENDER_WORDS: Record<SenderLanguage, SenderWords> = {
  en: {
    textStop: "Reply STOP to opt out",
    emailStop: "Reply STOP to stop these emails.",
    marketing: "This is a marketing email.",
    noThanks: `Not interested? Reply "no thanks" and I won't write again`,
    unsubscribe: "Unsubscribe",
    us: "us",
    offerAsked: (who) => `You asked for offers from ${who}.`,
    offerCustomer: (who) => `You're a customer of ${who}.`,
    visitProposal: (who) => `You're getting this about your proposal from ${who}.`,
    visitBooked: (who) => `You're getting this because of your visit with ${who}.`,
    visitInTouch: (who) => `You're getting this because you've been in touch with ${who}.`,
  },
  es: {
    textStop: "Responde STOP para darte de baja",
    emailStop: "Responde STOP para dejar de recibir estos correos.",
    marketing: "Este es un correo de marketing.",
    noThanks: `¿No te interesa? Responde "no, gracias" y no volveré a escribirte`,
    unsubscribe: "Darme de baja",
    us: "nosotros",
    offerAsked: (who) => `Pediste recibir ofertas de ${who}.`,
    offerCustomer: (who) => `Eres cliente de ${who}.`,
    visitProposal: (who) => `Recibes esto sobre tu propuesta de ${who}.`,
    visitBooked: (who) => `Recibes esto por tu visita con ${who}.`,
    visitInTouch: (who) => `Recibes esto porque has estado en contacto con ${who}.`,
  },
};

/**
 * Which of the two a version's language reads as: Spanish for "es" and its regions ("es_MX", "es-419"), English for
 * everything else, a code nobody wrote and a version with none (null).
 */
export function senderLanguage(language: string | null): SenderLanguage {
  return languageBase(language) === "es" ? "es" : "en";
}

/** What the sender says, in the language of the version it sends. */
export function senderWords(language: string | null): SenderWords {
  return SENDER_WORDS[senderLanguage(language)];
}
