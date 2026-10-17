import { FALLBACK_DEFAULTS } from "./fallbacks.js";
export function newReceptionistDefaults(businessName) {
  return {
    system_prompt: baselinePrompt(businessName),
    // What a customer reads when the model cannot be reached: the product's
    // wording, naming the business's details rather than copying them, so they
    // are filled as each message goes out and follow the details from then on
    // (fallbackMessages, S5). Copied, a workspace set up before its line existed
    // told customers "call us at .", and a new booking link never reached them.
    fallbacks: { ...FALLBACK_DEFAULTS }
  };
}
export const BASELINE_OPENING = "You are the assistant for ";
export const BASELINE_CLOSING = ", answering inbound customer messages. You are warm, concise and professional \u2014 a great front-desk person, in text form. If you do not know something, say so plainly and offer to have a person follow up.";
function baselinePrompt(businessName) {
  return `${BASELINE_OPENING}${businessName}${BASELINE_CLOSING}`;
}
export function isBaselinePrompt(text) {
  return text.startsWith(BASELINE_OPENING) && text.endsWith(BASELINE_CLOSING);
}
