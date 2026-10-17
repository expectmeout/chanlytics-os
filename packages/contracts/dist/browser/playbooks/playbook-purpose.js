import { purposeOfPlaybook, purposeOfTemplate } from "../consent/consent.js";
import { triggerOf } from "./playbook-triggers.js";
export function messageAboutOfTrigger(trigger) {
  const kind = triggerOf(trigger ?? "")?.kind;
  return kind === "visit" || kind === "deal" ? "theirs" : "ours";
}
export function passesHandoverPause(trigger) {
  return trigger === "visit_tomorrow";
}
export function enrolPurpose(policyClass, message) {
  const byClass = purposeOfPlaybook(policyClass);
  if (!message || byClass === "marketing") return byClass;
  return purposeOfTemplate(message.category);
}
export const MESSAGE_MOMENT_WORDS = {
  offer_on_texts: "This moment reaches anyone who said yes to texts, and this message is an offer, which only a yes to offers may get. Pick a reminder, a check after, or a follow-up.",
  texts_on_offers: "This moment sends offers, which only a yes to offers may get, and this message is a reminder, a check after or a follow-up. Pick an offer, or the moment it was written for."
};
export function messageFitsMoment(policyClass, category) {
  const moment = purposeOfPlaybook(policyClass);
  const message = purposeOfTemplate(category);
  if (moment === message) return { ok: true };
  const why = moment === "conversational" ? "offer_on_texts" : "texts_on_offers";
  return { ok: false, why, words: MESSAGE_MOMENT_WORDS[why] };
}
