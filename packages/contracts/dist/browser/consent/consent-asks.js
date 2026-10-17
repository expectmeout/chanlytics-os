import { mayMessageFor } from "./consent.js";
import { CONSENT_CHANNELS, channelsWords } from "./consent-channels.js";
const UNASKED = {
  consent: "unknown",
  dnc: false,
  marketing_consent: "unknown",
  email_marketing: "unknown",
  has_relationship: false
};
const DEALT = { ...UNASKED, has_relationship: true };
export function yesAsked(channel, purpose, about) {
  const may = (c) => mayMessageFor(c, purpose, { proactive: true, channel, about }).ok;
  if (may(UNASKED)) return "none";
  return may(DEALT) ? "yes_or_dealt" : "yes";
}
const WAY_TO_REACH = {
  whatsapp: { noun: "a phone number", has: "has a phone number" },
  sms: { noun: "a phone number", has: "has a phone number" },
  email: { noun: "an email address that works", has: "has an email address that works" }
};
function yesTo(channel, purpose) {
  const by = channel === "email" ? " by email" : "";
  return purpose === "marketing" ? `offers${by}` : `hearing from you${by}`;
}
function needs(channel, purpose, about) {
  const ask = yesAsked(channel, purpose, about);
  const way = WAY_TO_REACH[channel].noun;
  const to = yesTo(channel, purpose);
  if (ask === "yes") return `a recorded yes to ${to} and ${way}`;
  if (ask === "yes_or_dealt") return `a yes to ${to} or a relationship with you on record, and ${way}`;
  return way;
}
function clause(channel, purpose, about) {
  const ask = yesAsked(channel, purpose, about);
  const to = yesTo(channel, purpose);
  if (ask === "yes") return `said yes to ${to}`;
  if (ask === "yes_or_dealt")
    return purpose === "marketing" ? `asked for ${to}, or has dealt with you` : `said yes to ${to}, or has dealt with you`;
  return WAY_TO_REACH[channel].has;
}
function groupedBy(channels, words) {
  const groups = [];
  for (const channel of CONSENT_CHANNELS.filter((c) => channels.includes(c))) {
    const said = words(channel);
    const same = groups.find((g) => g.words === said);
    if (same) same.channels.push(channel);
    else groups.push({ channels: [channel], words: said });
  }
  return groups;
}
const capitalised = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function consentGuardWords(channels, purpose, about) {
  const groups = groupedBy(channels, (c) => needs(c, purpose, about));
  return groups.map(
    (g) => groups.length === 1 ? `Only people with ${g.words}.` : `${capitalised(channelsWords(g.channels))}: only people with ${g.words}.`
  );
}
export function consentRuleWords(byChannel, purpose, about) {
  const reached = byChannel ? CONSENT_CHANNELS.filter((c) => byChannel[c] > 0) : [];
  const groups = groupedBy(reached.length > 0 ? reached : ["whatsapp"], (c) => clause(c, purpose, about));
  return groups.map(
    (g) => groups.length === 1 ? `each ${g.words}` : `each reached ${channelsWords(g.channels)} ${g.words}`
  );
}
