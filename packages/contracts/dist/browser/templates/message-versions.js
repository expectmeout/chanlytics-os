import { senderWords } from "./sender-words.js";
import { fillSlots, numberedSlots, slotOutside, slotsOut, slotsWritten } from "./slot-sets.js";
export const VERSION_CHANNELS = ["whatsapp", "email", "sms"];
export const OWN_VERSION_CHANNELS = ["email", "sms"];
export const VERSION_CHANNEL_WORDS = {
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "Text"
};
export function versionWord(channel) {
  return channel === "whatsapp" ? VERSION_CHANNEL_WORDS.whatsapp : VERSION_CHANNEL_WORDS[channel].toLowerCase();
}
export function noVersionWords(channel) {
  return channel === "whatsapp" ? "This message has no WhatsApp version." : `This message has no ${versionWord(channel)} version yet.`;
}
export const EMAIL_SUBJECT_MAX = 60;
export const EMAIL_BODY_MAX = 2e3;
export const SMS_SEGMENTS_MAX = 4;
const SMS_SEGMENTS_WARN = 2;
export function smsStopLine(language) {
  return senderWords(language).textStop;
}
const GSM7 = /^[@£$¥èéùìòÇ\nØø\r\fÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;
const GSM7_EXTENSION = /^[\f^{}\\[~\]|€]$/;
function gsm7Segments(text) {
  const costs = [...text].map((c) => GSM7_EXTENSION.test(c) ? 2 : 1);
  const septets = costs.reduce((sum, n) => sum + n, 0);
  if (septets <= 160) return { septets, segments: septets === 0 ? 0 : 1 };
  let segments = 1;
  let room = 153;
  for (const n of costs) {
    if (n > room) {
      segments += 1;
      room = 153;
    }
    room -= n;
  }
  return { septets, segments };
}
export function smsSegments(text) {
  const unicode = !GSM7.test(text);
  if (!unicode) {
    const { septets, segments: segments2 } = gsm7Segments(text);
    return { segments: segments2, chars: septets, perSegment: segments2 > 1 ? 153 : 160, unicode };
  }
  const chars = [...text].length;
  const segments = chars === 0 ? 0 : chars <= 70 ? 1 : Math.ceil(chars / 67);
  return { segments, chars, perSegment: segments > 1 ? 67 : 70, unicode };
}
export function smsVersionSegments(body, language) {
  const slotsPlain = body.replace(/\{\{\d+\}\}/g, (slot) => "x".repeat(slot.length));
  return smsSegments(`${slotsPlain}
${smsStopLine(language)}`);
}
function clean(s) {
  return (typeof s === "string" ? s : "").replace(/\r\n/g, "\n").trim();
}
function numberedRefusal(extra, slots) {
  return slots === 0 ? `This message fills no values, so {{${extra}}} has nothing to take.` : `{{${extra}}} is not one of this message's values: it has ${slots === 1 ? "{{1}}" : `{{1}} to {{${slots}}}`}.`;
}
export function versionSlotsRefusal(text, slots) {
  const extra = slotOutside(numberedSlots(slots), text);
  return extra === null ? null : numberedRefusal(extra, slots);
}
export function emailIssues(w, rules) {
  const out = [];
  const at = (field, problem, slot) => out.push(slot === void 0 ? { field, problem } : { field, problem, slot });
  const subject = rules.subject ? w.subject ?? "" : null;
  if (subject !== null) {
    if (!subject) at("subject", "subject_missing");
    else if (subject.length > rules.subjectMax) at("subject", "subject_too_long");
    if (subject) for (const p of rules.subjectAlso?.(subject) ?? []) at("subject", p);
  }
  if (!w.body) at("body", "body_missing");
  else if (w.body.length > rules.bodyMax) at("body", "body_too_long");
  for (const [field, text] of [
    ["subject", subject],
    ["body", w.body]
  ]) {
    if (!text) continue;
    const written = slotsWritten(rules.slots, text);
    for (const key of written.keys) if (!rules.slots.keys.includes(key)) at(field, "unknown_slot", key);
    if (written.stray) at(field, "stray_brace");
  }
  if (w.body) for (const p of rules.bodyAlso?.(w.body) ?? []) at("body", p);
  return out;
}
function campaignSay(slots) {
  return (i) => {
    switch (i.problem) {
      case "subject_missing":
        return "Give the email a subject.";
      case "subject_too_long":
        return `The subject must be under ${EMAIL_SUBJECT_MAX} characters.`;
      case "body_missing":
        return "Write the email.";
      case "body_too_long":
        return `The email must be under ${EMAIL_BODY_MAX} characters.`;
      case "unknown_slot":
        return numberedRefusal(i.slot ?? "", slots);
      case "stray_brace":
        return "Braces are for values only, two on each side.";
    }
  };
}
export function campaignEmailRules(slots) {
  const set = typeof slots === "number" ? numberedSlots(slots) : slots;
  return {
    slots: set,
    subject: true,
    subjectMax: EMAIL_SUBJECT_MAX,
    bodyMax: EMAIL_BODY_MAX,
    say: campaignSay(set.keys.length),
    foot: "The footer is added when it goes, and an offer also gets its unsubscribe link."
  };
}
function checkEmail(d, rules) {
  const subject = rules.subject ? clean(d.subject).replace(/\s+/g, " ") : null;
  const body = clean(d.body);
  const first = emailIssues({ subject, body }, rules)[0];
  if (first) return { ok: false, error: rules.say(first) };
  const warnings = [];
  if (subject && slotsOut(rules.slots, subject).trim() === "")
    warnings.push("A subject that is only a value reads as empty to anyone it misses.");
  if (/\n{3,}/.test(body)) warnings.push("More than one blank line in a row reads as a gap in most inboxes.");
  return { ok: true, value: { subject, body }, warnings };
}
export function validateEmailVersion(d, rules) {
  return typeof rules === "number" ? checkEmail(d, campaignEmailRules(rules)) : checkEmail(d, rules);
}
export function validateSmsVersion(d, slots, language) {
  const body = clean(d.body);
  if (!body) return { ok: false, error: "Write the text." };
  const refusal = versionSlotsRefusal(body, slots);
  if (refusal) return { ok: false, error: refusal };
  const sent = smsVersionSegments(body, language);
  if (sent.segments > SMS_SEGMENTS_MAX)
    return {
      ok: false,
      error: `With the STOP line this text takes ${sent.segments} parts; keep it to ${SMS_SEGMENTS_MAX}.`
    };
  const warnings = [];
  if (sent.segments > SMS_SEGMENTS_WARN)
    warnings.push(`With the STOP line this text goes as ${sent.segments} parts, and each part is billed.`);
  return { ok: true, value: { subject: null, body }, warnings };
}
export function validateOwnVersion(channel, d, slots, language) {
  return channel === "email" ? validateEmailVersion(d, slots) : validateSmsVersion(d, slots, language);
}
export function versionComponents(channel, w) {
  const body = { type: "BODY", text: w.body };
  return channel === "email" && w.subject ? [{ type: "HEADER", format: "TEXT", text: w.subject }, body] : [body];
}
function partText(components, type) {
  if (!Array.isArray(components)) return null;
  const part = components.find((c) => {
    const kind = !!c && typeof c === "object" ? c.type : null;
    return typeof kind === "string" && kind.toUpperCase() === type;
  });
  return typeof part?.text === "string" && part.text.trim() ? part.text : null;
}
export function versionWords(row) {
  return {
    subject: row.channel === "email" ? partText(row.components, "HEADER") ?? row.header ?? null : null,
    body: partText(row.components, "BODY") ?? row.body_preview ?? ""
  };
}
export function renderOwnVersion(channel, w, values, language, set) {
  const body = fillSlots(w.body, values, set);
  return {
    subject: channel === "email" && w.subject ? fillSlots(w.subject, values, set) : null,
    body: channel === "sms" ? `${body}
${smsStopLine(language)}` : body
  };
}
const REACH_OUT_PREFIX = "reach_out_";
export function isReachOutRow(row) {
  return row.name.startsWith(REACH_OUT_PREFIX);
}
export function reachOutRowName(stepId) {
  return `${REACH_OUT_PREFIX}${stepId.replace(/-/g, "")}`;
}
export function reachOutStepOf(name) {
  const hex = name.startsWith(REACH_OUT_PREFIX) ? name.slice(REACH_OUT_PREFIX.length) : "";
  const parts = /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/.exec(hex);
  return parts ? parts.slice(1).join("-") : null;
}
export function versionsOf(rows, name) {
  const out = { whatsapp: [], email: [], sms: [] };
  for (const r of rows) {
    if (r.name !== name || isReachOutRow(r)) continue;
    if (VERSION_CHANNELS.includes(r.channel)) out[r.channel].push(r);
  }
  return out;
}
export const LIVE_VERSION_STATES = /* @__PURE__ */ new Set(["approved", "pending"]);
const valuesHeld = (w) => [...`${w.subject ?? ""} ${w.body}`.matchAll(/\{\{[^{}]+\}\}/g)].map((m) => m[0]).sort();
export function keepsValues(before, after) {
  const a = valuesHeld(before);
  const b = valuesHeld(after);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
