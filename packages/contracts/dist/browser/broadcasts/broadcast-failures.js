import { triggerOf } from "../playbooks/playbook-triggers.js";
import {
  BROADCAST_FAILURES,
  BROADCAST_FAILURE_WORDS,
  broadcastFailureWords,
  readFailure,
  wordsFor
} from "./broadcast-failure-words.js";
export { BROADCAST_FAILURES, BROADCAST_FAILURE_WORDS, broadcastFailureWords };
export function emailRunStop(reason) {
  if (reason === "email_offers_paused") return "email_offers_paused";
  return reason === "email_marketing_disabled" ? "campaigns_domain_unverified" : null;
}
const RUN_STOP_REMEDY = {
  paused: "Resume from Settings \u203A Billing",
  email_offers_paused: "Check your list for old or wrong addresses; offers by email come back on once it looks right",
  campaigns_domain_unverified: "Nothing is wrong with your mailbox, and the platform has been told"
};
const RUN_STOP_AGAIN = {
  paused: `${RUN_STOP_REMEDY.paused} and send it again.`,
  email_offers_paused: `${RUN_STOP_REMEDY.email_offers_paused}. Send it again then.`,
  campaigns_domain_unverified: `${RUN_STOP_REMEDY.campaigns_domain_unverified}; send it again once the domain is verified.`
};
const isRunStop = (code) => code in RUN_STOP_REMEDY;
export function stoppedRunFix(why, run) {
  const next = playbookRunNext(run, "tomorrow");
  return next ? `${RUN_STOP_REMEDY[why]}. ${next}` : RUN_STOP_AGAIN[why];
}
export function playbookRunNext(run, by) {
  if (!run.playbook_id) return null;
  if (triggerOf(run.trigger ?? "")?.kind === "visit")
    return "It does not run again today, and a reminder belongs to its day, so the people it did not reach will not be sent it later.";
  return by === "tomorrow" ? "It does not run again today; tomorrow's run reaches the people this one did not, and nobody who got it is sent it twice." : "It does not run again today; the next run that can go reaches the people this one did not, and nobody who got it is sent it twice.";
}
const OUTLASTS_TOMORROW = /* @__PURE__ */ new Set(["provider_limit", "template_not_approved"]);
export function wireFailure(code, channel) {
  return channel === "whatsapp" ? code : `${code}:${channel}`;
}
const WHATSAPP_VERSION_FIX_WORDS = "Open it in Messages \u2014 its WhatsApp version can be resubmitted, or the message written as an email or a text.";
export const BROADCAST_FAILURE_FIX = {
  paused: "Unpause it under Settings, then send it again.",
  template_not_approved: WHATSAPP_VERSION_FIX_WORDS,
  wire_unavailable: "Nothing was charged and nobody was written to. Try again.",
  run_interrupted: "Nobody got it, so sending it again reaches nobody twice.",
  throttled: {
    whatsapp: "Nobody got it. WhatsApp lifts these limits on its own; send it again later.",
    sms: "Nobody got it. The texting provider lifts these limits on its own; send it again later.",
    email: "Nobody got it. The mail provider lifts these limits on its own; send it again later."
  },
  stalled: {
    whatsapp: "Nobody got it. Nothing is wrong with the number; send it again later.",
    sms: "Nobody got it. Nothing is wrong with the line; send it again later.",
    email: "Nobody got it. Nothing is wrong with the mailbox; send it again later."
  },
  people_unreadable: "Nobody got it. Nothing is wrong with your channels; send it again later.",
  after_hours: "Nobody got it. Send it again tomorrow, inside the day's sending hours.",
  provider_limit: "Nobody got it. The mail provider's limit resets on its own; send it again once it has.",
  campaigns_domain_unverified: "Nobody got it. Nothing is wrong with your mailbox: the platform has been told. Send it again once the domain is verified.",
  email_offers_paused: "Nobody got it. Check your list for old or wrong addresses; offers by email come back on once it looks right. Send it again then."
};
const WIRE_NAMES = {
  whatsapp: { provider: "WhatsApp", limited: "WhatsApp limited the number" },
  sms: { provider: "the texting provider", limited: "the texting provider limited the line" },
  email: { provider: "the mail provider", limited: "the mail provider limited the mailbox" }
};
const BROADCAST_FAILURE_FIX_AFTER = {
  paused: (n) => `Unpause it under Settings. Sending it again reaches the whole list, ${n === 1 ? "the one" : `the ${n}`} who got it included.`,
  wire_unavailable: (n, c) => `The first ${n === 1 ? "one" : n} got it, then ${WIRE_NAMES[c].provider} stopped answering. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  run_interrupted: (n) => `${n === 1 ? "One" : n} got it and the rest did not. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  throttled: (n, c) => `The first ${n === 1 ? "one" : n} got it, then ${WIRE_NAMES[c].limited}. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  stalled: (n) => `The first ${n === 1 ? "one" : n} got it, then its reads failed. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  people_unreadable: (n) => `The first ${n === 1 ? "one" : n} got it, then its people could not be read. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  after_hours: (n) => `The first ${n === 1 ? "one" : n} got it before the day's sending hours ran out. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  provider_limit: (n) => `The first ${n === 1 ? "one" : n} got it, then the mail provider's limit was reached. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  campaigns_domain_unverified: (n) => `The first ${n === 1 ? "one" : n} got it, then the domain offers by email leave from stopped being verified. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`,
  email_offers_paused: (n) => `The first ${n === 1 ? "one" : n} got it, then the workspace's offers by email were paused. Sending it again reaches the whole list, ${n === 1 ? "that one" : `those ${n}`} included.`
};
const PLAYBOOK_RUN_REMEDY = {
  template_not_approved: WHATSAPP_VERSION_FIX_WORDS,
  wire_unavailable: null,
  run_interrupted: null,
  throttled: {
    whatsapp: "WhatsApp lifts these limits on its own.",
    sms: "The texting provider lifts these limits on its own.",
    email: "The mail provider lifts these limits on its own."
  },
  stalled: {
    whatsapp: "Nothing is wrong with the number.",
    sms: "Nothing is wrong with the line.",
    email: "Nothing is wrong with the mailbox."
  },
  people_unreadable: "Nothing is wrong with your channels.",
  after_hours: null,
  provider_limit: "The mail provider's limit resets on its own."
};
function playbookRunFix(read, reached, next) {
  const remedy = PLAYBOOK_RUN_REMEDY[read.code];
  const got = reached > 0 ? `The first ${reached === 1 ? "one" : reached} got it.` : "Nobody got it.";
  return [got, remedy ? wordsFor(remedy, read.channel) : null, next].filter(Boolean).join(" ");
}
export function broadcastFailureFix(failure, reached = 0, run) {
  if (!failure) return null;
  const read = readFailure(failure);
  if (!read) return null;
  const next = run ? playbookRunNext(run, OUTLASTS_TOMORROW.has(read.code) ? "when_it_can" : "tomorrow") : null;
  if (run && next) {
    const { code, channel } = read;
    return isRunStop(code) ? stoppedRunFix(code, run) : playbookRunFix({ code, channel }, reached, next);
  }
  const after = reached > 0 ? BROADCAST_FAILURE_FIX_AFTER[read.code] : void 0;
  return after ? after(reached, read.channel) : wordsFor(BROADCAST_FAILURE_FIX[read.code], read.channel) || null;
}
