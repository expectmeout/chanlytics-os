import { CONSENT_CHANNELS, CONSENT_CHANNEL_WORDS } from "../consent/consent-channels.js";
import { emailFoot } from "../templates/email-foot.js";
import {
  OWN_VERSION_CHANNELS,
  noVersionWords,
  renderOwnVersion,
  smsStopLine,
  versionWords
} from "../templates/message-versions.js";
import { OFFERS_BY_EMAIL_WORDS } from "./email-offers.js";
export const PREVIEW_WORDS = {
  /** The quiet link on the To line that opens who is held back and why. */
  heldBack: "Who's held back",
  /** A stand-in on a playbook's walk: how many people the run reaches on a channel. */
  people: (n) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`,
  /** What a held-back person's stand-in says of itself: they are drawn the message's words, and nothing goes to them. */
  notSent: "Not sent",
  /** Where an offer's foot puts the link, which is each person's own: the preview cannot make it. */
  unsubscribeLink: "(their own unsubscribe link)",
  /** The line under the business's name in the frame, as each channel's own app says it. */
  kind: { whatsapp: "Business account", sms: "Text message", email: "Email" },
  /** The two presses of the preview's stepper, to a screen reader: through the people a send reaches, or the channels a playbook does. */
  walk: {
    people: { before: "The person before this one", next: "The next person" },
    channels: { before: "The channel before this one", next: "The next channel" }
  }
};
const capitalised = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const PREVIEW_CHANNEL_WORDS = {
  whatsapp: capitalised(CONSENT_CHANNEL_WORDS.whatsapp),
  sms: capitalised(CONSENT_CHANNEL_WORDS.sms),
  email: capitalised(CONSENT_CHANNEL_WORDS.email)
};
export function previewVersionsOf(rows, name, language) {
  const out = {};
  for (const channel of OWN_VERSION_CHANNELS) {
    const row = rows.find((r) => r.channel === channel && r.name === name && r.language === language);
    if (row) out[channel] = versionWords(row);
  }
  return out;
}
export function previewOn(channel, o) {
  const label = PREVIEW_CHANNEL_WORDS[channel];
  if (channel === "whatsapp") return { channel, label, version: null, foot: null, missing: null };
  const version = o.versions[channel] ?? null;
  if (!version) return { channel, label, version: null, foot: null, missing: noVersionWords(channel) };
  if (channel === "email" && o.offer && !o.address?.trim())
    return { channel, label, version: null, foot: null, missing: OFFERS_BY_EMAIL_WORDS.noAddress };
  const foot = channel === "sms" ? smsStopLine(o.language) : emailFoot(
    o.business,
    o.address,
    o.offer ? { kind: "offer", why: o.offer, unsubscribeUrl: PREVIEW_WORDS.unsubscribeLink } : { kind: "visit", facts: o.facts ?? {} },
    o.language
  );
  return { channel, label, version, foot, missing: null };
}
const SAID_MIN = 60;
export function previewParts(channels, o) {
  const parts = [];
  for (const channel of CONSENT_CHANNELS.filter((c) => channels.includes(c))) {
    const label = PREVIEW_CHANNEL_WORDS[channel];
    if (channel === "whatsapp") {
      parts.push({ channel, label, subject: null, body: o.whatsapp });
      continue;
    }
    const words = o.versions[channel];
    if (!words) return { missing: channel, why: noVersionWords(channel) };
    const sent = renderOwnVersion(channel, words, o.values, o.language);
    parts.push({ channel, label, subject: sent.subject, body: sent.body });
  }
  return { parts };
}
export function previewSays(channels, o) {
  const drawn = previewParts(channels, o);
  if ("missing" in drawn) return drawn;
  const room = Math.max(SAID_MIN, Math.floor(o.limit / Math.max(1, drawn.parts.length)));
  const clip = (words) => {
    const one = words.replace(/\s+/g, " ").trim();
    return one.length > room ? `${one.slice(0, room).trimEnd()}\u2026` : one;
  };
  return {
    says: drawn.parts.map((p) => `${p.label}: ${p.subject ? `\u201C${p.subject}\u201D \u2014 ` : ""}${clip(p.body)}`).join(" \xB7 ")
  };
}
export function reachBarParts(split) {
  return CONSENT_CHANNELS.filter((c) => split.byChannel[c] > 0).map((channel) => ({
    channel,
    share: split.byChannel[channel],
    words: `${split.byChannel[channel].toLocaleString("en-US")} ${CONSENT_CHANNEL_WORDS[channel]}`
  }));
}
export function reachByWords(split) {
  return reachBarParts(split).map((p) => p.words).join(", ");
}
export function reachBarWords(split) {
  const parts = reachBarParts(split);
  const [first] = parts;
  if (!first) return "Reaches nobody";
  if (parts.length === 1) return `Reaches ${first.words}`;
  return `Reaches ${split.reached.toLocaleString("en-US")}: ${parts.map((p) => p.words).join(", ")}`;
}
