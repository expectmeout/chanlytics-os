import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { removeSourceFiles } from "@/server/files/sources";

/**
 * POST /api/v1/sources/remove — what the watched folder brought, and nothing used, leaves the Library:
 * `{ removed, kept }`. Pressed with Stop watching or Disconnect, never by itself; the originals in Drive are not
 * touched. An owner or a partner.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.object({}),
  handle: ({ ctx, member }) => removeSourceFiles(ctx, member),
});
