/**
 * The receptionist's settings as the configuration stores them (BrainConfigSchema), apart from brain-config.ts's
 * defaults and its baseline prompt. zod is not built into the browser's contracts (decision 0024, the browser's
 * entry): a page that says these words loads none of it.
 */
import { z } from "zod";
import { BusinessProfileSchema } from "./business-profile";
import { BOOKING_LINK_MAX, INSTRUCTIONS_MAX, PROFILE_LIMITS } from "./config-rules";

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
     * job has none, and its receptionist takes the customer's details instead (no-booking-link.ts). Every business is
     * offered one the same way (business-gap.ts BOOKING_LINK_ROW_WORDS).
     */
    booking_link: z.string().url().max(BOOKING_LINK_MAX).optional(),
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
        greeting: z.string().min(1).max(PROFILE_LIMITS.message),
        /** Sent when the model call failed. */
        error: z.string().min(1).max(PROFILE_LIMITS.message),
        /** Sent for voice notes / photos before escalating. */
        non_text: z.string().min(1).max(PROFILE_LIMITS.message),
      })
      .strip(),
  })
  .strip();

export type BrainConfig = z.infer<typeof BrainConfigSchema>;
