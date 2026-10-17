import { lineCredentialFailure } from "../lines/line-failure.js";
import { agoWords } from "../shared/time.js";
export const CAPABILITY_KINDS = ["voice", "whatsapp", "sms"];
function activationOf(i, kind) {
  const r = (i.activations ?? []).find((a) => a.capability === kind && !a.deactivated_at);
  return r ? { at: r.activated_at, by: r.activated_by } : null;
}
const factsMissing = (i) => !i.business.name || !i.business.hours ? {
  code: "no_business_facts",
  words: "The receptionist has no facts to answer with yet: the business name and hours first."
} : null;
export function capabilityStatus(kind, i, nowMs = Date.now()) {
  const blockers = [];
  let tested = null;
  if (kind === "voice") {
    const v = i.channels.voice;
    const own = i.lines?.rows.find((l) => l.provider !== "carrier") ?? null;
    if (v.present && v.active) {
      const f = factsMissing(i);
      if (f) blockers.push(f);
    } else if (v.present) {
      blockers.push({ code: "channel_off", words: "Your line is switched off." });
    } else if (own && own.voice_state === "provisioning") {
      blockers.push({ code: "line_provisioning", words: "Your line is being set up; it answers the moment it is." });
    } else if (own && own.voice_state === "failed" && lineCredentialFailure(own.last_error)) {
      blockers.push({
        code: "line_failed",
        words: "Setting up your line stopped at the vault that keeps its credentials; a person at Chanlytics has it, and a retry cannot help until they restore them."
      });
    } else if (own && own.voice_state === "failed") {
      blockers.push({
        code: "line_failed",
        words: "Setting up your line stopped; a person at Chanlytics has it, and Retry is on the row."
      });
    } else {
      blockers.push({ code: "no_line", words: "No line yet: get a number, or keep the one you have." });
    }
    if (v.lastInboundAt) tested = { at: v.lastInboundAt, what: "a call was answered" };
  } else if (kind === "whatsapp") {
    const w = i.channels.whatsapp;
    if (w.present && w.active) {
      const t = i.templates;
      if (t.approved === 0 && t.pending > 0)
        blockers.push({ code: "meta_waiting", words: "Your first messages are with Meta for approval." });
      const f = factsMissing(i);
      if (f) blockers.push(f);
    } else if (w.present) {
      blockers.push({ code: "channel_off", words: "Your WhatsApp number is connected but switched off." });
    } else {
      blockers.push({ code: "not_connected", words: "Connect the WhatsApp number customers write to." });
    }
    if (w.lastInboundAt) tested = { at: w.lastInboundAt, what: "a message was answered" };
  } else {
    const line = i.lines?.rows.find((l) => l.sms_state === "active" && !l.reg_mock) ?? null;
    if (!line)
      blockers.push({
        code: "texting_not_sold",
        words: "Texting is not part of what is sold yet: it arrives with a line the carriers have approved."
      });
  }
  const ready = blockers.length === 0;
  const activated = activationOf(i, kind);
  const live = ready && !!tested && !!activated;
  const words = live ? `Active since ${agoWords(Date.parse(activated.at), nowMs)}.` : activated && !ready ? `Activated, but not ready: ${blockers[0].words}` : ready && tested ? `Tested (${tested.what} ${agoWords(Date.parse(tested.at), nowMs)}). Activate it to say it is yours.` : ready ? "Ready. Try it from your own phone, then activate it." : blockers[0].words;
  return { kind, ready, blockers, tested, activated, live, words };
}
