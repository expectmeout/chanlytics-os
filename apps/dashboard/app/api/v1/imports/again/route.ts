import { workspace, write } from "@/server/route";
import { ImportAgainBody, importAgain } from "@/server/people/import-again";

/**
 * POST /api/v1/imports/again -- { source }: Try again on a source of the imports ledger that stopped (decision 0073,
 * R23), from the first run's Bringing it in, Today's Brought in and Connections. Whoever may change the settings, in
 * the settings bucket: it starts again what a connect started. server/people/import-again.ts is everything after.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: ImportAgainBody,
  handle: ({ ctx, member, input }) => importAgain(member.tenantId, ctx.userId, input),
});
