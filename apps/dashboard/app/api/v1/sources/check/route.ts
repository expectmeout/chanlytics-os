import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { checkSourceNow } from "@/server/files/sources";

/**
 * POST /api/v1/sources/check — the watched folder is looked at now, where no look already waits or runs:
 * `{ scheduled }`. An owner or a partner.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.object({}),
  handle: ({ ctx, member }) => checkSourceNow(ctx, member),
});
