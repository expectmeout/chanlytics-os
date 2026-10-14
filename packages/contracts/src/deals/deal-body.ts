/**
 * What the deal door takes (POST contacts/[id]/deal, 0004): one schema, the route's input, the body the verb layer
 * sends from the deal sheet and from Ask's card alike, and what Ask's act tool checks a card's body against before it
 * proposes it (it judged the day and the reason again in words of its own; the sheets as verbs, 14 Oct 2026). Moved
 * whole from the route: it answers what the route answered.
 */
import { z } from "zod";
import { isRealDate } from "../config/workspace-config/config-rules";
import { DEAL_CLEARABLE, DEAL_LOST_REASONS, DEAL_PERS, DEAL_STAGES } from "./deal-words";

export const DealMoveBody = z
  .object({
    stage: z.enum(DEAL_STAGES),
    /** Absent: a new engagement, which starts proposed. Present: the row the page saw, with the version it saw. */
    deal_id: z.uuid().optional(),
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
    message_id: z.uuid().optional(),
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
export type DealMove = z.infer<typeof DealMoveBody>;
