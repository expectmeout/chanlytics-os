import { z } from "zod";
import { write } from "@/server/shared/route";
import { adScope } from "@/server/shared/verbs";
import { pressAd } from "@/server/ads/presses";

/**
 * POST /api/v1/ads/:id/resume — the owner turns a paused ad back on (decision 0050, call 9; the Ads plan's C1). For an ad
 * made in Meta it is allowed only where Meta holds a total with an end date for that ad alone, so the press can name the
 * most it may cost, which Meta enforces itself: anything else is refused, and is turned back on in Meta. The press
 * carries the version it was drawn from. The owner alone, asked again on the edge and by the door that keeps the press.
 */
export const POST = write({
  scope: adScope,
  role: "owner",
  rate: "settings",
  input: z.object({ version: z.number().int().min(1) }),
  handle: ({ ctx, member, row, input }) => pressAd(ctx, member, { op: "resume", adId: row.id, version: input.version }),
});
