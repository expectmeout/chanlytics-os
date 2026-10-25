import { lineCredentialFailure } from "../lines/line-failure.js";
import { formatPhoneDisplay, normalizePhone } from "../shared/phone.js";
import {
  CARRIERS,
  PHONE_RINGS,
  PHONE_WAYS
} from "../voice/forwarding.js";
import { agoWords, MIN_MS } from "../shared/time.js";
import { maySpend } from "../workspace/billing.js";
import { SOLE_PROP_LIMITS } from "../lines/registration-path.js";
export const PROVISIONING_DEADLINE_MS = 5 * MIN_MS;
export function lineStuckProvisioning(l, nowMs) {
  if (!l || l.voice_state !== "provisioning") return false;
  const since = Date.parse(l.state_since);
  return Number.isFinite(since) && nowMs - since > PROVISIONING_DEADLINE_MS;
}
export { lineCredentialFailure, LINE_CREDENTIALS_SENTENCE } from "../lines/line-failure.js";
export function lineRetryRefusal(l, nowMs) {
  if (!l) return "no such line";
  if (l.voice_state === "failed" && lineCredentialFailure(l.last_error))
    return "the line's credentials could not be kept \u2014 a retry cannot help until a person at Chanlytics restores them, and we have been told";
  if (l.voice_state === "failed") return null;
  if (lineStuckProvisioning(l, nowMs)) return null;
  return l.voice_state === "provisioning" ? "the line is still setting up \u2014 give it a few minutes, and it is retried automatically after that" : `the line is ${l.voice_state}, not failed`;
}
export const LINE_STEP_WORDS = {
  subaccount: "opening your account with the carrier",
  number: "buying the number",
  trunk: "connecting the number to the receptionist",
  agent: "creating the receptionist",
  import: "handing the number to the receptionist",
  messaging: "setting up texting",
  channel: "recording the line"
};
export const SETUP_STATE_WORDS = {
  not_started: "Not started",
  waiting_you: "Waiting on you",
  waiting_them: "Waiting on us",
  ready: "Ready"
};
export const SOLE_PROP_CEILING_SENTENCE = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;
export const SOLE_PROP_TEXTING_SENTENCE = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE}`;
export const MOCK_TEXTING_SENTENCE = "Texting is filed against a test registry, so nothing is delivered \u2014 a person at Chanlytics is filing it with the carriers for real.";
export const TEXTING_NEEDS_RECORD_SENTENCE = "Texting needs your business on record for the carriers \u2014 two minutes, once.";
export const TEXTING_NEEDS_RECORD_CLAUSE = "Texting needs your business on record for the carriers \u2014 two minutes, once, on Connections.";
export const BROKEN_CONFIG_WORDS = {
  title: "This workspace's settings can't be read",
  body: "Something saved in this workspace's configuration no longer passes the checks the receptionist runs before it answers, so the receptionist is silent and this form is closed \u2014 saving from here would replace what is still there. Chanlytics has to repair it.",
  clause: "Your business settings could not be read, so the receptionist is silent until Chanlytics repairs them. Business lists what is wrong.",
  /** The owner's one move on a configuration only Chanlytics can repair (S8): it said so, with no way to ask. */
  ask: "Ask for a repair",
  /** Once asked: when, and what happens next, on Setup's row and on the pane's card alike. */
  requested: (at, nowMs) => `Requested ${agoWords(Date.parse(at), nowMs)} \u2014 a person at Chanlytics will repair them and reach you by email.`
};
export const SETUP_REQUEST_KINDS = ["line", "port", "repair", "forwarding", "name"];
export function textingWords(l) {
  if (!l) return { sentence: "Texting is not available yet.", done: false };
  if (l.reg_mock) return { sentence: MOCK_TEXTING_SENTENCE, done: false };
  if (l.voice_state === "answering" && (!l.sms_state || l.sms_state === "none"))
    return { sentence: TEXTING_NEEDS_RECORD_CLAUSE, done: false };
  switch (l.sms_state) {
    // Working, and on the narrow registration: the ceiling belongs in the same
    // sentence as the good news, because the moment it bites is a broadcast
    // that trickles out over minutes with no explanation anywhere in the
    // product. `done` stays true -- it IS on, and there is nothing left to do.
    case "active":
      return { sentence: l.reg_sole_prop ? SOLE_PROP_TEXTING_SENTENCE : "Texting is on.", done: true };
    case "approved":
      return { sentence: "Your business is approved; one last check on the line is with the carriers.", done: false };
    case "registering":
      return { sentence: "Texting is with the carriers.", done: false };
    // The state the pre-flight writes, which had no case here at all -- so a
    // workspace stopped BEFORE anything was filed read the default, "Texting is
    // not available yet", which says nothing about what is in the way and nothing
    // about it being theirs to fix.
    //
    // It deliberately does NOT name the fault, for the same reason none of these
    // do: this is one clause inside a composed Setup sentence, the reason can be a
    // paragraph, and the owner's texting row on Connections renders `last_error`
    // in full. What this has to do is stop saying "not available" about something
    // that is waiting on them. It also cannot say "fill in your record" -- a
    // record that is COMPLETE but names a different business than the workspace
    // does trips the same state, and that fix is a rename, not a field.
    case "needs_record":
      return {
        sentence: "Texting needs something on your business record put right \u2014 Connections says what.",
        done: false
      };
    case "rejected":
      return { sentence: "The carriers refused the texting registration.", done: false };
    case "failed":
      return { sentence: "The texting registration stopped; a person at Chanlytics has it.", done: false };
    // The one state where the owner must act inside a day: the carriers texted
    // their own mobile. Connections says it in full; Setup used to say "not
    // available yet", which reads as nothing to do.
    case "otp_waiting":
      return {
        sentence: "The carriers texted your mobile \u2014 reply to that message from the handset itself and texting switches on; the code lasts a day.",
        done: false
      };
    case "hosting":
      return { sentence: "Texting is with the carriers.", done: false };
    default:
      return { sentence: "Texting is not available yet.", done: false };
  }
}
export function activationWords(cap, nowMs) {
  if (cap.live && cap.activated) return `Activated ${agoWords(Date.parse(cap.activated.at), nowMs)}`;
  if (cap.tested) return "Tested \u2014 activate it to say it is yours";
  return "Not tested yet \u2014 try it from your own phone";
}
export function rowContextOf(i, nowMs) {
  const wa = i.channels.whatsapp;
  const voice = i.channels.voice;
  const waReady = wa.present && wa.active;
  const voiceReady = voice.present && voice.active;
  const answering = waReady || voiceReady;
  const waNum = formatPhoneDisplay(wa.number) ?? "your number";
  const voiceNum = formatPhoneDisplay(voice.number) ?? "your line";
  const handoffNum = formatPhoneDisplay(i.business.handoff);
  const lines = i.lines ?? { rows: [], ready: false, provider: null, costs: { local_number_month_usd: 1.15 } };
  const canSpend = !i.billing || maySpend(i.billing.mode, i.billing.status);
  const ownLine = lines.rows.find((l) => l.voice_state !== "none") ?? null;
  const texting = textingWords(ownLine);
  const lineNum = ownLine?.e164 ? formatPhoneDisplay(ownLine.e164) ?? ownLine.e164 : "your number";
  return {
    nowMs,
    wa,
    voice,
    waReady,
    voiceReady,
    answering,
    waNum,
    voiceNum,
    handoffNum,
    lines,
    canSpend,
    ownLine,
    texting,
    lineNum
  };
}
const isPhoneWay = (v) => PHONE_WAYS.includes(v);
const isRings = (v) => PHONE_RINGS.includes(v);
const isCompany = (v) => v !== "office" && CARRIERS.includes(v);
export function setupPhoneWantOf(view) {
  const phone = view && typeof view === "object" ? view.phone : null;
  if (!phone || typeof phone !== "object") return null;
  const { way, number, mode, rings, company } = phone;
  if (!isPhoneWay(way) || typeof number !== "string") return null;
  const e164 = normalizePhone(number);
  if (!e164) return null;
  if (way === "new") return { way, number: e164 };
  return {
    way,
    number: e164,
    ...mode === "always" ? { mode } : {},
    ...isRings(rings) ? { rings } : {},
    ...isCompany(company) ? { company } : {}
  };
}
const WHATSAPP_CHOICES = ["same", "own", "later"];
export function setupChoicesOf(view) {
  const wa = view && typeof view === "object" ? view.whatsapp : null;
  return { whatsapp: WHATSAPP_CHOICES.includes(wa) ? wa : null };
}
export function forwardedLineOf(lines) {
  return lines?.rows.find((l) => l.kind === "forwarded" && l.forwarding_state !== "none") ?? null;
}
const MOBILE_CARRIERS = ["verizon", "att", "tmobile"];
export function keptPhoneKind(line) {
  if (!line) return null;
  const carrier = line.forwarding?.carrier ?? null;
  if (carrier === "office") return "office";
  return carrier && MOBILE_CARRIERS.includes(carrier) ? "mobile" : "unknown";
}
