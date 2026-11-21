import { z } from "zod";
import { DAY_KEY } from "@chanlytics/contracts";
import { write } from "@/server/shared/route";
import { adScope } from "@/server/shared/verbs";
import { changeAd } from "@/server/ads/presses";

/**
 * POST /api/v1/ads/:id/end-date — the owner moves the last day of a running ad made here (decision 0050, calls 4 and
 * 10, and its Routes; the Ads plan's 4.5). Its total stays the most it can cost in all. The press carries the version it
 * was drawn from and the last moment Meta held then, so a last day changed in Meta since is never put back. A run is at
 * least a whole day, and a later day only where its total covers Meta's least for each day. Meta's dry run goes first.
 * The owner alone, on a session the Auth server says is live.
 */
export const POST = write({
  scope: adScope,
  role: "owner",
  rate: "settings",
  fresh: true,
  input: z.object({
    version: z.number().int().min(1),
    end_day: z.string().regex(DAY_KEY),
    from_ends_at: z.string().min(1).max(64),
  }),
  handle: ({ ctx, member, row, input }) =>
    changeAd(ctx, member, {
      adId: row.id,
      version: input.version,
      ask: { what: "end_day", end_day: input.end_day },
      pressed: { from_ends_at: input.from_ends_at },
    }),
});
