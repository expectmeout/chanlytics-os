import { write, workspace } from "@/server/shared/route";
import { readerContext } from "@/server/shared/reader";
import { draftAd } from "@/server/ads/draft";
import { AdDraftBodySchema } from "@/server/ads/draft-shape";

/**
 * POST /api/v1/ads/draft — a new ad's draft, picked and judged (the Ads plan's 4.6 and 5.1). With no draft in the
 * body it answers a fresh one: the service, the picture, the area, the amount and the end, each picked by a rule in
 * code, or the one thing missing where none can be written yet. With one, it answers that draft as it stands now,
 * with everything that would stop it before Turn on, each a line with its one act. It keeps nothing, calls no model
 * and nothing at Meta: a POST only because the draft is the screen's to hold. Owner or operator; Turn on is the
 * owner's alone, and is its own route.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "aggregate",
  input: AdDraftBodySchema,
  handle: ({ ctx, member, input }) => draftAd(readerContext(ctx, member), input),
});
