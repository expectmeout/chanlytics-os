import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { disconnectAdAccountNow } from "@/server/ads/account";

/**
 * POST /api/v1/ads/account/disconnect — the owner disconnects their ad account (decision 0050, call 8, as amended:
 * never refused). With `pause`, every running ad is paused first and the account is disconnected only where Meta
 * confirmed each pause: otherwise the answer is `not_paused` with the ads' names, and nothing was disconnected, so the
 * owner goes on knowing they keep running. Without it the account is let go as it stands. Chanlytics stops reading
 * and its token is dropped at once; the ads and what they brought stay, listed as left in Meta. The owner alone.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  input: z.object({ pause: z.boolean() }),
  handle: ({ ctx, member, input }) => disconnectAdAccountNow(ctx, member, input.pause),
});
