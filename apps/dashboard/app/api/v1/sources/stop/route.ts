import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { stopSourceWatch } from "@/server/files/sources";

/**
 * POST /api/v1/sources/stop — the folder is no longer watched: `{ stopped }`. Google Drive stays connected, and what
 * came in stays. An owner or a partner.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.object({}),
  handle: ({ ctx, member }) => stopSourceWatch(ctx, member),
});
