import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { chooseAdAccount } from "@/server/ads/account";

const Body = z.object({ external_id: z.string().regex(/^\d{5,32}$/) });

/**
 * POST /api/v1/ads/account/choose — the owner's answer to the card's one question: which of two ad accounts their ads
 * run from. The account is read again at Meta and connected. The owner alone.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  input: Body,
  handle: ({ ctx, member, input }) => chooseAdAccount(ctx, member, input.external_id),
});
