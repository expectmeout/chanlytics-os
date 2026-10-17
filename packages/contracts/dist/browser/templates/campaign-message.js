import { CONSENT_CHANNELS } from "../consent/consent-channels.js";
import { purposeOfTemplate } from "../consent/consent.js";
import { TEMPLATE_STATUSES } from "../shared/enums.js";
import { CAMPAIGN_ROOMS } from "../shell/campaign-rooms.js";
import {
  VERSION_CHANNEL_WORDS,
  isReachOutRow,
  noVersionWords,
  versionsOf
} from "./message-versions.js";
import { refusedWords, templateBlocked } from "./template-parts.js";
import { TEMPLATE_STATUS_WORDS } from "./templates.js";
import { templateTitle } from "./template-titles.js";
export function variablesSlotCount(variables) {
  if (!Array.isArray(variables)) return 0;
  const positions = variables.map((v) => Number(v?.position)).filter((position) => Number.isFinite(position));
  return Math.max(variables.length, ...positions);
}
export function metaStatusOf(raw) {
  return TEMPLATE_STATUSES.find((s) => s === raw) ?? "pending";
}
function strictestCategory(categories) {
  if (categories.some((c) => purposeOfTemplate(c) === "marketing")) return "marketing";
  return categories.find((c) => c !== null) ?? null;
}
function whatsappVersionOf(row) {
  const status = metaStatusOf(row.meta_status);
  return {
    id: row.id,
    status,
    hidden: Boolean(row.hidden_at),
    blocked: templateBlocked(row),
    reason: status === "rejected" ? refusedWords(row.rejected_reason) : null
  };
}
function messageFrom(name, language, rows) {
  const {
    whatsapp: [w = null],
    email: [e = null],
    sms: [s = null]
  } = versionsOf(rows, name);
  const anchorRow = w ?? e ?? s;
  if (anchorRow === null) return null;
  const category = w ? w.category ?? null : strictestCategory([e, s].flatMap((r) => r ? [r.category ?? null] : []));
  const versions = {
    whatsapp: w ? whatsappVersionOf(w) : null,
    email: e ? { id: e.id } : null,
    sms: s ? { id: s.id } : null
  };
  const held = messageHolds({ versions });
  const hidden = Boolean(anchorRow.hidden_at);
  const titled = [w, e, s].map((r) => r?.title ?? null).find((t) => t !== null && t.trim() !== "") ?? null;
  return {
    name,
    language,
    title: templateTitle(name, titled),
    anchor: { id: anchorRow.id, channel: w ? "whatsapp" : e ? "email" : "sms" },
    slots: variablesSlotCount((w ?? anchorRow).variables),
    category,
    purpose: purposeOfTemplate(category),
    hidden,
    offered: !hidden && CONSENT_CHANNELS.some((c) => held[c]),
    versions
  };
}
export function campaignMessageOf(rows, name, language) {
  return messageFrom(
    name,
    language,
    rows.filter((r) => r.language === language)
  );
}
export function campaignMessagesOf(rows) {
  const groups = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (isReachOutRow(r)) continue;
    const key = JSON.stringify([r.name, r.language]);
    const group = groups.get(key) ?? { name: r.name, language: r.language, rows: [] };
    group.rows.push(r);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((g) => {
    const message = messageFrom(g.name, g.language, g.rows);
    return message ? [message] : [];
  });
}
export function messageHolds(m) {
  const w = m.versions.whatsapp;
  return {
    whatsapp: w !== null && w.status === "approved" && w.blocked === null,
    email: m.versions.email !== null,
    sms: m.versions.sms !== null
  };
}
const NOT_APPROVED_WORDS = {
  pending: "WhatsApp is still reviewing this message's WhatsApp version.",
  rejected: "WhatsApp refused this message's WhatsApp version.",
  paused: "WhatsApp has paused this message's WhatsApp version.",
  disabled: "WhatsApp has disabled this message's WhatsApp version."
};
export function messageWhyNot(m, channel) {
  if (messageHolds(m)[channel]) return null;
  const w = m.versions.whatsapp;
  if (channel !== "whatsapp" || w === null) return noVersionWords(channel);
  if (w.status !== "approved") return NOT_APPROVED_WORDS[w.status];
  return w.blocked === null ? null : `This message's WhatsApp version has ${w.blocked}, so it cannot be sent from here.`;
}
const HOLDS_NOTHING = { versions: { whatsapp: null, email: null, sms: null } };
export function readyForMessage(ready, message) {
  const out = { ...ready };
  for (const c of CONSENT_CHANNELS) {
    const why = messageWhyNot(message ?? HOLDS_NOTHING, c);
    if (ready[c].ready && why !== null) out[c] = { ...ready[c], ready: false, why };
  }
  return out;
}
const whatsappStandingWord = (status) => TEMPLATE_STATUS_WORDS[status].toLowerCase();
export function messageStandingWords(m) {
  const at = (channel, word) => `${VERSION_CHANNEL_WORDS[channel]} \xB7 ${word}`;
  const w = m?.versions.whatsapp ?? null;
  return {
    whatsapp: at("whatsapp", w ? whatsappStandingWord(w.status) : "not added"),
    email: at("email", m?.versions.email ? "ready" : "not written"),
    sms: at("sms", m?.versions.sms ? "ready" : m?.purpose === "marketing" ? "not for offers" : "not written")
  };
}
export function whatsappStoppedRunWords(m) {
  const why = m === null ? null : messageWhyNot(m, "whatsapp");
  return `${why ?? noVersionWords("whatsapp")} Everyone on this run goes by WhatsApp, so nothing was sent.`;
}
const NO_RUN_VERSION_WORDS = "has no version its runs can send";
export const MESSAGE_GONE_WORDS = {
  card: `Its message ${NO_RUN_VERSION_WORDS}, so they are skipped until it has one again or the campaign sends another.`,
  composer: (title) => `Its message, ${title}, ${NO_RUN_VERSION_WORDS} any more. Pick another to save a change.`
};
export const RUN_NOW_WITHOUT_VERSION_WORDS = "Its message has no WhatsApp version a run can send, and nobody it would reach goes by email or text. Pick another message, or give this one an email or a text version and tick it on the campaign.";
export const STARTER_LINE_WORDS = {
  /** The send screen, with no message it can send yet: how many starters' WhatsApp versions WhatsApp is still reviewing. */
  reviewing: (n) => `Your starter messages' WhatsApp versions are in review (${n}) \u2014 they appear here once approved, usually within minutes.`,
  /** The playbook composer, after the moment's own message and a comma: where its WhatsApp version stands. */
  standing: (status) => {
    const at = metaStatusOf(status);
    return at === "pending" ? "has its WhatsApp version in review \u2014 it appears here once approved, usually within minutes." : `has its WhatsApp version ${whatsappStandingWord(at)} \u2014 see ${CAMPAIGN_ROOMS.home} \u203A ${CAMPAIGN_ROOMS.library}.`;
  },
  /**
   * The link that adds the moment's own message: its email and text versions at once, a WhatsApp version where a number
   * is, which the line says once it is in review (`standing`). The link was the whole of that, in 25 words.
   */
  add: "Add it",
  /** After the moment's own message's name, where it is not added yet: "Win-back, written for you". */
  written: "written for you"
};
const THEIRS_WORDS = "about something they booked, or a proposal of theirs";
export const MESSAGE_BEGIN_WORDS = {
  customIsAnOffer: "A message you write is an offer or news. Only a starter is a reminder, a check after or a follow-up.",
  /**
   * A message written whole (POST templates/message, Ask's message card) takes one about their own booking or proposal,
   * written with a WhatsApp version for WhatsApp to review: never with an email or a text alone, which nobody reviews.
   * Its own sentence, since customIsAnOffer (POST templates/versions's) is not true of this door.
   */
  utilityNeedsWhatsapp: `A message ${THEIRS_WORDS}, needs a WhatsApp version, which WhatsApp reviews.`,
  starterNeedsItsOwnWords: "A starter begins with its own words. Add the starter set, then change the words in Messages.",
  doorNotSwitchedOn: "Writing a message with no WhatsApp version is not switched on here yet.",
  /**
   * A message written whole in a language of a message already on file in another, said as something else (POST
   * templates/message): a language of a message is the same kind of message with the same values, its kind what a send
   * judges it by (consent purposeOfTemplate: a row with no category is an offer), so `purpose` is the held one's.
   */
  heldOtherwise: (purpose, slots) => `This message is on file in another language as ${purpose === "marketing" ? "an offer or news" : `a message ${THEIRS_WORDS},`} with ${slots} value${slots === 1 ? "" : "s"}. Write this language the same way, or give it another name.`,
  /**
   * A name on file in another language as a code for signing in (Meta's `authentication`): no campaign sends one, so no
   * kind of message is written beside it, and "write it the same way" would be no way out.
   */
  heldAuthentication: "This name is on file in another language as a code for signing in, which no campaign sends. Give this message another name."
};
