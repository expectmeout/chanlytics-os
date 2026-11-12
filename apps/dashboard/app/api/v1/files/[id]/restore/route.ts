import { write, workspace } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { restoreFile } from "@/server/files/file";

/**
 * POST /api/v1/files/:id/restore — Undo of a delete (00616, the content redesign's stage 3): for ten minutes after it was
 * deleted, the file is shown again where it was. By the workspace, since a file deleted is no row its member can read; the
 * door asks the settings permission itself, as the delete does.
 *
 * The handle is in src/server/files/file.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: ({ ctx, member }) => restoreFile(ctx, member, requireUuid(ctx.params.id, "file")),
});
