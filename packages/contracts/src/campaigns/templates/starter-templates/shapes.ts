/** Starter templates: shapes. */

import type { PlaybookTrigger } from "../../playbooks/triggers/kinds";
import { SENDER_WORDS } from "../sender-words";
import { languageBase } from "../languages";
import type { ParamSourceKind } from "../params";

/** What a starter's slot takes: one of the sources a campaign fills a slot from (templates.ts). */
export type StarterSlotKind = ParamSourceKind;

export interface StarterSlot {
  kind: StarterSlotKind;
  /** The words a person sees for the slot. */
  label: string;
  /** What WhatsApp's reviewers read; also the preview's words. */
  example: string;
}

/** The WhatsApp version in one language. Its slots are the message's: every other version fills the same ones. */
export interface StarterText {
  body: string;
  footer: string | null;
  slots: StarterSlot[];
}

/** The email version in one language: the same numbered slots, in a subject and a body. */
export interface StarterEmailText {
  subject: string;
  body: string;
}

/** The text version in one language: the same numbered slots; the sender adds the STOP line. */
export interface StarterSmsText {
  body: string;
}

export interface StarterTemplate {
  key: string;
  /** Meta's name: lowercase, digits, underscores. Same as the key. */
  name: string;
  title: string;
  /** One line on when it is for. */
  purpose: string;
  category: "marketing" | "utility";
  /** The playbook trigger it is written for, when there is one. */
  trigger: PlaybookTrigger | null;
  /** The WhatsApp version, by language. */
  texts: { en_US: StarterText } & Record<string, StarterText>;
  /** The email version, by language; absent where an email means nothing for it. */
  email?: Record<string, StarterEmailText>;
  /** The text version, by language; absent for an offer, which texts never carry. */
  sms?: Record<string, StarterSmsText>;
  /** No longer offered (2 Oct 2026): the starter that took its place, if one did, and why. */
  retired?: { by: string | null; why: string };
}

export const STARTER_LANGUAGES = [
  { id: "en_US", label: "English" },
  { id: "es", label: "Spanish" },
] as const;

/**
 * The code a message is filed under, from its language alone as Ask names it ("en", "es"): the one of STARTER_LANGUAGES
 * with that base, English under en_US as the starters and Meta file it, so a message written in English sits beside the
 * starters under one code and a twin of it is found there; a language the list does not hold is filed as it is named.
 * The one reading of the list, for every writer that takes a language by name.
 */
export function messageLanguageCode(language: string): string {
  const base = languageBase(language);
  return STARTER_LANGUAGES.find((l) => languageBase(l.id) === base)?.id ?? language;
}

export const FIRST = { kind: "first_name" as const, label: "First name", example: "Dani" };

export const BUSINESS = { kind: "business_name" as const, label: "Business name", example: "Luna Studio" };

export const LINK = { kind: "booking_link" as const, label: "Booking link", example: "https://booksy.com/luna-studio" };

export const FIRST_ES = { ...FIRST, label: "Nombre" };

export const BUSINESS_ES = { ...BUSINESS, label: "Nombre del negocio" };

export const LINK_ES = { ...LINK, label: "Enlace de reservas" };

export const WHEN = { kind: "visit_when" as const, label: "When", example: "tomorrow at 2:00 PM" };

export const SERVICE = { kind: "visit_service" as const, label: "Service", example: "a consultation" };

export const WHEN_ES = { ...WHEN, label: "Cuándo", example: "mañana a las 2:00 PM" };

export const SERVICE_ES = { ...SERVICE, label: "Servicio", example: "una consulta" };

export const PROPOSAL = {
  kind: "proposal_link" as const,
  label: "Proposal link",
  example: "https://docs.example.com/proposal",
};

export const PROPOSAL_ES = { ...PROPOSAL, label: "Enlace de la propuesta" };

// The time a cancellation freed (0082), as the batch kept it for every send: "tomorrow at 2:00 PM", "on Thursday at 3:00 PM".
export const FREED_WHEN = { kind: "freed_when" as const, label: "When", example: "tomorrow at 2:00 PM" };

export const FREED_WHEN_ES = { ...FREED_WHEN, label: "Cuándo", example: "mañana a las 2:00 PM" };

// Where a customer leaves the business a review: the link its Google listing keeps (00415), filled at the send.
export const REVIEW = {
  kind: "review_link" as const,
  label: "Review link",
  example: "https://g.page/r/example/review",
};

export const REVIEW_ES = { ...REVIEW, label: "Enlace de reseñas" };

export const OFFER = {
  kind: "text" as const,
  label: "The offer",
  example: "20% off any service booked before Friday.",
};

export const OFFER_ES = {
  kind: "text" as const,
  label: "La oferta",
  example: "20% de descuento en cualquier servicio reservado antes del viernes.",
};

// The footer under every WhatsApp message of the set is the line a text carries (sender-words.ts), said once.
export const STOP_EN = SENDER_WORDS.en.textStop;

export const STOP_ES = SENDER_WORDS.es.textStop;
