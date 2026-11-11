import { z } from "zod";
import { CONTENT_MAX } from "@chanlytics/contracts";
import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { content } from "@/server/readers/content";

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(CONTENT_MAX).optional(),
  before: z.string().min(1).max(100).optional(),
});

/**
 * GET /api/v1/content — Campaigns › Content: what Ask is making, a page of what it made, newest first, each piece with
 * where it was posted, and how many there are in all. `?before=` is the `next` the last page answered; `?limit=` how many,
 * so a page that has scrolled reads what it holds again in one read. Every member reads it. The body is its reader's
 * (readers/content.ts).
 */
export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => (await load(readerContext(ctx, member), content, input)).data,
});
