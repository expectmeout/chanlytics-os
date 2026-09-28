/**
 * The brain section: the receptionist's name, booking link, stored prompt, profile and fallback messages, and what
 * a new receptionist starts with, beside the schema it has to satisfy. Whose words stand in the owner's place is
 * resolve.ts; the messages' wording is fallbacks.ts.
 */
import { z } from "zod";
import { BusinessProfileSchema, INSTRUCTIONS_MAX } from "./business-profile";
import { FALLBACK_DEFAULTS } from "./fallbacks";

export const BrainConfigSchema = z
  .object({
    business_name: z.string().min(1).max(120),
    /**
     * The number the receptionist tells customers to call — an OVERRIDE, and
     * optional because it should almost never be set.
     *
     * It was required, free text, and named the same as the line the
     * receptionist answers, so every workspace typed something into it and
     * nothing checked what. On the first live salon that produced a
     * receptionist publishing the number it transfers to: customers who rang
     * it reached a person's mobile and never the receptionist standing by,
     * and the same string went to Google.
     *
     * Absent is now the right answer and the default: resolveFacts falls back
     * to the provisioned voice line, formatted for speech, so the number
     * published is the number answered by construction. A value here means a
     * business deliberately publishes something else — a tracking line, a
     * shopfront — and the pane says so in those words.
     */
    phone_display: z.string().min(3).max(40).optional(),
    /**
     * Where a customer books. Optional since the first run's decision 2 (24 Sep 2026): a business that quotes each
     * job has none, and its receptionist takes the customer's details instead (no-booking-link.ts). Who is asked for
     * one is the pages' question, by how customers buy (deals.ts bookingLinkOptional): the config cannot see it.
     */
    booking_link: z.string().url().max(500).optional(),
    /** The complete system prompt the model receives — the "AI memory" pane's
     *  one hard promise is that what it shows is EXACTLY this, nothing more. */
    system_prompt: z.string().min(40).max(INSTRUCTIONS_MAX),
    /**
     * The business's facts, as fields.
     *
     * Optional: every config written before this existed stays valid, and
     * nothing composes until a workspace actually fills it in. When present
     * it REPLACES system_prompt as the source the prompt is built from.
     */
    profile: BusinessProfileSchema.optional(),
    fallbacks: z
      .object({
        /** Sent when no model key is configured. */
        greeting: z.string().min(1).max(2000),
        /** Sent when the model call failed. */
        error: z.string().min(1).max(2000),
        /** Sent for voice notes / photos before escalating. */
        non_text: z.string().min(1).max(2000),
      })
      .strip(),
  })
  .strip();

export type BrainConfig = z.infer<typeof BrainConfigSchema>;

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
