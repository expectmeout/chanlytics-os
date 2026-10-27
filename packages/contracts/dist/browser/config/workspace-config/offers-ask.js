import { yesCovers } from "../../consent/consent-channels.js";
import { STOP_ENDED_OFFERS_SOURCE } from "../../people/person-consent.js";
import { clockDate } from "../../shared/clock.js";
import { OFFERS_OPT_IN_PHRASES } from "../../shared/enums.js";
const FACT = /* @__PURE__ */ (() => ({
  yes: "Said yes to offers.",
  no: "Said no to offers.",
  never: "Has not been asked for the yes to offers.",
  asked: (on) => `Asked for the yes to offers${on ? ` on ${on}` : ""}; has not said it.`,
  text: "This conversation is by text message, not WhatsApp.",
  dm: "This conversation is by Instagram direct message, not WhatsApp."
}))();
export function offersFacts(p, channel, now, tz) {
  const out = [];
  if (channel === "sms") out.push(FACT.text);
  if (channel === "instagram") out.push(FACT.dm);
  const asked = p.offersAskedAt;
  const open = p.marketingConsent === "unknown" || p.marketingConsent === "opted_in" && !yesCovers(p.marketingChannels, "whatsapp");
  if (p.marketingConsent === "opted_in" && !open) out.push(FACT.yes);
  else if (p.marketingConsent === "opted_out") out.push(FACT.no);
  else if (open) {
    if (typeof asked === "string") {
      const at = Date.parse(asked);
      out.push(FACT.asked(Number.isFinite(at) ? clockDate(at, tz, now.getTime()) : null));
    } else if (asked === null && channel === "whatsapp" && !p.optedOut) out.push(FACT.never);
  }
  return out;
}
export function offersAfterStart(p, channel) {
  if (channel !== "whatsapp") return null;
  if (p.marketingConsent !== "unknown" || p.marketingConsentSource !== STOP_ENDED_OFFERS_SOURCE) return null;
  return `Offers and news stay off. Reply ${OFFERS_OPT_IN_PHRASES.en} to get them here again.`;
}
export function offersAskRule() {
  const { en, es } = OFFERS_OPT_IN_PHRASES;
  return `When a WhatsApp conversation the customer started comes to its natural end after something went well (a booking made or confirmed, or their question fully answered), and the facts about them say "${FACT.never}", close your reply with this question, once, in their language: "Want our offers and news here too? Reply ${en}. You can stop any time." (in Spanish, ${es} in place of ${en}). Never ask twice; never on a text or email conversation, in a complaint, in a cancellation, after STOP, or of anyone who has said no to offers; never make it a condition of anything.`;
}
