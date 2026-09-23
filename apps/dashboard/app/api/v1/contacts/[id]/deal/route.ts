import { z } from "zod";
import { AppError, DEAL_PERS, DEAL_REFUSALS, DEAL_STAGES, type DealDto } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { contactScope, recordDecision } from "@/server/verbs";

const Body = z
  .object({
    stage: z.enum(DEAL_STAGES),
    /** Absent: a new engagement, which starts proposed. Present: the row the page saw, with the version it saw. */
    deal_id: z.string().uuid().optional(),
    version: z.number().int().min(1).optional(),
    service: z.string().trim().min(1).max(80).optional(),
    /** An ISO instant; absent means now. */
    when: z
      .string()
      .refine((s) => Number.isFinite(Date.parse(s)), "when must be an ISO instant")
      .optional(),
    amount_cents: z.number().int().min(0).max(1_000_000_000).optional(),
    per: z.enum(DEAL_PERS).optional(),
    note: z.string().trim().max(200).optional(),
    /** Evidence, the consent's shape: the inbound message they said it in, or a note saying where it was signed. */
    message_id: z.string().uuid().optional(),
    form_note: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

/**
 * POST /api/v1/contacts/:id/deal — record a deal on a person's word (0004).
 *
 * One route for a new engagement (no deal_id: it starts proposed) and for a
 * move (deal_id and the version the page saw). The SQL door decides and
 * writes the stage's event; this records the decision, as the consent route
 * does. The receptionist never calls it.
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
    });
    if (error) throw new AppError("validation", error.message);
    const r = (data ?? {}) as { error?: string; deal?: DealDto; from?: string | null };
    if (r.error || !r.deal) throw new AppError("validation", DEAL_REFUSALS[r.error ?? ""] ?? "Could not record this.");
    const decision_id = await recordDecision(ctx, contact.tenant_id, "deal", r.deal.id, "record_deal", {
      contact_id: contact.id,
      stage: input.stage,
      from: r.from ?? null,
      service: r.deal.service ?? null,
    });
    return { deal: r.deal, from: r.from ?? null, decision_id };
  },
});
