import { findLanguages, languageBase } from "../templates/template-languages.js";
export const ASK_LANGUAGES = ["en", "es", "other"];
const ES_HINT = /[áéíóúñ¿¡]|(?<!\p{L})(qué|que|quién|quien|cómo|como|cuándo|cuando|dónde|donde|hoy|mañana|hola|gracias|abierto|libre|cita|cliente|llam[oó]|llamaron|necesita|espera|por favor|el|la|los|las|una?|est[aá]n?)(?!\p{L})/giu;
const EN_HINT = /(?<!\p{L})(what|who|when|where|how|did|does|is|are|open|today|tomorrow|call|called|needs|waiting|the|a|an|please|tell)(?!\p{L})/giu;
export function detectLanguage(text) {
  const es = (text.match(ES_HINT) || []).length;
  const en = (text.match(EN_HINT) || []).length;
  if (!es && !en) return "other";
  return es > en ? "es" : "en";
}
const MESSAGE_LANGUAGES = ["en", "es"];
const SPANISH_NAMES = { ingles: "en", castellano: "es" };
export function messageLanguagesOf(names) {
  const out = [];
  for (const word of names.flatMap((n) => String(n).split(/[,/&]|\s(?:and|y)\s/i))) {
    const bare = word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
    const base = SPANISH_NAMES[bare] ?? languageBase(findLanguages(word.trim())[0]?.id);
    const language = MESSAGE_LANGUAGES.find((l) => l === base);
    if (word.trim() && language && !out.includes(language)) out.push(language);
  }
  return out;
}
export function messageLanguageOf(business, turn) {
  const asked = MESSAGE_LANGUAGES.find((l) => l === turn);
  if (asked && (business.length === 0 || business.includes(asked))) return asked;
  return business[0] ?? asked ?? "en";
}
const ALSO_IN = {
  en: { en: "Can you write it in English too?", es: "Can you write it in Spanish too?" },
  es: { en: "\xBFPuedes escribirlo tambi\xE9n en ingl\xE9s?", es: "\xBFPuedes escribirlo tambi\xE9n en espa\xF1ol?" }
};
export function messageLanguagesNext(cards, names, turn) {
  const business = messageLanguagesOf(names);
  if (business.length < 2 || !cards.length || cards.some((c) => c.kind !== "message" || c.plan)) return [];
  const written = new Set(
    cards.map((c) => languageBase(typeof c.payload.language === "string" ? c.payload.language : ""))
  );
  return business.filter((l) => !written.has(l)).map((l) => ALSO_IN[turn === "es" ? "es" : "en"][l]);
}
