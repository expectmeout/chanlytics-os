import { OFFERS_OPT_IN_PHRASES } from "../shared/enums.js";
export function waMeDigits(number) {
  const digits = String(number ?? "").replace(/\D/g, "");
  return digits.length < 8 ? null : digits;
}
export function waMeLink(number, text) {
  const digits = waMeDigits(number);
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
export function optInLink(numberE164, phrase = OFFERS_OPT_IN_PHRASES.en) {
  return waMeLink(numberE164, phrase);
}
