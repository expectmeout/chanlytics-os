import { write, workspace } from "@/server/shared/route";
import { readerContext } from "@/server/shared/reader";
import { AdWordsBodySchema } from "@/server/ads/draft-shape";
import { writeAdWords } from "@/server/ads/words";

/** The ad writer thinks before it writes: its call is bounded inside this minute (server/ads/words.ts). */
export const maxDuration = 60;

/**
 * POST /api/v1/ads/words — the ad writer on a new ad's draft (decision 0050, Routes; the Ads plan's 6.7): three
 * versions of its words, or the one change the owner told AI to make, from the plan's closed list. It spends the
 * model, so it may be refused for billing (spend), has a bucket of its own, and counts in the day's AI limit under a
 * purpose of its own. Where no words come, the answer says so and the draft stands as it was: never an error an
 * owner must read. It turns nothing on and calls nothing at Meta. Owner or operator.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "ad_words",
  spend: true,
  input: AdWordsBodySchema,
  handle: ({ ctx, member, input }) => writeAdWords({ rc: readerContext(ctx, member), userId: ctx.userId }, input),
});
