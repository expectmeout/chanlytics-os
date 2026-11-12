import { z } from "zod";
import { FILES_MAX } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { keepFiles } from "@/server/files/file";

/**
 * POST /api/v1/files/keep — `{ ids, to? }`: the Found online list's press. What waits, among these, is filed (Keep), or set
 * aside where `to` says so (Not mine, 00619); anything else named is left as it is. Answers how many moved. Whoever may change
 * the workspace's settings; the door asks too.
 *
 * The handle is in src/server/files/file.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.object({ ids: z.array(z.uuid()).min(1).max(FILES_MAX), to: z.enum(["filed", "set_aside"]).optional() }),
  handle: ({ ctx, input, member }) => keepFiles(ctx, member, input),
});
