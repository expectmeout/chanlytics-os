import { write, workspace } from "@/server/shared/route";
import { AdTurnOnBodySchema } from "@/server/ads/draft-shape";
import { requestTurnOn } from "@/server/ads/turn-on";

/**
 * POST /api/v1/ads/turn-on — the owner turns an ad on (decision 0050, calls 3 and 5; the Ads plan's 4.7). The press
 * carries what it showed (the most the ad can cost, the end, the picture, the area, the words) and its own key; the kept
 * draft is judged afresh and every check runs again, so a press drawn from anything else is refused, and the same press
 * twice makes one ad. The ad is then set up at Meta, paused, read back and compared before anything is switched on.
 * The owner alone, on a session the Auth server says is still live, while AI runs.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  fresh: true,
  input: AdTurnOnBodySchema,
  handle: ({ ctx, member, input }) => requestTurnOn(ctx, member, input),
});
