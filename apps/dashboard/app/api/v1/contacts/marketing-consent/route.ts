import { z } from "zod";
import { CONSENT_STATES } from "@chanlytics/contracts";
import { workspace, write } from "@/server/route";
import { recordConsentMany } from "@/server/consent";

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1, "Pick at least one person.").max(50, "Fifty at a time."),
  consent: z.enum(CONSENT_STATES as unknown as [string, ...string[]], { message: "Consent must be one of: opted_in, opted_out, unknown." }),
  source: z.string().optional(),
  note: z.string().optional(),
});

/**
 * PUT /api/v1/contacts/marketing-consent -- { ids, consent, source?, note? }
 *
 * The OFFERS answer for many at once: thirty signed slips recorded in one go.
 * The sibling of ../consent/route.ts, shaped the same way and kept apart for
 * the same reason the single doors are: a yes to offers must be written (the
 * batch is refused before any row is touched if it is not), and this door
 * never touches dnc. set_marketing_consent per person, a decision per person.
 */
export const PUT = write({
  scope: workspace,
  role: "operator",
  rate: "consent",
  input: Body,
  handle: async ({ ctx, member, input }) => recordConsentMany(ctx, member.tenantId, "marketing", input),
});
