import { read } from "@/server/shared/route";
import { fileScope } from "@/server/files/file";
import { load, readerContext } from "@/server/shared/reader";
import { pieceResults } from "@/server/readers/results";

/**
 * GET /api/v1/files/[id]/results: a piece's How it did and What it brought (00696; the content loop PRD's 21.3): each
 * placement's newest numbers as its place gave them, a missing one said, and the people its posts brought with what
 * their visits are put down to. Any member. The body is its reader's (readers/results.ts pieceResults).
 */
export const GET = read({
  scope: fileScope,
  handle: async ({ ctx, member, row }) => (await load(readerContext(ctx, member), pieceResults, { file: row.id })).data,
});
