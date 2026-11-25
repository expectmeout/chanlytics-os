import { read, workspace } from "@/server/shared/route";
import { readSourceLeaving } from "@/server/files/sources";

/**
 * GET /api/v1/sources/leaving — what a stop and a disconnect say before the press: `{ files, away, used }`, how many
 * photos and videos came from the watched folder and stay, how many clips are kept in Drive right now, and how many a
 * post or a video used. An owner or a partner.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: ({ ctx, member }) => readSourceLeaving(ctx, member),
});
