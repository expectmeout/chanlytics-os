import { z } from "zod";
import { FILES_MAX, FILE_SHELVES } from "@chanlytics/contracts";
import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { files } from "@/server/readers/files";

const Query = z.object({
  shelf: z.enum(FILE_SHELVES).optional(),
  limit: z.coerce.number().int().min(1).max(FILES_MAX).optional(),
  before: z.string().min(1).max(100).optional(),
});

/**
 * GET /api/v1/files — Settings › Files: a page of one shelf, newest first, and how the whole library stands (decision 0099).
 * `?shelf=` says which, and left out, or left empty by a change, the page answers where the library opens; `?before=` is the `next`
 * the last page answered; `?limit=` how many, so a page that has scrolled reads what it holds again in one read. Every member reads
 * it. The body is its reader's (readers/files.ts).
 */
export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => (await load(readerContext(ctx, member), files, input ?? {})).data,
});
