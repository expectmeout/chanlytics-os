import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { watchSourceFolder } from "@/server/files/sources";

/**
 * POST /api/v1/sources/watch — `{ folder_id, include_subfolders, instead }`: the folder is watched from now on, and what
 * lands in it is the business's own, so it goes straight into the Library. `instead` stops the folder watched until now
 * first (one folder a workspace); what came in from it stays. An owner or a partner.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.object({
    folder_id: z.string().min(1).max(200),
    include_subfolders: z.boolean(),
    instead: z.boolean(),
  }),
  handle: ({ ctx, member, input }) => watchSourceFolder(ctx, member, input),
});
