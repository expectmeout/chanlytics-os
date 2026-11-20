import { z } from "zod";
import { read, workspace } from "@/server/shared/route";
import { listSourceFolders } from "@/server/files/sources";

const Query = z.object({
  /** Where the chooser looks: the account's own Drive, its shared drives, what was shared with it, or a folder opened. */
  place: z.enum(["mine", "drives", "shared", "folder"]),
  folder_id: z.string().max(200).optional(),
  page: z.string().max(4000).optional(),
});

/**
 * GET /api/v1/sources/folders?place=mine|drives|shared|folder[&folder_id=…][&page=…] — one level of the folder chooser,
 * folders only, a page of them: `{ folders: [{ id, name }], next_page }`. Only the levels a person opens are read, and
 * no Google key reaches the browser. An owner or a partner.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "settings",
  query: Query,
  handle: ({ ctx, member, input }) => listSourceFolders(ctx, member, input),
});
