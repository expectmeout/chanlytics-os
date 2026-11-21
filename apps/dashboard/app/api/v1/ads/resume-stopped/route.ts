import { write, workspace } from "@/server/shared/route";
import { AdSetPressBodySchema, resumeStoppedAds } from "@/server/ads/presses";

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
  input: AdSetPressBodySchema,
  handle: ({ ctx, member, input }) => resumeStoppedAds(ctx, member, input.ads),
});
