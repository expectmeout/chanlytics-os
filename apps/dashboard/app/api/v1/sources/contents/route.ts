import { read, workspace } from "@/server/shared/route";
import { readSourceContents } from "@/server/files/sources";

/**
 * GET /api/v1/sources/contents — `{ rows: [{ state, why, videos, photos, name }] }`: what the watched folder holds that
 * is not in the Library, counted by where it stands and why (waiting, passed over, not brought in, only listed). What
 * the folder's sheet lists, read as it opens.
 */
export const GET = read({
  scope: workspace,
  handle: ({ ctx, member }) => readSourceContents(ctx, member),
});
