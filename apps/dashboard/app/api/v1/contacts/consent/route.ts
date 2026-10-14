import { ConsentManyBody } from "@chanlytics/contracts";
import { workspace, write } from "@/server/route";
import { recordConsentMany } from "@/server/people/consent";

/**
 * PUT /api/v1/contacts/consent -- { ids, consent, source?, note? }
 *
 * The visit answer for many people at once: a yes given at the desk by a whole
 * class, say. One request where the page used to send one per person, through
 * the door each would go through alone (record_consent, 00356: the answer and its
 * history line together; server/people/consent.ts), held to the workspace the tab named. Operator or
 * owner, and one take of the consent bucket for the batch rather than fifty.
 */
export const PUT = write({
  scope: workspace,
  role: "operator",
  rate: "consent",
  input: ConsentManyBody,
  handle: async ({ ctx, member, input }) => recordConsentMany(ctx, member.tenantId, "conversational", input),
});
