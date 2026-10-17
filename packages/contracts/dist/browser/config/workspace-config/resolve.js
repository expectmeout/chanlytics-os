import { resolveFacts } from "../facts.js";
import { samePhone } from "../../shared/phone.js";
import { NO_WAY_TO_SEND_LINK, offersBookingLink, offersLinkOn } from "../no-booking-link.js";
import { BASELINE_CLOSING, BASELINE_OPENING, isBaselinePrompt } from "./brain-config.js";
import { composeSystemPrompt, noLinkBooking, standingRules, PROMPT_OPENINGS } from "./compose.js";
export function instructionsDraft(brain) {
  const whose = whoseWords(brain);
  if (whose.kind === "own") return { text: whose.text, carried: false };
  return whose.kind === "carried" || whose.kind === "prompt" ? { text: whose.text, carried: true } : { text: "", carried: false };
}
export const NO_FIELDS_COMPOSED_WORDS = "Your details aren't in what it reads yet.";
export function hasProfile(p) {
  if (!p) return false;
  const statedHours = !!p.hours && Object.values(p.hours).some((h) => h?.open && h?.close || h?.intervals?.length);
  return !!(p.address || p.tone || p.extra_instructions || statedHours || p.services?.length || p.languages?.length || p.escalate_when?.length || p.website || p.notes?.length);
}
export function resolveSystemPrompt(brain, wire = "whatsapp", tz, now = /* @__PURE__ */ new Date(), policy, known, audience = "customer") {
  const channel = wire === "voice" ? "voice" : "whatsapp";
  const facts = resolveFacts(brain, known);
  if (!hasProfile(brain.profile)) {
    const link = !offersBookingLink(brain) ? [noLinkBooking(channel)] : channel === "voice" && !offersLinkOn("call", brain, facts.whatsapp_line.value) ? [NO_WAY_TO_SEND_LINK] : [];
    const rules = [...link, ...standingRules(policy, channel, audience)];
    return `${brain.system_prompt}

${PROMPT_OPENINGS.rules}
${rules.map((r) => `- ${r}`).join("\n")}`;
  }
  const profile = brain.profile;
  const ringing = wire === "voice" && (samePhone(facts.phone_display.value, facts.voice_line.value) || samePhone(facts.phone_display.value, facts.kept_line.value));
  const resolved = {
    business_name: facts.business_name.value ?? brain.business_name,
    phone_display: ringing ? null : facts.phone_display.value,
    booking_link: facts.booking_link.value ?? brain.booking_link ?? null,
    // Provisioned or nothing, never typed (facts.ts): the ask for the yes to offers is composed only where there is one.
    whatsapp_line: facts.whatsapp_line.value
  };
  const carried = { ...profile, extra_instructions: ownWordsOf(brain) ?? void 0 };
  return composeSystemPrompt(resolved, carried, wire, tz, now, policy, audience);
}
export function ownWordsOf(brain) {
  const own = brain?.profile?.extra_instructions;
  return own?.trim() ? own : brain?.system_prompt ?? null;
}
export function whoseWords(brain) {
  const text = ownWordsOf(brain);
  if (!text?.trim()) return { kind: "none", text: null };
  if (brain?.profile?.extra_instructions?.trim())
    return { kind: isBaselineInOwnersField(text) ? "baseline" : "own", text };
  if (isBaselinePrompt(text.trim())) return { kind: "baseline", text };
  return { kind: hasProfile(brain?.profile) ? "carried" : "prompt", text };
}
function isBaselineInOwnersField(text) {
  const t = text.trim();
  if (!isBaselinePrompt(t)) return false;
  const name = t.slice(BASELINE_OPENING.length, t.length - BASELINE_CLOSING.length);
  return name.trim().length > 0 && name.length <= 120 && !/[\r\n]/.test(name) && !/[.!?]\s/.test(name);
}
