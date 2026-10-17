import { waMeDigits, waMeLink } from "../shared/enums.js";
import { DAY_MS } from "../shared/time.js";
const TRY_IT_TEXT = "Hi";
const TRY_IT_LIVE_WITHIN_MS = DAY_MS;
const TRY_IT_NOTE = "Try it from your phone with this link, not by searching your contacts: it opens the chat even while WhatsApp there still says the number isn't on WhatsApp.";
export function tryItLink(number) {
  return waMeLink(number, TRY_IT_TEXT);
}
export function tryItNotes(wa, nowMs) {
  const digits = waMeDigits(wa.number);
  const href = tryItLink(wa.number);
  if (!digits || !href || wa.lastInboundMs !== null) return [];
  const age = nowMs - Date.parse(wa.connectedAt ?? wa.created_at);
  const fresh = age >= 0 && age < TRY_IT_LIVE_WITHIN_MS;
  return [{ text: TRY_IT_NOTE, link: { label: `wa.me/${digits}`, href }, ...fresh ? { live: true } : {} }];
}
