import { z } from "zod";
import { write } from "@/server/shared/route";
import { adScope } from "@/server/shared/verbs";
import { changeAd } from "@/server/ads/presses";

/**
 * POST /api/v1/ads/:id/end — the owner ends a running ad made here for good (decision 0050's endAd and its Routes; the
 * Ads plan's 4.5). Its campaign is archived at Meta, which never turns an archived ad on again and keeps its numbers:
 * there is no Undo. Meta still bills what it already showed. The press carries the version it was drawn from. The
 * owner alone, on a session the Auth server says is live.
 */
export const POST = write({
  scope: adScope,
  role: "owner",
  rate: "settings",
  fresh: true,
  input: z.object({ version: z.number().int().min(1) }),
  handle: ({ ctx, member, row, input }) =>
    changeAd(ctx, member, { adId: row.id, version: input.version, ask: { what: "end" } }),
});
