/**
 * The languages Ask answers in (ASK_LANGUAGES), and the guess at a question's language made before the model's
 * (detectLanguage). The message carries its language (ask.ts); the suggestions and the Open button speak it
 * (ask-suggestions.ts, answer-text.ts).
 */

/* ------------------------------------------------------------- language */

export const ASK_LANGUAGES = ["en", "es", "other"] as const;
export type AskLanguage = (typeof ASK_LANGUAGES)[number];

const ES_HINT =
  /[áéíóúñ¿¡]|\b(qué|que|quién|quien|cómo|como|cuándo|cuando|dónde|donde|hoy|mañana|hola|gracias|abierto|libre|cita|cliente|llam[oó]|llamaron|necesita|espera|por favor|el|la|los|las|una?|est[aá]n?)\b/i;
const EN_HINT =
  /\b(what|who|when|where|how|did|does|is|are|open|today|tomorrow|call|called|needs|waiting|the|a|an|please|tell)\b/i;

/** A light guess at the language of a question; the model settles it. */
export function detectLanguage(text: string): AskLanguage {
  const es = (text.match(ES_HINT) || []).length;
  const en = (text.match(EN_HINT) || []).length;
  if (!es && !en) return "other";
  return es > en ? "es" : "en";
}
