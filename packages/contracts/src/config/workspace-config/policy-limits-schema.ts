/**
 * The limits a workspace's policies keep (PolicyLimitsSchema), apart from policy-classes.ts's classes, modes and
 * their words. zod is not built into the browser's contracts (decision 0024, the browser's entry): a page that says
 * these words loads none of it.
 */
import { z } from "zod";
import { PAUSE_HOURS_MAX, PAUSE_HOURS_MIN, REPLY_DELAY_MAX_MS, REPLY_DELAY_MIN_MS } from "../policy";

export const PolicyLimitsSchema = z
  .object({
    max_replies_day: z.number().int().min(1).max(200).optional(),
    pause_hours: z.number().int().min(PAUSE_HOURS_MIN).max(PAUSE_HOURS_MAX).optional(),
    /**
     * How long the receptionist WAITS before its own reply goes out, in ms.
     *
     * Only meaningful when mode is 'veto'. A text channel is not a phone
     * call — nobody expects an answer in under a second — so the delay costs
     * the customer nothing and buys the business a window to redirect the bot
     * before it speaks, rather than apologising for it afterwards.
     */
    reply_delay_ms: z.number().int().min(REPLY_DELAY_MIN_MS).max(REPLY_DELAY_MAX_MS).optional(),
    /**
     * The confidence dial. Under 'auto', a reply the model is less sure about
     * than this waits in the hold window (reply_delay_ms) for a person instead
     * of going straight out — sure enough sends itself, not sure enough waits.
     * 0 or absent means off.
     */
    min_confidence: z.number().min(0).max(1).optional(),
    /**
     * The day's token budget: model tokens in and out over a rolling 24
     * hours, read from the usage events every reply writes. Over it the
     * receptionist stops and files a `budget` escalation, as it does at the
     * reply cap. 0 or absent is off; a value is at least a thousand, because
     * a budget of ten would be a mute button with a misleading name.
     */
    max_llm_tokens_day: z
      .number()
      .int()
      .min(0)
      .max(5_000_000)
      .refine((n) => n === 0 || n >= 1000, "at least 1,000, or 0 to turn it off")
      .optional(),
  })
  .strict();

export type PolicyLimits = z.infer<typeof PolicyLimitsSchema>;
