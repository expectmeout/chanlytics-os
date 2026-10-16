import { z } from "zod";
import { read } from "@/server/route";
import { sequenceScope } from "@/server/verbs";
import { load, readerContext } from "@/server/readers";
import { sequenceReplies } from "@/server/readers/sequences";

const Query = z.object({
  /** One of History's periods: 30 days (none given), 90, or all of it. */
  period: z.enum(["30", "90", "all"]).optional(),
});

/**
 * GET /api/v1/sequences/:id/replies?period= — the conversations that answered a sequence over one of History's periods
 * (decision 0060; the canvas's History board: Replied is a door to the Inbox), by the rule its days open onto. The Inbox
 * lists them at `inbox/from:<id>`. Any member; the sequence is the row (sequenceScope).
 */
export const GET = read({
  scope: sequenceScope,
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, row, input }) =>
    (await load(readerContext(ctx, member), sequenceReplies, { id: row.id, period: input.period ?? "30" })).data,
});
