import { z } from "zod";
import { read } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { load, readerContext } from "@/server/readers";
import { sequenceHistory } from "@/server/readers/sequences";

const Query = z.object({
  /** Page back: batches that went before this instant. Refused here, never handed to the database unparsed. */
  before: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "before must be a timestamp.")
    .optional(),
});

/**
 * GET /api/v1/sequences/:id/history?before= — what a sequence sent (decision 0060, D3), a batch a row, newest first:
 * when, to how many, and what became of its sends, with `more` where older batches wait behind `before`. Any member;
 * the sequence is the row (sequenceScope).
 */
export const GET = read({
  scope: sequenceScope,
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, row, input }) =>
    (await load(readerContext(ctx, member), sequenceHistory, { id: row.id, before: input.before ?? null })).data,
});
