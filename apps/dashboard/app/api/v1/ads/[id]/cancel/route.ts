import { write } from "@/server/shared/route";
import { adScope } from "@/server/shared/verbs";
import { cancelAd } from "@/server/ads/presses";

/**
 * POST /api/v1/ads/:id/cancel — the owner cancels an ad made here while it is set up (the Ads plan's 4.7, point 8). Its
 * launch stops at its next step: what was made at Meta is removed, or left named and paused, and nothing is switched on
 * after. One made already answers `made`, and its Pause stops it. The owner alone, asked again on the edge and by the
 * door that keeps the cancel.
 */
export const POST = write({
  scope: adScope,
  role: "owner",
  rate: "settings",
  handle: ({ ctx, member, row }) => cancelAd(ctx, member, row.id),
});
