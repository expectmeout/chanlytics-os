import { write, workspace } from "@/server/shared/route";
import { readerContext } from "@/server/shared/reader";
import { draftAd } from "@/server/ads/draft";
import { AdDraftBodySchema } from "@/server/ads/draft-shape";

/**
 * POST /api/v1/ads/draft — the workspace's draft of a new ad, picked, judged and kept (the Ads plan's 4.6, 5.1 and
 * 6.2). With no draft in the body it answers the kept one, or a fresh one where none is kept: the service, the picture,
 * the area, the amount and the end, each picked by a rule in code, or the one thing missing where none can be written
 * yet. With one, it answers that draft as it stands now, with everything that would stop it before Turn on, each a
 * line with its one act. The draft it answers is kept as the workspace's (ad_draft_keep), and one an operator or a
 * partner leaves rings the owner's bell. With the owner's most (G6), that is kept on the ad account first. It calls no
 * model and nothing at Meta. Owner or operator; Turn on is the owner's alone, and is its own route.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "aggregate",
  input: AdDraftBodySchema,
  handle: ({ ctx, member, input }) => draftAd(readerContext(ctx, member), input),
});
