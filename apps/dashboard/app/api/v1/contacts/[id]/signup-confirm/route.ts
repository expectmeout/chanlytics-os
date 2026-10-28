import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { askToConfirmSignup } from "@/server/people/consent";

/**
 * POST /api/v1/contacts/:id/signup-confirm — a member asks a website sign-up's person to confirm by email, from the
 * person's page (Ask to confirm, Ask again; 00489's double opt-in). Whoever may record an answer on a person, in the
 * person's bucket: it sends one email, under the same rules and limits as the website's own ask, and records no answer
 * (only the person's press on its link does). The person is read under RLS first (contactScope), so one not theirs is
 * a 404. The handle is askToConfirmSignup in src/server/people/consent.ts.
 */
export const POST = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  handle: ({ ctx, row: contact }) => askToConfirmSignup(contact.tenant_id, ctx.userId, contact.id),
});
