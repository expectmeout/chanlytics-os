import { starterText } from "./starter-lookup.js";
import { defaultSlotKinds, slotLabels } from "./template-slots.js";
function fill(body, values) {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n) => values[Number(n) - 1] ?? m);
}
const OWN_SLOT_LABEL = /* @__PURE__ */ new Map([
  ["business_name", "Business name"],
  ["booking_link", "Booking link"],
  ["review_link", "Review link"]
]);
function slotWords(kind, label, example, own) {
  if (kind && OWN_SLOT_LABEL.has(kind)) {
    const given = own[kind];
    return typeof given === "string" && given.trim() ? given : `[${label}]`;
  }
  return example;
}
export function starterPreviewValues(s, language, businessName, bookingLink) {
  const t = starterText(s, language);
  const own = { business_name: businessName, booking_link: bookingLink };
  return t.slots.map((x) => slotWords(x.kind, x.label, x.example, own) ?? x.example);
}
export function starterPreview(s, language, businessName, bookingLink) {
  return fill(starterText(s, language).body, starterPreviewValues(s, language, businessName, bookingLink));
}
export function templatePreviewValues(t, own = {}) {
  const vars = Array.isArray(t.variables) ? t.variables : [];
  const kinds = defaultSlotKinds(t);
  const labels = slotLabels(t);
  const values = [];
  vars.forEach((v, i) => {
    const at = typeof v?.position === "number" && v.position >= 1 ? v.position - 1 : i;
    const kind = kinds[i];
    const label = labels[i] && !/^Value [0-9]+$/.test(labels[i]) ? labels[i] : OWN_SLOT_LABEL.get(kind) ?? `Value ${at + 1}`;
    const words = slotWords(kind, label, typeof v?.example === "string" && v.example ? v.example : null, own);
    if (words !== null) values[at] = words;
  });
  return values;
}
export function templatePreview(t, own = {}) {
  return fill(String(t.body_preview ?? ""), templatePreviewValues(t, own));
}
