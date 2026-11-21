import { z } from "zod";
import { AD_PAUSE_ALL_MAX, UUID } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { pauseAllAds } from "@/server/ads/presses";

/**
 * POST /api/v1/ads/pause-all — the owner pauses every ad of a set at once (the Ads plan's G17: while AI is stopped, the
 * one press that pauses every ad still on). Each ad carries the version it was drawn from. Every pause is kept, in one
 * transaction, before this answers, and Meta is told at its pace, so none is left running if the page closes. It
 * answers what each ad came to. The owner alone, asked again on the edge and by the door that keeps each pause.
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
  handle: ({ ctx, member, input }) => pauseAllAds(ctx, member, input.ads),
});
