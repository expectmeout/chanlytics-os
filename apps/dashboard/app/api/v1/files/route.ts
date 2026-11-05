import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { files } from "@/server/readers/files";

/**
 * GET /api/v1/files — Settings › Files: what the workspace keeps, newest first, and how many more it may (decision 0099).
 * Every member reads it. The body is its reader's (readers/files.ts), which Ask reads too.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), files, undefined)).data,
});
