/**
 * A partner's second-factor reset, as the route reads it, apart from second-factor.ts's words and its path. zod is
 * not built into the browser's contracts (decision 0024, the browser's entry): a page that says these words loads
 * none of it.
 */
import { z } from "zod";

/** `POST platform/partners/second-factor`: whose, and why. */
export const PartnerSecondFactorResetSchema = z
  .object({
    partner_id: z.string().uuid("That partner does not exist."),
    why: z.string().trim().min(1, "Say why, and how you checked it's them.").max(500, "At most 500 characters."),
  })
  .strict();
