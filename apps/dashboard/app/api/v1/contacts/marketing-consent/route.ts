import { ConsentManyBody } from "@chanlytics/contracts";
import { workspace, write } from "@/server/route";
import { recordConsentMany } from "@/server/people/consent";

/**
 * PUT /api/v1/contacts/marketing-consent -- { ids, consent, source?, note? }
 *
 * The OFFERS answer for many at once: thirty signed slips recorded in one go.
 * The sibling of ../consent/route.ts, shaped the same way and kept apart for
 * the same reason the single doors are: a yes to offers must be written (the
 * batch is refused before any row is touched if it is not), and this door
 * never touches dnc. One call per person (record_consent, 00356): the answer and its history line together.
 */
export const PUT = write({
  scope: workspace,
  role: "operator",
  rate: "consent",
  input: ConsentManyBody,
  handle: async ({ ctx, member, input }) => recordConsentMany(ctx, member.tenantId, "marketing", input),
});
