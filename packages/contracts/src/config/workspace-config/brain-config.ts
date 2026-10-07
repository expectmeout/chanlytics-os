/**
 * The brain section: the receptionist's name, booking link, stored prompt, profile and fallback messages, and what
 * a new receptionist starts with. The schema it has to satisfy is brain-config-schema.ts; whose words stand in the
 * owner's place is resolve.ts; the messages' wording is fallbacks.ts.
 */
import { FALLBACK_DEFAULTS } from "./fallbacks";
import type { BrainConfig } from "./brain-config-schema";

/**
 * The parts of a brand-new receptionist nobody should have to write.
 *
 * BrainConfigSchema requires a system_prompt and three fallback messages, and
 * until this existed there was no way to produce them from inside the product:
 * provisioning inserts an empty tenant_config row and the settings form only
 * ever edited the profile ON an existing brain. Onboarding a business meant
 * hand-writing its config into the database.
 *
 * It lives HERE, beside the schema it has to satisfy, because a default that
 * drifts out of spec does not fail in review — it fails for the next business
 * that tries to set itself up.
 *
 * The prompt states no facts on purpose. The address, hours and services are
 * composed from the profile; a baseline that repeated them would be a second
 * copy of every one, free to go stale the moment the owner edits a field.
 */
export function newReceptionistDefaults(businessName: string): Pick<BrainConfig, "system_prompt" | "fallbacks"> {
  return {
    system_prompt: baselinePrompt(businessName),
    // What a customer reads when the model cannot be reached: the product's
    // wording, naming the business's details rather than copying them, so they
    // are filled as each message goes out and follow the details from then on
    // (fallbackMessages, S5). Copied, a workspace set up before its line existed
    // told customers "call us at .", and a new booking link never reached them.
    fallbacks: { ...FALLBACK_DEFAULTS },
  };
}

/*
 * The product's own opening lines, apart from any business's words.
 *
 * Every workspace the form sets up gets them as its system_prompt, and a
 * profile carries that prompt as instructions until the owner writes their
 * own (resolveSystemPrompt). The form showed them in the owner's box as if the
 * owner had written them, and a save copied them in (S4) -- so they are
 * recognised by their shape, whatever business name they were written with.
 */
export const BASELINE_OPENING = "You are the assistant for ";
export const BASELINE_CLOSING =
  ", answering inbound customer messages. " +
  "You are warm, concise and professional — a great front-desk person, in text form. " +
  "If you do not know something, say so plainly and offer to have a person follow up.";

function baselinePrompt(businessName: string): string {
  return `${BASELINE_OPENING}${businessName}${BASELINE_CLOSING}`;
}

/** The product's own opening lines, whatever business name they were written with -- words no owner wrote. */
export function isBaselinePrompt(text: string): boolean {
  return text.startsWith(BASELINE_OPENING) && text.endsWith(BASELINE_CLOSING);
}
