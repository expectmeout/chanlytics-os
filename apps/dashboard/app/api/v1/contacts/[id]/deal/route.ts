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
  type DealDto,
} from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope, recordDecision } from "@/server/verbs";

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
     * The proposal's web address (0007), judged by the one normalizer before the door, which holds the stored shape.
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
 * writes the stage's event; this records the decision, as the consent route
 * does. The receptionist never calls it.
 *
 * A proposal's link, its valid-until day, a reason for passing and the fields
 * a person emptied (0007) each reach the door only when the body names them,
 * so a page from before them calls it exactly as it did.
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
    const { data, error } = await ctx.supabase.rpc("deal_record", {
      p_contact_id: contact.id,
      p_stage: input.stage,
      ...(input.deal_id ? { p_deal_id: input.deal_id } : {}),
      ...(input.version !== undefined ? { p_version: input.version } : {}),
      ...(input.service ? { p_service: input.service } : {}),
      ...(input.when ? { p_when: new Date(input.when).toISOString() } : {}),
      ...(input.amount_cents !== undefined ? { p_amount_cents: input.amount_cents } : {}),
      ...(input.per ? { p_per: input.per } : {}),
      ...(input.note ? { p_note: input.note } : {}),
      ...(evidence ? { p_evidence: evidence } : {}),
      ...(url ? { p_proposal_url: url } : {}),
      ...(input.valid_until ? { p_valid_until: input.valid_until } : {}),
      ...(input.lost_reason ? { p_lost_reason: input.lost_reason } : {}),
      ...(input.clear?.length ? { p_clear: input.clear } : {}),
    });
    if (error) throw new AppError("validation", error.message);
    const r = (data ?? {}) as { error?: string; deal?: DealDto; from?: string | null };
    if (r.error || !r.deal) {
      // A key the sentences lack, or no deal and no error: an answer this route does not know. Logged raw before
      // the generic sentence, so a new refusal is found in the log rather than by its blandness.
      if (!(r.error && DEAL_REFUSALS[r.error])) {
        console.error(
          "deal_door_unknown_answer",
          JSON.stringify({ contact: contact.id, error: r.error ?? null, deal: !!r.deal }),
        );
      }
      throw new AppError("validation", DEAL_REFUSALS[r.error ?? ""] ?? "Could not record this.");
    }
    const decision_id = await recordDecision(ctx, contact.tenant_id, "deal", r.deal.id, "record_deal", {
      contact_id: contact.id,
      stage: input.stage,
      from: r.from ?? null,
      service: r.deal.service ?? null,
    });
    return { deal: r.deal, from: r.from ?? null, decision_id };
  },
});
