import { mayMessageFor } from "../consent/consent.js";
import { MERGE_CONSENT_SOURCE } from "./person-merge.js";
export const CONSENT_SOURCES = [
  { id: "in_person", label: "In person" },
  { id: "phone", label: "On the phone" },
  { id: "form", label: "Sign-up form" },
  { id: "customer_message", label: "Their own message" }
];
export const CONSENT_RESET_SOURCE = "operator";
export const CARRIER_CONSENT_SOURCE = "carrier";
export const STOP_ENDED_OFFERS_SOURCE = "stop";
export const WHATSAPP_CONSENT_SOURCE = "whatsapp";
export const OFFERS_YES_SOURCES = ["form", "customer_message"];
export function offersYesRefusal(source) {
  if (source && OFFERS_YES_SOURCES.includes(source)) return null;
  return "A yes to offers has to be in writing: a sign-up form they signed, or their own message. A spoken yes covers messages, not offers.";
}
export const OWN_MESSAGE_REFUSALS = {
  /** Their own message, with no message named. */
  missing: "Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn't see, record a sign-up form and say where in the note.",
  /** The message named is not one this person sent this workspace. */
  notTheirs: "That isn't a message this person sent you. Choose one of theirs.",
  /** The message named has nothing written in it. */
  wordless: "That message has no words in it to show their answer. Choose the one where they said it.",
  /** A message named beside another way of answering. */
  notOwnMessage: "Only an answer in their own message names a message.",
  /** Their own message, for many people at once: one message cannot be every person's. */
  batch: "Their own message is recorded one person at a time, on their page, where you choose the message. For signed slips, choose Sign-up form."
};
export function ownMessageRefusal(source, messageId) {
  if (source === "customer_message") return messageId ? null : OWN_MESSAGE_REFUSALS.missing;
  return messageId ? OWN_MESSAGE_REFUSALS.notOwnMessage : null;
}
export function consentSourceLabel(source) {
  if (!source) return null;
  const known = CONSENT_SOURCES.find((s) => s.id === source);
  if (known) return known.label;
  if (source === CARRIER_CONSENT_SOURCE) return "Reported by the carrier";
  if (source === STOP_ENDED_OFFERS_SOURCE) return "Ended when they said stop";
  if (source === WHATSAPP_CONSENT_SOURCE) return "Reported by WhatsApp";
  if (source === MERGE_CONSENT_SOURCE) return "From a merged record";
  return source === CONSENT_RESET_SOURCE ? null : source;
}
export function mayReceive(r, purpose, channel, about) {
  return whyNotReceive(r, purpose, channel, about) === null;
}
function bearingOf(c) {
  return {
    consent: c.state,
    dnc: c.dnc,
    marketing_consent: c.marketing,
    consent_channels: c.channels,
    marketing_channels: c.marketingChannels,
    // Email's own answer and the relationship an offer by email may rest on; absent reads as nothing, and fails closed.
    email_marketing: c.emailMarketing,
    has_relationship: c.relationship
  };
}
export function whyNotReceive(r, purpose, channel, about) {
  if (channel === "email") {
    if (!r.email) return "no_address";
    if (r.emailSuppressed) return "address_stopped";
  } else if (!r.phone) return "no_number";
  const said = mayMessageFor(bearingOf(r.consent), purpose, { proactive: true, channel, about });
  if (said.ok) return null;
  const { reason } = said;
  switch (reason) {
    case "opted_out":
      return "stopped";
    case "unsubscribed":
      return "unsubscribed";
    case "no_marketing_consent":
    case "not_opted_in":
      return "no_yes";
    default: {
      const unreachable = reason;
      return unreachable;
    }
  }
}
export function saidYesTo(r, purpose, channel, about) {
  return mayMessageFor(bearingOf(r.consent), purpose, { proactive: true, channel, about }).ok;
}
