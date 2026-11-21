import { z } from "zod";
import { write } from "@/server/shared/route";
import { readerContext } from "@/server/shared/reader";
import { adScope } from "@/server/shared/verbs";
import { fixAd } from "@/server/ads/fix";

/** The ad writer rewrites each version side by side: its calls are bounded inside this minute (server/ads/fix.ts). */
export const maxDuration = 60;

/**
 * POST /api/v1/ads/:id/fix — Fix it, for an ad made here that Meta turned down (the Ads plan's 4.5 and C8): AI writes
 * its words again from Meta's own words for why, and the ad with AI's change made is kept as the workspace's draft, so
 * New ad opens on it. Turning that on sends it back through Meta's check, and ends the one Meta turned down. It spends
 * the model, so it may be refused for billing, shares the ad writer's bucket, and counts in the day's AI limit. It
 * calls nothing at Meta and turns nothing on. Owner or operator: drafting touches no platform (decision 0050, call 2).
 */
export const POST = write({
  scope: adScope,
  role: "operator",
  rate: "ad_words",
  spend: true,
  input: z.object({}),
  handle: ({ ctx, member, row }) => fixAd({ rc: readerContext(ctx, member), userId: ctx.userId }, row.id),
});
