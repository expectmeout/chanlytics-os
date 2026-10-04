/**
 * A partner's invitation, as the route reads it, apart from partner-invite.ts's words. zod is not built into the
 * browser's contracts (decision 0024, the browser's entry): a page that says these words loads none of it.
 */
import { z } from "zod";

/** `POST team/partner`: the partner's code, or their link. */
export const PartnerInviteSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Enter your partner's code, or paste their link.")
      .max(200, "That is too long for a partner's code or link."),
  })
  .strict();
