import { INSTRUCTIONS_MAX } from "../workspace-config/config-rules.js";
import { FALLBACK_DEFAULTS, isProductFallback } from "../workspace-config/fallbacks.js";
import { notesInForce } from "../workspace-config/compose.js";
import { closureDatesLabel } from "../../calendar/calendar-words.js";
import { CHIPS_SHOWN, chipsMoreWords, count } from "./counts.js";
export const COMMON_LANGUAGES = [
  "English",
  "Spanish",
  "Portuguese",
  "French",
  "Haitian Creole",
  "Mandarin",
  "Cantonese",
  "Arabic",
  "Russian",
  "Polish",
  "Italian",
  "Hindi"
];
export const TONE_PRESETS = [
  {
    label: "Warm and brief",
    tone: "Warm and brief. Friendly, a sentence or two at a time, and straight to what the customer asked."
  },
  {
    label: "Professional, no small talk",
    tone: "Professional and to the point. Polite and clear, with no small talk and no exclamation marks."
  },
  {
    label: "Chatty, first names",
    tone: "Chatty and relaxed. Uses the customer's first name when it has one, and sounds like a friendly front desk."
  }
];
const cutAtWord = (text, max) => {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max + 1);
  const at = head.lastIndexOf(" ");
  const cut = (at > 0 ? head.slice(0, at) : t.slice(0, max)).replace(/[\s,;:·—–-]+$/u, "");
  return `${cut}\u2026`;
};
const NOTE_CHIPS = CHIPS_SHOWN;
export function notesWords(notes) {
  const titles = (Array.isArray(notes) ? notes : []).map((n2) => n2 && typeof n2.title === "string" ? n2.title.trim() : "").filter((t) => t !== "");
  const n = titles.length;
  return {
    count: n,
    chips: titles.slice(0, NOTE_CHIPS),
    more: n > NOTE_CHIPS ? chipsMoreWords(n - NOTE_CHIPS) : null
  };
}
export function noteEndedWords(until, tz, now) {
  if (typeof until !== "string" || !until) return null;
  return notesInForce([{ until }], tz, now).length ? null : `ended ${closureDatesLabel({ date: until })}`;
}
const OPENING_SHOWN = 72;
export function instructionsWords(text) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return { opening: null, limit: null };
  return {
    opening: `\u201C${cutAtWord(t, OPENING_SHOWN)}\u201D`,
    limit: t.length >= INSTRUCTIONS_MAX * 0.9 ? `${count(t.length)} of ${count(INSTRUCTIONS_MAX)} characters` : null
  };
}
export function fallbacksWords(fallbacks) {
  const keys = Object.keys(FALLBACK_DEFAULTS);
  const f = fallbacks && typeof fallbacks === "object" ? fallbacks : {};
  const differ = keys.filter((k) => {
    const t = typeof f[k] === "string" ? f[k].trim() : "";
    return t !== "" && !isProductFallback(k, t);
  }).length;
  return { line: `${count(keys.length)} messages, ${differ ? "in your words" : "the product's wording"}` };
}
