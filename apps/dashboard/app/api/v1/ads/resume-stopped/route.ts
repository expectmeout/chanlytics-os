import { z } from "zod";
import { AD_PAUSE_ALL_MAX, UUID } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { resumeStoppedAds } from "@/server/ads/presses";

/**
 * POST /api/v1/ads/resume-stopped — the owner turns back on the ads Stop everything paused (the content loop PRD's 14.1,
 * call 21). Resume never does it, since turning an ad on spends: this is its own press, naming each ad with the version
 * it was drawn from. Only an ad the stop paused that stands so is turned on; Meta is told at its pace. Refused while AI is
 * stopped. The owner alone, asked again on the edge and by the door that keeps each.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  input: z.object({
    ads: z
      .array(z.object({ id: z.string().regex(UUID), version: z.number().int().min(1) }))
      .min(1)
      .max(AD_PAUSE_ALL_MAX)
      .refine((ads) => new Set(ads.map((ad) => ad.id)).size === ads.length, "Each ad once."),
  }),
  handle: ({ ctx, member, input }) => resumeStoppedAds(ctx, member, input.ads),
});
