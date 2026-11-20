import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { askForOlderSourceFiles } from "@/server/files/sources";

/**
 * POST /api/v1/sources/older — the watched folder's older files, asked for (the footage screens' call 7): what its first
 * look left in Drive comes in by itself, at the day's pace: `{ asked }`. Pressed on AI's card, never by itself. An owner
 * or a partner.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.object({}),
  handle: ({ ctx, member }) => askForOlderSourceFiles(ctx, member),
});
