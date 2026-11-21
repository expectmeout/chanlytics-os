import { z } from "zod";
import { write } from "@/server/shared/route";
import { adScope } from "@/server/shared/verbs";
import { pressAd } from "@/server/ads/presses";

/**
 * POST /api/v1/ads/:id/check — Check, on an ad whose last switch Meta never answered (the Ads plan's 4.7, point 7):
 * Meta is asked at once what stands, by the account's own read, and the page says it once that read is in. Nothing is
 * sent to Meta again. The owner alone.
 */
export const POST = write({
  scope: adScope,
  role: "owner",
  rate: "settings",
  input: z.object({ version: z.number().int().min(1) }),
  handle: ({ ctx, member, row, input }) => pressAd(ctx, member, { op: "check", adId: row.id, version: input.version }),
});
