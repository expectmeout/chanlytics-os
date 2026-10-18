import { resolveFacts } from "../facts.js";
export const FALLBACK_DETAILS = ["business", "booking link", "phone"];
export const FALLBACK_DEFAULTS = {
  greeting: "Hi! Thanks for reaching out to {business}.\n\nBook anytime: {booking link}\n\nReply here with any question.",
  error: "Thanks for reaching out to {business}! A member of our team will reply here soon. Book anytime: {booking link}",
  non_text: "Thanks for your message! A member of our team will take a look and reply here soon. For anything urgent, call us at {phone}."
};
export const EARLIER_FALLBACK_DEFAULTS = /* @__PURE__ */ (() => ({
  greeting: "Hi! Thanks for reaching out to {business}.\n\nBook anytime: {booking link}\n\nOr reply here with any question.",
  error: "Thanks for reaching out to {business}! Book anytime: {booking link} \u2014 or a member of our team will reply here soon.",
  non_text: FALLBACK_DEFAULTS.non_text
}))();
export const FALLBACK_ROWS = [
  { key: "error", label: "It couldn't write a reply", when: "Then it waits for you" },
  { key: "non_text", label: "It got something it can't read", when: "Voice notes, stickers, some photos" },
  { key: "greeting", label: "The AI is down", when: "Rare. Every chat waits for you" }
];
export function isProductFallback(key, text) {
  const t = typeof text === "string" ? text.trim() : "";
  return t === FALLBACK_DEFAULTS[key] || t === EARLIER_FALLBACK_DEFAULTS[key];
}
const DETAIL = /\{\s*(business|booking\s+link|phone)\s*\}/gi;
const namesADetail = (text) => /\{\s*(business|booking\s+link|phone)\s*\}/i.test(text);
const detailOf = (raw) => raw.toLowerCase().replace(/\s+/g, " ");
function fillDetails(text, values) {
  if (!namesADetail(text)) return text;
  return text.split("\n").map((line) => {
    if (!namesADetail(line)) return line;
    return line.split(/(?<=[.!?])\s+/).filter((s) => [...s.matchAll(DETAIL)].every((m) => values[detailOf(m[1])])).map((s) => s.replace(DETAIL, (_, name) => values[detailOf(name)])).join(" ");
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function fallbackMessages(brain, known) {
  const facts = resolveFacts(brain, known);
  const values = {
    business: facts.business_name.value ?? brain.business_name,
    "booking link": facts.booking_link.value ?? brain.booking_link ?? null,
    phone: facts.phone_display.value
  };
  const own = (kind) => {
    const stored = brain.fallbacks[kind];
    return !values["booking link"] && stored.trim() === EARLIER_FALLBACK_DEFAULTS[kind] ? FALLBACK_DEFAULTS[kind] : stored;
  };
  const say = (kind) => fillDetails(own(kind), values) || fillDetails(FALLBACK_DEFAULTS[kind], values);
  return { greeting: say("greeting"), error: say("error"), non_text: say("non_text") };
}
export function unknownDetails(text) {
  return [...text.matchAll(/\{[^{}\n]{1,40}\}/g)].map((m) => m[0]).filter((name) => !namesADetail(name));
}
