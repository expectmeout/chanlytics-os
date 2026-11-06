import { z } from "zod";
import { FILES_MAX } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { keepFiles } from "@/server/files/file";

/**
 * POST /api/v1/files/keep — `{ ids }`: the Inbox's one press. What waits, among these, is filed; anything else named is left as
 * it is. Answers how many moved. Whoever may change the workspace's settings; the door asks too.
 *
 * The handle is in src/server/files/file.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.object({ ids: z.array(z.uuid()).min(1).max(FILES_MAX) }),
  handle: ({ ctx, input, member }) => keepFiles(ctx, member, input),
});
