import { MEDIA_LABEL, mediaKind } from "./message-media.js";
import { splitQuotedReply } from "./message-email.js";
import { isChatMessage, writtenChannelOf } from "./thread-channel.js";
const EMAIL_DELIVERED = "Reached their mail server";
export function messageStatusLabel(status, channel) {
  switch (status) {
    case "queued":
      return "Sending\u2026";
    case "failed":
      return "Didn't send";
    case "canceled":
      return "Canceled before sending";
    case "read":
      return "Read";
    case "delivered":
      return channel === "email" ? EMAIL_DELIVERED : "Delivered";
    default:
      return void 0;
  }
}
const WHATSAPP_FAILURES = {
  130429: "Your number has reached WhatsApp's message limit for now",
  131026: "WhatsApp couldn't deliver it: their number may not be on WhatsApp, or they haven't accepted its latest terms or updated the app",
  131031: "Your WhatsApp Business account is restricted or disabled, or WhatsApp couldn't verify its details",
  131042: "WhatsApp reports a problem with your payment method",
  131047: "WhatsApp wouldn't send it: more than 24 hours have passed since they last replied, so only a template message can reach them now",
  131048: "WhatsApp is limiting how many messages your number can send, because earlier ones were blocked or flagged as spam",
  131049: "WhatsApp held it back: Meta limits marketing messages to each person, and isn't delivering marketing messages to US numbers at all for now",
  131050: "They've chosen to stop receiving marketing messages from your business on WhatsApp",
  131053: "WhatsApp couldn't upload the attachment, for a reason such as a file type it doesn't support",
  131056: "Your number sent them too many messages in a short while, and WhatsApp asks you to wait before sending more to them",
  132e3: "The template's variable values didn't match the ones it defines",
  132001: "That template doesn't exist in this language, or hasn't been approved",
  132012: "The template's variable values were formatted wrongly",
  132015: "That template is paused because of its low quality",
  132016: "That template was permanently disabled for low quality"
};
const SMS_FAILURES = {
  21211: "That isn't a valid phone number",
  21408: "Texts to that region are turned off for your account",
  21610: "They've opted out of texts from your number",
  21614: "That number isn't a valid mobile number",
  30003: "Their phone couldn't be reached: it may be off, out of signal, or unable to receive texts",
  30004: "The text was blocked from reaching this number",
  30005: "The carrier says this number is unknown and may no longer exist",
  30006: "This number can't receive texts, which is typical of a landline",
  30007: "The text was filtered as a possible policy violation",
  30008: "The carrier gave no reason for not delivering it",
  30034: "Your texting line isn't registered with the carriers yet, so they blocked it"
};
const SMS_STATUS_WORDS = {
  undelivered: "The carrier didn't deliver it.",
  failed: "The text couldn't be sent.",
  canceled: "The text was canceled before it left."
};
const EMAIL_FAILURES = {
  bounced: "The email bounced: their address didn't accept it.",
  failed: "The mail provider couldn't send it.",
  suppressed: "The mail provider has stopped sending to this address after an earlier bounce or complaint."
};
const SETTLED_FAILURES = {
  never_delivered: "It was never sent: the job that would have sent it never ran.",
  run_interrupted: "It may not have gone: the run that was sending it did not finish.",
  orphaned: "It was never sent: no job was left to send it."
};
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;
function tableWord(table, key) {
  return Object.hasOwn(table, key) ? table[key] : void 0;
}
function codeOf(v) {
  if (typeof v === "number") return Number.isInteger(v) && v > 0 ? v : null;
  return typeof v === "string" && /^\d{3,6}$/.test(v.trim()) ? Number(v.trim()) : null;
}
export function providerCodeOf(error) {
  const listed = Array.isArray(error.errors) ? record(error.errors[0]) : null;
  const direct = codeOf(listed?.code) ?? codeOf(error.code);
  if (direct !== null) return direct;
  const body = error.body;
  if (typeof body === "string") {
    const graph = /"code"\s*:\s*(\d{3,6})/.exec(body);
    if (graph) return Number(graph[1]);
    const twilio = /^Twilio (\d{5})$/.exec(body.trim());
    return twilio ? Number(twilio[1]) : null;
  }
  return codeOf(record(record(body)?.error)?.code);
}
export function sendFailureWords(error, channel) {
  const e = record(error);
  if (!e) return null;
  const wire = writtenChannelOf(channel);
  if (wire === "email") {
    const provider = typeof e.provider === "string" ? e.provider : "";
    return tableWord(EMAIL_FAILURES, provider) ?? settledWords(e);
  }
  const code = providerCodeOf(e);
  const sms = wire === "sms";
  if (code !== null) {
    const meaning = tableWord(sms ? SMS_FAILURES : WHATSAPP_FAILURES, code);
    if (meaning) return `${meaning} (${sms ? "Twilio" : "WhatsApp"} error ${code}).`;
    return sms ? `Twilio didn't deliver it (error ${code}).` : `WhatsApp didn't deliver it (error ${code}).`;
  }
  const carrier = typeof e.carrier === "string" ? tableWord(SMS_STATUS_WORDS, e.carrier) : void 0;
  return carrier ?? settledWords(e);
}
const OUTCOME_UNKNOWN_KIND = "outcome_unknown";
export function failureWordsOf(channel, key) {
  if (key.code !== null) return sendFailureWords({ code: key.code }, channel);
  if (key.kind === null) return null;
  if (key.kind === OUTCOME_UNKNOWN_KIND) return sendFailureWords({ outcome: "unknown" }, channel);
  const wire = writtenChannelOf(channel);
  const own = wire === "email" ? { provider: key.kind } : wire === "sms" ? { carrier: key.kind } : {};
  return sendFailureWords({ ...own, reason: key.kind }, channel);
}
function messageFailedWhy(m) {
  return m.status === "failed" ? sendFailureWords(m.error, m.channel) : null;
}
export function sentFactsOf(m) {
  const statusLabel = messageStatusLabel(m.status, m.channel);
  const failedWhy = messageFailedWhy(m);
  return {
    ...statusLabel ? { statusLabel } : {},
    ...failedWhy ? { failedWhy } : {},
    reachedCustomer: reachedCustomer(m.status)
  };
}
function settledWords(e) {
  const settled = typeof e.reason === "string" ? tableWord(SETTLED_FAILURES, e.reason) : void 0;
  if (settled) return settled;
  return e.outcome === "unknown" ? "The provider didn't answer in time, so it may have gone: check the thread before sending it again." : null;
}
export function reachedCustomer(status) {
  return status !== "queued" && status !== "failed" && status !== "canceled";
}
export function lastExchanged(messages) {
  return [...messages].reverse().find((m) => isChatMessage(m) && (m.direction === "inbound" || reachedCustomer(m.status))) ?? null;
}
const CALL_NOTE_PREFIX = /^\[voice call note [^\]]*\]\s*(Caller phoned the (?:salon|business) line\.\s*)?(Summary:\s*)?/;
export function isHeldDraft(m) {
  return m.status === "queued" && m.sender === "ai";
}
export function heldDraftOf(messages) {
  return [...messages].reverse().find(isHeldDraft) ?? null;
}
export function draftSendsAtMs(m) {
  const delay = typeof m.meta?.delay_ms === "number" ? m.meta.delay_ms : 0;
  return new Date(m.created_at).getTime() + delay;
}
export function messageWords(m) {
  return m.channel === "email" ? splitQuotedReply(messageText(m)).text : messageText(m);
}
export function messageText(m) {
  if (m.type === "call_summary" && m.body) {
    return m.body.replace(CALL_NOTE_PREFIX, "").trim();
  }
  if (m.body) return m.body;
  if (m.type === "media") {
    const label = MEDIA_LABEL[mediaKind(m.media?.mime_type, m.meta && m.meta.raw_type || null)];
    const caption = m.media?.caption?.trim();
    return caption ? `${label}: ${caption}` : label;
  }
  return `[${m.type}]`;
}
export { clipAtWord } from "../shared/words.js";
