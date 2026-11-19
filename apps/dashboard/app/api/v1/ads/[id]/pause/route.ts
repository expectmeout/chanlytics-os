import { z } from "zod";
import { write } from "@/server/shared/route";
import { adScope } from "@/server/shared/verbs";
import { pressAd } from "@/server/ads/presses";

/**
 * POST /api/v1/ads/:id/pause — the owner pauses an ad (decision 0050, call 1): it stops showing, and Meta still bills what it
 * already showed. The press carries the version it was drawn from, so one drawn from an old read is refused, and the
 * same press twice changes once. Meta is told at once where it will take the change, else as soon as it will. The
 * owner alone, asked again on the edge and by the door that keeps the press.
 */
export const POST = write({
  scope: adScope,
  role: "owner",
  rate: "settings",
  input: z.object({ version: z.number().int().min(1) }),
  handle: ({ ctx, member, row, input }) => pressAd(ctx, member, { op: "pause", adId: row.id, version: input.version }),
});
