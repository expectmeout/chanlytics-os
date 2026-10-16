/**
 * The languages Ask answers in (ASK_LANGUAGES), and the guess at a question's language made before the model's
 * (detectLanguage). The message carries its language (ask.ts); the suggestions and the Open button speak it
 * (ask-suggestions.ts, answer-text.ts). And the language a message to customers is written in, which is the
 * customers', not the person's asking (messageLanguageOf), and the next question that offers the others the business
 * speaks (messageLanguagesNext).
 */
import { findLanguages, languageBase } from "../templates/template-languages";

/* ------------------------------------------------------------- language */

export const ASK_LANGUAGES = ["en", "es", "other"] as const;
export type AskLanguage = (typeof ASK_LANGUAGES)[number];

/**
 * The hints, every one counted (the `g` flag: without it a match is one, so any question with a hint of each language
 * tied and read as English), and a word's edges are letters of any language (`\b` is ASCII's: the "a" closing "día" or
 * "consultoría" was a word of its own, and English's).
 */
const ES_HINT =
  /[áéíóúñ¿¡]|(?<!\p{L})(qué|que|quién|quien|cómo|como|cuándo|cuando|dónde|donde|hoy|mañana|hola|gracias|abierto|libre|cita|cliente|llam[oó]|llamaron|necesita|espera|por favor|el|la|los|las|una?|est[aá]n?)(?!\p{L})/giu;
const EN_HINT =
  /(?<!\p{L})(what|who|when|where|how|did|does|is|are|open|today|tomorrow|call|called|needs|waiting|the|a|an|please|tell)(?!\p{L})/giu;

/** A light guess at the language of a question; the model settles it. */
export function detectLanguage(text: string): AskLanguage {
  const es = (text.match(ES_HINT) || []).length;
  const en = (text.match(EN_HINT) || []).length;
  if (!es && !en) return "other";
  return es > en ? "es" : "en";
}

/* ------------------------------------------------------------- a message's language */

/** The languages Ask writes a message to customers in: the starters' (templates/starter-templates.ts STARTER_LANGUAGES). */
type MessageLanguage = "en" | "es";
const MESSAGE_LANGUAGES: readonly MessageLanguage[] = ["en", "es"];

/** Spellings the list of WhatsApp's languages does not hold, accents off: Spanish's word for English, and Castilian. */
const SPANISH_NAMES: Record<string, MessageLanguage> = { ingles: "en", castellano: "es" };

/**
 * The languages a business speaks that Ask writes a message in, read off its profile's free words (Languages the
 * receptionist answers in) in their order, each once: "Spanish", "español", "es" and "castellano" are Spanish; "English
 * and Spanish" is both; a language Ask does not write in is left out.
 */
export function messageLanguagesOf(names: readonly string[]): MessageLanguage[] {
  const out: MessageLanguage[] = [];
  for (const word of names.flatMap((n) => String(n).split(/[,/&]|\s(?:and|y)\s/i))) {
    const bare = word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
    const base = SPANISH_NAMES[bare] ?? languageBase(findLanguages(word.trim())[0]?.id);
    const language = MESSAGE_LANGUAGES.find((l) => l === base);
    if (word.trim() && language && !out.includes(language)) out.push(language);
  }
  return out;
}

/**
 * The language a message to customers is written in when the person named none: the one they write to Ask in, where the
 * business speaks it or names none; else the business's first; English where neither says.
 */
export function messageLanguageOf(business: readonly MessageLanguage[], turn: AskLanguage): MessageLanguage {
  const asked = MESSAGE_LANGUAGES.find((l) => l === turn);
  if (asked && (business.length === 0 || business.includes(asked))) return asked;
  return business[0] ?? asked ?? "en";
}

/** "Can you write it in Spanish too?", in the turn's language: the person's own next words, a tap away. */
const ALSO_IN: Record<MessageLanguage, Record<MessageLanguage, string>> = {
  en: { en: "Can you write it in English too?", es: "Can you write it in Spanish too?" },
  es: { en: "¿Puedes escribirlo también en inglés?", es: "¿Puedes escribirlo también en español?" },
};

/**
 * The next questions of an answer of message cards alone (loop.ts cardsAnswer): each language the business speaks
 * (messageLanguagesOf of its profile's words) that none of them is written in, so the other card is one tap away and
 * never assumed. None for a business that names fewer than two, a round with any other card, or a plan's message,
 * which its plan sends.
 */
export function messageLanguagesNext(
  cards: ReadonlyArray<{ kind: string; payload: Record<string, unknown>; plan?: unknown }>,
  names: readonly string[],
  turn: AskLanguage,
): string[] {
  const business = messageLanguagesOf(names);
  if (business.length < 2 || !cards.length || cards.some((c) => c.kind !== "message" || c.plan)) return [];
  const written = new Set(
    cards.map((c) => languageBase(typeof c.payload.language === "string" ? c.payload.language : "")),
  );
  return business.filter((l) => !written.has(l)).map((l) => ALSO_IN[turn === "es" ? "es" : "en"][l]);
}
