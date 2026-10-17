import { CONSENT_CHANNELS } from "../consent/consent-channels.js";
import { CHANNEL_WORDS, reachFor } from "./reach-for.js";
export const READY_WHATSAPP_ALONE = {
  whatsapp: { ready: true, why: null },
  sms: { ready: false, why: CHANNEL_WORDS.unchecked },
  email: { ready: false, why: CHANNEL_WORDS.unchecked }
};
export function readyOrWhatsApp(read) {
  return read ?? READY_WHATSAPP_ALONE;
}
export function answeredYes(r, purpose) {
  return (purpose === "marketing" ? r.consent.marketing : r.consent.state) === "opted_in";
}
export function personReachOf(r, ready) {
  const how = { channels: CONSENT_CHANNELS, ready: readyOrWhatsApp(ready), about: "theirs" };
  const offers = reachFor(r, "marketing", how).held;
  const visit = reachFor(r, "conversational", how);
  return {
    saidYes: { offers: answeredYes(r, "marketing"), messages: answeredYes(r, "conversational") },
    canReceive: { offers: offers === null, messages: visit.held === null },
    whyNot: { offers, messages: visit.held },
    reachedOn: visit.channel
  };
}
