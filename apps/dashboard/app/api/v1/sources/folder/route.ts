import { z } from "zod";
import { read, workspace } from "@/server/shared/route";
import { readSourceFolder } from "@/server/files/sources";

/**
 * GET /api/v1/sources/folder?id=… — one Google Drive folder as the connected account names it: `{ folder: { id, name } }`,
 * or `{ folder: null, shut }` where that account cannot open it (`shut`) or Google could not be asked. What a pasted
 * folder link is read to once Drive is connected, so its card says which folder it is. An owner or a partner.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "settings",
  query: z.object({ id: z.string().min(1).max(200) }),
  handle: ({ ctx, member, input }) => readSourceFolder(ctx, member, input.id),
});
