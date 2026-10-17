const PLUS_ONE = /^\+1\d{10}$/;
export const US_PAUSED = "Meta has paused offers on WhatsApp to US numbers. Reminders, confirmations and replies still go.";
function whatsappOffersPaused(e164) {
  return typeof e164 === "string" && PLUS_ONE.test(e164.trim());
}
export function whatsappOffersOpen(e164) {
  return whatsappOffersPaused(e164) ? { ok: false, why: US_PAUSED, paused: null } : { ok: true, why: null, paused: null };
}
