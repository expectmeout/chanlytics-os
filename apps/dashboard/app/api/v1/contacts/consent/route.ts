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
 * PUT /api/v1/contacts/consent -- { ids, consent, source?, note? }
 *
 * The visit answer for many people at once: a yes given at the desk by a whole
 * class, say. One request where the page used to send one per person, through
 * the door each would go through alone (set_contact_consent, a decision per
 * person; server/consent.ts), held to the workspace the tab named. Operator or
 * owner, and one take of the consent bucket for the batch rather than fifty.
 */
export const PUT = write({
  scope: workspace,
  role: "operator",
  rate: "consent",
  input: Body,
  handle: async ({ ctx, member, input }) => recordConsentMany(ctx, member.tenantId, "conversational", input),
});
