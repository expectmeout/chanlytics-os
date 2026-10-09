import { z } from "zod";
import {
  AppError,
  DEAL_CLEARABLE,
  DEAL_LOST_REASONS,
  DEAL_PERS,
  DEAL_REFUSALS,
  DEAL_STAGES,
  isRealDate,
  normalizeLink,
  whyNotALink,
} from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope } from "@/server/verbs";
import { currentDealOf, recordDealMove } from "@/server/people/deals";

const Body = z
  .object({
    stage: z.enum(DEAL_STAGES),
    /** Absent: a new engagement, which starts proposed. Present: the row the page saw, with the version it saw. */
    deal_id: z.string().uuid().optional(),
    version: z.number().int().min(1).optional(),
    service: z.string().trim().min(1).max(80).optional(),
    /** An ISO instant with a time (a bare date would land at UTC midnight, the previous evening in the Americas); absent means now. */
    when: z
      .string()
      .refine((s) => /T/.test(s) && Number.isFinite(Date.parse(s)), "when must be an ISO instant with a time")
      .optional(),
    amount_cents: z.number().int().min(0).max(1_000_000_000).optional(),
    per: z.enum(DEAL_PERS).optional(),
    note: z.string().trim().max(200).optional(),
    /** Evidence, the consent's shape: the inbound message they said it in, or a note saying where it was signed. */
    message_id: z.string().uuid().optional(),
    form_note: z.string().trim().min(1).max(200).optional(),
    /**
     * The proposal's web address (0008), judged by the one normalizer before the door, which holds the stored shape.
     * Blank says nothing, as absent does: an emptied link is `clear`.
     */
    proposal_url: z.string().max(600).optional(),
    /** The last day the proposal stands; null says nothing, as absent does (an emptied day is `clear`). */
    valid_until: z.string().refine(isRealDate, "valid_until must be a day, like 2026-09-30").nullable().optional(),
    /** Why they passed, on a move to lost. */
    lost_reason: z.enum(DEAL_LOST_REASONS).optional(),
    /** The fields a person emptied: a move keeps everything it is not told. */
    clear: z.array(z.enum(DEAL_CLEARABLE)).max(DEAL_CLEARABLE.length).optional(),
  })
  .strict();

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
  input: Body,
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
