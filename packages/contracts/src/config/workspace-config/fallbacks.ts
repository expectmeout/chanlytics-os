/**
 * The three messages sent in the business's name when the receptionist cannot answer: the product's wording,
 * today's and the earlier one, each filled with the business's details as it goes out (fallbackMessages).
 */
import { resolveFacts, type KnownFacts } from "../facts";
import type { BrainConfig } from "./brain-config";

/** The details a message sent in the business's name may name, as the owner writes them. */
export const FALLBACK_DETAILS = ["business", "booking link", "phone"] as const;
export type FallbackDetail = (typeof FALLBACK_DETAILS)[number];

/**
 * The product's own wording for the three messages, naming the details rather
 * than copying them, so they follow the business's details from the first day
 * and a customer is never sent "call us at ." before a line exists.
 *
 * Each sentence stands without the one naming the link, which a business that
 * quotes does not have (the first run's decision 2): fillDetails leaves out a
 * sentence naming a detail the workspace lacks, and what is left must still be
 * a whole message.
 */
export const FALLBACK_DEFAULTS: BrainConfig["fallbacks"] = {
  greeting:
    "Hi! Thanks for reaching out to {business}.\n\nBook anytime: {booking link}\n\nReply here with any question.",
  error:
    "Thanks for reaching out to {business}! A member of our team will reply here soon. Book anytime: {booking link}",
  non_text:
    "Thanks for your message! A member of our team will take a look and reply here soon. For anything urgent, call us at {phone}.",
};

/**
 * The product's wording before 24 Sep 2026, still the product's. Two of its
 * sentences leaned on the one naming the link ("Or reply here", "— or a member
 * of our team will reply"), so with no link they read as half a message.
 * Workspaces set up with it keep it, since a stored message is theirs to change:
 * it is never said to be their own words, or offered the default wording back.
 */
export const EARLIER_FALLBACK_DEFAULTS: BrainConfig["fallbacks"] = /* @__PURE__ */ (() => ({
  greeting:
    "Hi! Thanks for reaching out to {business}.\n\nBook anytime: {booking link}\n\nOr reply here with any question.",
  error:
    "Thanks for reaching out to {business}! Book anytime: {booking link} — or a member of our team will reply here soon.",
  non_text: FALLBACK_DEFAULTS.non_text,
}))();

/**
 * Whether a message is in the product's wording, today's or the earlier one: the one test the Business tab's line
 * (business-tab.ts fallbacksWords) and each message's "Use the default wording" ask.
 */
export function isProductFallback(key: keyof BrainConfig["fallbacks"], text: string | null | undefined): boolean {
  const t = typeof text === "string" ? text.trim() : "";
  return t === FALLBACK_DEFAULTS[key] || t === EARLIER_FALLBACK_DEFAULTS[key];
}

const DETAIL = /\{\s*(business|booking\s+link|phone)\s*\}/gi;
const namesADetail = (text: string) => /\{\s*(business|booking\s+link|phone)\s*\}/i.test(text);
const detailOf = (raw: string) => raw.toLowerCase().replace(/\s+/g, " ") as FallbackDetail;

function fillDetails(text: string, values: Record<FallbackDetail, string | null>): string {
  if (!namesADetail(text)) return text;
  return text
    .split("\n")
    .map((line) => {
      if (!namesADetail(line)) return line;
      // Sentence by sentence, so a detail the workspace lacks takes only its own sentence with it.
      return line
        .split(/(?<=[.!?])\s+/)
        .filter((s) => [...s.matchAll(DETAIL)].every((m) => values[detailOf(m[1])]))
        .map((s) => s.replace(DETAIL, (_, name: string) => values[detailOf(name)] as string))
        .join(" ");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The three messages sent in the business's name when the receptionist cannot
 * answer, with its details as they are now (the wiring audit's S5).
 *
 * They were written once, from what the form held that day, with the number
 * and the booking link baked in, and nothing wrote them again: a changed link
 * or a new line left customers the old one. A message may now name
 * {business}, {booking link} and {phone}, filled here as it goes out from the
 * facts the prompt speaks (resolveFacts): the number is the one the owner
 * typed or the line the receptionist answers, formatted for a person. A
 * sentence naming a detail the workspace does not have is left out rather
 * than sent with a hole in it; a message naming none goes out exactly as
 * written; one that would leave nothing says the default instead.
 */
export function fallbackMessages(brain: BrainConfig, known?: KnownFacts | null): BrainConfig["fallbacks"] {
  const facts = resolveFacts(brain, known);
  const values: Record<FallbackDetail, string | null> = {
    business: facts.business_name.value ?? brain.business_name,
    "booking link": facts.booking_link.value ?? brain.booking_link ?? null,
    phone: facts.phone_display.value,
  };
  // The earlier wording leaned on the sentence naming the link, so with none it went out as half a message ("Or reply
  // here with any question."): a workspace still holding it is sent today's wording in its place, which says the same
  // in whole sentences. Its own words are never touched.
  const own = (kind: keyof BrainConfig["fallbacks"]) => {
    const stored = brain.fallbacks[kind];
    return !values["booking link"] && stored.trim() === EARLIER_FALLBACK_DEFAULTS[kind]
      ? FALLBACK_DEFAULTS[kind]
      : stored;
  };
  const say = (kind: keyof BrainConfig["fallbacks"]) =>
    fillDetails(own(kind), values) || fillDetails(FALLBACK_DEFAULTS[kind], values);
  return { greeting: say("greeting"), error: say("error"), non_text: say("non_text") };
}

/**
 * The names in a message that nothing fills in -- "{bookinglink}", "{phone
 * number}" -- which a customer would read exactly as written. The Business
 * form says so under the message before it is saved (S5).
 */
export function unknownDetails(text: string): string[] {
  return [...text.matchAll(/\{[^{}\n]{1,40}\}/g)].map((m) => m[0]).filter((name) => !namesADetail(name));
}
