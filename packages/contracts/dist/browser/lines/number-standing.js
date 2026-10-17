import { dailyLimit, numberHealth } from "../broadcasts/broadcast-number.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { MIN_MS } from "../shared/time.js";
import { addPaymentMethodLink } from "./whatsapp-cost.js";
const NEW_BUSINESS_LIMIT = 250;
const STANDING_STALE_MS = 10 * MIN_MS;
const heldObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;
const listOf = (v) => Array.isArray(v) ? v : [];
const textOrNull = (v) => typeof v === "string" && v.trim() ? v.trim() : null;
export function standingFromConfig(value) {
  const s = heldObject(value);
  const canSend = textOrNull(s?.can_send);
  if (!s || !canSend) return null;
  const problems = listOf(s.problems).flatMap((p) => {
    const r = heldObject(p);
    const said = textOrNull(r?.said);
    if (!r || !said) return [];
    return [
      {
        entity: textOrNull(r.entity) ?? "UNKNOWN",
        code: typeof r.code === "number" ? r.code : null,
        said,
        fix: textOrNull(r.fix)
      }
    ];
  });
  const notes = listOf(s.notes).flatMap((n) => {
    const text = textOrNull(n);
    return text ? [text] : [];
  });
  return {
    can_send: canSend,
    problems,
    notes,
    name: textOrNull(s.name),
    name_status: textOrNull(s.name_status),
    verification: textOrNull(s.verification),
    limit: textOrNull(s.limit),
    has_payment_method: typeof s.has_payment_method === "boolean" ? s.has_payment_method : null,
    owner_business_id: textOrNull(s.owner_business_id),
    waba_id: textOrNull(s.waba_id)
  };
}
export function standingNeedsRead(n, nowMs) {
  if (!n.standing) return true;
  if (n.standing.can_send === "AVAILABLE" && n.standing.has_payment_method !== false) return false;
  const readAt = n.standingReadAt ? Date.parse(n.standingReadAt) : Number.NaN;
  return Number.isNaN(readAt) || nowMs - readAt > STANDING_STALE_MS;
}
const withStop = (text) => {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};
const problemWords = (p) => p.fix ? `${withStop(p.said)} ${withStop(p.fix)}` : withStop(p.said);
const BLOCKED_SENTENCE = "Meta says WhatsApp cannot send from this number right now.";
const CALLING_PROBLEM = /\bSIP\b|\bcalling\b/i;
const messagingProblems = (s) => s.problems.filter((p) => !CALLING_PROBLEM.test(p.said) && !(p.fix !== null && CALLING_PROBLEM.test(p.fix)));
const PAYMENT_PROBLEM = /\bpayment\b/i;
function paymentTrouble(s) {
  if (s.has_payment_method === false) return "missing";
  return messagingProblems(s).some((p) => PAYMENT_PROBLEM.test(p.said)) ? "failing" : null;
}
const META_ID = /^\d+$/;
function securityCenterLink(ownerBusinessId) {
  return ownerBusinessId && META_ID.test(ownerBusinessId) ? `https://business.facebook.com/settings/security?business_id=${ownerBusinessId}` : "https://business.facebook.com/settings/security";
}
function whatsappManagerLink(ownerBusinessId, wabaId) {
  return ownerBusinessId && wabaId && META_ID.test(ownerBusinessId) && META_ID.test(wabaId) ? `https://business.facebook.com/wa/manage/phone-numbers/?business_id=${ownerBusinessId}&waba_id=${wabaId}` : "https://business.facebook.com/wa/manage/";
}
const PAYMENT_SENTENCE = {
  missing: "Meta needs a payment method on your WhatsApp account before it delivers reminders and campaigns.",
  failing: "Meta reports a problem with the payment method on your WhatsApp account: reminders and campaigns are not delivered until it is fixed."
};
const REPLIES_STILL_GO = "Replies to customers who write first still go out.";
const ADD_ONE_IN_SUITE = "Add one in Meta Business Suite \u203A Billing.";
const PAYMENT_ACT = { missing: "Add a card", failing: "Fix the card" };
export const PAYMENT_HOLD_WORD = "Payment needed";
export function standingRow(s) {
  const payment = paymentTrouble(s);
  if (payment) {
    const href = addPaymentMethodLink(s.owner_business_id, s.waba_id);
    const words = [
      PAYMENT_SENTENCE[payment],
      ...s.can_send === "BLOCKED" ? [] : [REPLIES_STILL_GO],
      ...href ? [] : [ADD_ONE_IN_SUITE]
    ];
    return {
      stateWords: PAYMENT_HOLD_WORD,
      sentence: words.join(" "),
      act: href ? { label: PAYMENT_ACT[payment], href } : null
    };
  }
  if (s.can_send !== "BLOCKED") return null;
  const first = messagingProblems(s).at(0);
  return {
    stateWords: "Needs attention",
    sentence: first ? `Meta has stopped this number from sending: ${withStop(first.said)}` : BLOCKED_SENTENCE,
    act: { label: "Open WhatsApp Manager", href: whatsappManagerLink(s.owner_business_id, s.waba_id) }
  };
}
const displayNameWords = (name) => name ? `the display name \u201C${name}\u201D` : "your display name";
function nameWords(status, name) {
  const who = displayNameWords(name);
  switch (status) {
    case "DECLINED":
      return `Meta declined ${who} \u2014 change it in WhatsApp Manager.`;
    case "EXPIRED":
      return `The request for ${who} expired \u2014 submit it again in WhatsApp Manager.`;
    default:
      return null;
  }
}
const NAME_DECISIONS = {
  APPROVED: "APPROVED",
  REJECTED: "DECLINED",
  DECLINED: "DECLINED",
  PENDING: "PENDING_REVIEW",
  DEFERRED: "PENDING_REVIEW"
};
const nameStatusOf = (decision) => typeof decision === "string" && Object.hasOwn(NAME_DECISIONS, decision) ? NAME_DECISIONS[decision] ?? null : null;
export function standingAfterNameDecision(s, decision, requestedName) {
  const status = nameStatusOf(decision);
  if (!status) return null;
  return { ...s, name: textOrNull(requestedName) ?? s.name, name_status: status };
}
export function nameDecisionWords(decision, requestedName, reason) {
  const status = nameStatusOf(decision);
  const name = textOrNull(requestedName);
  if (status === "APPROVED")
    return {
      subject: "WhatsApp display name approved",
      body: `Meta approved ${displayNameWords(name)}.`,
      alert: false
    };
  const declined = status === "DECLINED" ? nameWords(status, name) : null;
  if (!declined) return null;
  const why = textOrNull(reason);
  const said = why && why !== "UNKNOWN" && why !== "NONE" ? ` Meta's reason: ${why.toLowerCase().replace(/_/g, " ")}.` : "";
  return { subject: "WhatsApp display name declined", body: `${declined}${said}`, alert: true };
}
const peopleADay = (n) => `up to ${n.toLocaleString("en-US")} people a day`;
function verificationNote(s, limitSaid) {
  if (s.verification === null) return null;
  const word = s.verification.toLowerCase();
  if (word === "verified") return null;
  const tier = dailyLimit(s.limit);
  const cap = tier === null || tier === Number.POSITIVE_INFINITY ? NEW_BUSINESS_LIMIT : tier;
  const capWords = limitSaid ? "" : `, and you can start conversations with ${peopleADay(cap)}`;
  const link = { label: "Verify in Meta", href: securityCenterLink(s.owner_business_id) };
  return word.startsWith("pending") ? {
    text: `Meta is reviewing your business's verification: until then customers see your number instead of your name${capWords}.`,
    link: { ...link, label: "See it in Meta" }
  } : {
    text: `Not verified with Meta: customers see your number instead of your name${capWords}. Verify when you need more.`,
    link
  };
}
export function standingNotes(s, o) {
  if (!s) return [];
  const out = [];
  const name = nameWords(s.name_status, s.name);
  if (name) out.push({ text: name, live: true });
  const verification = verificationNote(s, o.limitSaid);
  if (verification) out.push(verification);
  return out;
}
export function standingAlertWords(number, s) {
  const which = formatPhoneDisplay(number) ?? "your number";
  const payment = paymentTrouble(s);
  if (payment) {
    const where = payment === "missing" ? ADD_ONE_IN_SUITE : "Fix it in Meta Business Suite \u203A Billing.";
    return {
      subject: "WhatsApp can't start conversations from your number",
      body: `WhatsApp can't start conversations from ${which}: ${PAYMENT_SENTENCE[payment]} ${where}`
    };
  }
  const first = messagingProblems(s).at(0);
  const body = first ? `WhatsApp can't send from ${which}: ${problemWords(first)}` : `WhatsApp can't send from ${which}. Meta did not say why; open Connections to read what it holds.`;
  return { subject: "WhatsApp can't send from your number", body };
}
export function numberHealthWithStanding(health, standing) {
  const row = standing ? standingRow(standing) : null;
  return row ? { ...health, canSend: false, tone: "danger", refusal: row.sentence } : health;
}
export function numberHealthOfConfig(config) {
  const s = (key) => {
    const value = config[key];
    return typeof value === "string" ? value : null;
  };
  const health = numberHealth({ quality: s("quality_rating"), event: s("quality_event"), limit: s("messaging_limit") });
  return numberHealthWithStanding(health, standingFromConfig(config.standing));
}
const CAN_SEND_WORDS = {
  AVAILABLE: "can send",
  LIMITED: "limited",
  BLOCKED: "blocked"
};
const sendWords = (w) => {
  if (typeof w !== "string" || !w) return null;
  return Object.hasOwn(CAN_SEND_WORDS, w) ? CAN_SEND_WORDS[w] ?? null : w.toLowerCase().replace(/_/g, " ");
};
export function standingChangeWords(p) {
  const to = sendWords(p.to);
  const from = sendWords(p.from);
  if (!to) return null;
  return from ? `from ${from} to ${to}` : to;
}
