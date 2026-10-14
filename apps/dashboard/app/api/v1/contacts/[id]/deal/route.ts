import { AppError, DEAL_REFUSALS, DealMoveBody, normalizeLink, whyNotALink } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { currentDealOf, recordDealMove } from "@/server/people/deals";

/**
 * POST /api/v1/contacts/:id/deal — record a deal on a person's word (0004).
 *
 * One route for a new engagement (no deal_id: it starts proposed) and for a
 * move (deal_id and the version the page saw). The SQL door decides and
 * writes the stage's event, and the decision is recorded in the same
 * transaction (recordDealMove, 00357), as the consent routes' is. The
 * receptionist never calls it.
 *
 * A proposal's link, its valid-until day, a reason for passing and the fields
 * a person emptied (0008) each reach the door only when the body names them,
 * so a page from before them calls it exactly as it did.
 *
 * It answers the deal it recorded, and `current`: the deal the person's People
 * row shows now (people_list's rule), which a page lays on the row at once.
 */
export const POST = write({
  scope: contactScope,
  role: "operator",
  rate: "person_edit",
  input: DealMoveBody,
  handle: async ({ ctx, row: contact, input }) => {
    const evidence = input.message_id
      ? { message_id: input.message_id }
      : input.form_note
        ? { form: input.form_note }
        : null;
    // What is and is not a link is decided once (contracts link.ts); its refusal names which kind of not-a-link it was.
    const typed = input.proposal_url?.trim() ?? "";
    const url = typed ? normalizeLink(typed) : null;
    if (typed && !url) throw new AppError("validation", whyNotALink(typed) ?? DEAL_REFUSALS.bad_link);
    const recorded = await recordDealMove(ctx, contact.id, input.stage, {
      ...(input.deal_id ? { deal_id: input.deal_id } : {}),
      ...(input.version !== undefined ? { version: input.version } : {}),
      ...(input.service ? { service: input.service } : {}),
      ...(input.when ? { when: new Date(input.when).toISOString() } : {}),
      ...(input.amount_cents !== undefined ? { amount_cents: input.amount_cents } : {}),
      ...(input.per ? { per: input.per } : {}),
      ...(input.note ? { note: input.note } : {}),
      ...(evidence ? { evidence } : {}),
      ...(url ? { proposal_url: url } : {}),
      ...(input.valid_until ? { valid_until: input.valid_until } : {}),
      ...(input.lost_reason ? { lost_reason: input.lost_reason } : {}),
      ...(input.clear?.length ? { clear: input.clear } : {}),
    });
    return { ...recorded, current: await currentDealOf(ctx, contact.tenant_id, contact.id) };
  },
});
