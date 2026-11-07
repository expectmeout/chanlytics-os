import { read } from "@/server/shared/route";
import { fileScope, playFile } from "@/server/files/file";

/**
 * GET /api/v1/files/:id/play — `{ player_url, expires_at }`: the video platform's player for one of the workspace's videos, under
 * a token signed on the edge for an hour. The sheet asks once when it opens; a tile never does, since its poster is ours. The
 * file is the row, read under RLS, so one the caller cannot see is a 404.
 *
 * The handle is in src/server/files/file.ts.
 */
export const GET = read({
  scope: fileScope,
  handle: ({ ctx, row }) => playFile(ctx, row),
});
