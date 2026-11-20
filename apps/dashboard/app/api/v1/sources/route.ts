import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { footage } from "@/server/readers/footage";

/**
 * GET /api/v1/sources — where the workspace's watched folder stands: the Google account it is read through, the folder,
 * its files counted where they stand, whether connecting is offered here and whether this member may. The body is its
 * reader's (readers/footage.ts), which Settings, Content, the Library and AI all read.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), footage, undefined)).data,
});
