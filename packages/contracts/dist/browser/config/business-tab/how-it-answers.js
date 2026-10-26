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
    key: "warm",
    label: "Warm",
    tone: "Warm and friendly. A sentence or two at a time, like a front desk that knows its regulars.",
    sample: "Oh, lovely, Saturday at 11 is open. Want to book it?"
  },
  {
    key: "polished",
    label: "Polished",
    tone: "Polished and courteous. Clear and complete, with no small talk and no exclamation marks.",
    sample: "Certainly. Saturday at 11 is available. Would you like the link to book it?"
  },
  {
    key: "upbeat",
    label: "Upbeat",
    tone: "Upbeat and quick. Cheerful, short sentences, and straight to what the customer asked.",
    sample: "Good news, Saturday at 11 is free! Want the link?"
  },
  {
    key: "calm",
    label: "Calm",
    tone: "Calm and unhurried. Reassuring, plain words, one thing at a time.",
    sample: "Saturday at 11 is open. Would you like the link to book it?"
  }
];
export const ASSISTANT_NAME_WORDS = {
  label: "Its name",
  empty: "No name",
  placeholder: "Ava",
  hint: "Callers always hear that it's the automated assistant, so the greeting says it beside the name.",
  gate: "give it a name",
  saved: (name) => name ? `It introduces itself as ${name}.` : "It has no name now.",
  tooLong: (max) => `A name is at most ${max} characters.`
};
export function personalityOf(tone) {
  const t = (tone ?? "").trim();
  return t ? TONE_PRESETS.find((p) => p.tone === t)?.key ?? null : null;
}
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
