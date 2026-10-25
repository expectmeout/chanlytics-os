import { normalizePhone } from "../shared/phone.js";
import { MIN_MS } from "../shared/time.js";
export const CARRIERS = ["verizon", "att", "tmobile", "other", "office"];
export const FORWARDING_MODES = ["unanswered", "always"];
export const CARRIER_WORDS = {
  verizon: "Verizon",
  att: "AT&T",
  tmobile: "T-Mobile",
  other: "Another carrier or a landline",
  office: "An office phone system"
};
export const FORWARDING_MODE_WORDS = {
  unanswered: "Only calls you don't answer",
  always: "Every call"
};
export const FORWARDING_TEST_WINDOW_MS = 30 * MIN_MS;
export function telHref(code2) {
  return `tel:${code2.replace(/\+/g, "%2B").replace(/#/g, "%23")}`;
}
function national(e164) {
  const d = e164.replace(/[^\d]/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}
const code = (c) => ({ code: c, tel: telHref(c) });
const UNANSWERED_NOTE = "Your phone rings first. After your carrier's timer, usually 15 to 30 seconds, the call comes to the receptionist. If voicemail picks up first, calls never arrive: ask your carrier to lengthen the ring time, or forward every call.";
const DIAL_NOTE = "Dial it on the phone that has the number you keep, wait for the tone or the message, then hang up.";
const OFFICE_NOTE = "An office phone system takes no code: in its settings, under forwarding or what happens when no one answers, forward the calls to the number above.";
const OFFICE_VOICEMAIL_NOTE = "If the system sends unanswered calls to voicemail, the forwarding has to come before it, or calls never reach the receptionist. Its support can set it for you.";
export function forwardingDialLabel(carrier, kept) {
  return carrier === "office" ? `In the phone system for ${kept}, forward the calls to` : `Dial on the phone with ${kept}`;
}
export function forwardingCodes(carrier, mode, destinationE164) {
  const n10 = national(destinationE164);
  const full = normalizePhone(destinationE164) ?? destinationE164;
  const conditional = mode === "unanswered";
  switch (carrier) {
    // No code: the receptionist's number, set in the system's own settings, and taken out there to switch it off.
    case "office":
      return {
        on: code(full),
        off: code(""),
        notes: [OFFICE_NOTE, ...conditional ? [OFFICE_VOICEMAIL_NOTE] : []]
      };
    case "verizon":
      return {
        on: code(conditional ? `*71${n10}` : `*72${n10}`),
        off: code("*73"),
        notes: [DIAL_NOTE, ...conditional ? [UNANSWERED_NOTE] : [], "Verizon forwards calls only, never texts."]
      };
    case "att":
      return {
        on: code(conditional ? `*61*${n10}#` : `*21*${n10}#`),
        off: code(conditional ? "#61#" : "#21#"),
        notes: [
          DIAL_NOTE,
          ...conditional ? [
            UNANSWERED_NOTE,
            `Busy too: dial *67*${n10}#. If AT&T refuses these codes, dial *92 then the number for no answer and *90 then the number for busy, or ask AT&T for your plan's codes.`
          ] : []
        ]
      };
    case "tmobile":
      return {
        on: code(conditional ? `**004*${full}#` : `**21*${full}#`),
        off: code(conditional ? "##004#" : "##21#"),
        notes: [DIAL_NOTE, ...conditional ? [UNANSWERED_NOTE] : [], "T-Mobile takes the number with +1 in front."]
      };
    default:
      return {
        on: code(conditional ? `*92${n10}` : `*72${n10}`),
        off: code(conditional ? "*93" : "*73"),
        notes: [
          DIAL_NOTE,
          ...conditional ? [UNANSWERED_NOTE] : [],
          "Codes vary by carrier. If these are refused, ask your carrier for its call-forwarding codes: most landlines use *72 for every call and *92 or *71 for calls you don't answer."
        ]
      };
  }
}
export const isCarrier = (v) => typeof v === "string" && CARRIERS.includes(v);
export const isForwardingMode = (v) => typeof v === "string" && FORWARDING_MODES.includes(v);
export function forwardingMatch(facts, call, nowMs = Date.now()) {
  const started = call.startedAtIso ? Date.parse(call.startedAtIso) : nowMs;
  const from = typeof facts.test_started_at === "string" ? Date.parse(facts.test_started_at) : NaN;
  const until = typeof facts.test_until === "string" ? Date.parse(facts.test_until) : NaN;
  if (Number.isNaN(started) || Number.isNaN(from) || Number.isNaN(until)) return false;
  if (started < from - MIN_MS || started > until) return false;
  const dest = typeof facts.destination_e164 === "string" ? normalizePhone(facts.destination_e164) : null;
  if (dest && call.toE164 && normalizePhone(call.toE164) !== dest) return false;
  return true;
}
export function divertedNumbers(headers) {
  if (!headers || typeof headers !== "object") return null;
  const values = ["diversion", "history-info"].map((k) => headers[k]).filter((v) => typeof v === "string" && v.trim() !== "");
  if (!values.length) return null;
  const out = [];
  for (const v of values)
    for (const m of v.matchAll(/(?:sips?|tel):(\+?\d{7,15})/gi)) {
      const n = normalizePhone(m[1]);
      if (n && !out.includes(n)) out.push(n);
    }
  return out;
}
export function forwardingProof(keptE164, diverted) {
  if (diverted === null) return "unseen";
  const kept = keptE164 ? normalizePhone(keptE164) : null;
  return kept && diverted.includes(kept) ? "carrier" : "not_shown";
}
export function forwardingTestOpen(facts, nowMs = Date.now()) {
  const until = typeof facts.test_until === "string" ? Date.parse(facts.test_until) : NaN;
  return !Number.isNaN(until) && until > nowMs;
}
export const PHONE_WAYS = ["keep", "new", "move"];
export const PHONE_RINGS = ["mobile", "landline", "office"];
export function forwardingCarrierOf(rings, company) {
  if (rings === "office") return "office";
  if (rings === "landline") return "other";
  if (rings === "mobile") return company ?? null;
  return null;
}
