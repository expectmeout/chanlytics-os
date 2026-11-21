import { z } from "zod";
import { write } from "@/server/shared/route";
import { adScope } from "@/server/shared/verbs";
import { changeAd } from "@/server/ads/presses";

/**
 * POST /api/v1/ads/:id/area — the owner changes how many miles around the business a running ad made here is shown in
 * (the Ads plan's 4.5 and 4.6: 1 to 50). It costs nothing more: the total is still the most. Who sees it is sent to
 * Meta whole, as Turn on sent it, with only the miles changed, after Meta's dry run. An ad shown across a wider place
 * is changed in Meta. The press carries the version it was drawn from. The owner alone, on a live session.
 */
export const POST = write({
  scope: adScope,
  role: "owner",
  rate: "settings",
  fresh: true,
  input: z.object({ version: z.number().int().min(1), miles: z.number().int().min(1).max(50) }),
  handle: ({ ctx, member, row, input }) =>
    changeAd(ctx, member, { adId: row.id, version: input.version, ask: { what: "miles", miles: input.miles } }),
});
