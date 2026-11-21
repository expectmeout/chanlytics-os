import { z } from "zod";
import { write } from "@/server/shared/route";
import { adScope } from "@/server/shared/verbs";
import { changeAd } from "@/server/ads/presses";

/**
 * POST /api/v1/ads/:id/budget — the owner changes the total of a running ad made here (decision 0050, calls 3, 4 and
 * 10, and its Routes; the Ads plan's 4.5 and 5.2). The press carries the version it was drawn from and the total Meta
 * held then, so one drawn from an old read, or from a total changed in Meta since, is refused. A raise names its most
 * and carries it; lowering is free. Inside Meta's limits: its least for the run, a tenth over what was spent, four
 * changes of an amount an hour. Meta's dry run goes first. The owner alone, on a session the Auth server says is live.
 */
export const POST = write({
  scope: adScope,
  role: "owner",
  rate: "settings",
  fresh: true,
  input: z.object({
    version: z.number().int().min(1),
    total_minor: z.number().int().positive(),
    from_minor: z.number().int().min(0),
    expect_max_minor: z.number().int().positive().nullable(),
  }),
  handle: ({ ctx, member, row, input }) =>
    changeAd(ctx, member, {
      adId: row.id,
      version: input.version,
      ask: { what: "total", total_minor: input.total_minor },
      pressed: { from_minor: input.from_minor, expect_max_minor: input.expect_max_minor },
    }),
});
