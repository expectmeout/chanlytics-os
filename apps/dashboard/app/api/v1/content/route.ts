import { z } from "zod";
import { CONTENT_MAX, CONTENT_VIEWS } from "@chanlytics/contracts";
import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { content } from "@/server/readers/content";

/** What a page of Content is asked for: the view of Made, where the last page ended, and how many. */
const Asked = z.object({
  view: z.enum(CONTENT_VIEWS).optional(),
  before: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(CONTENT_MAX).optional(),
  about: z.string().max(80).optional(),
});

/**
 * GET /api/v1/content — Campaigns › Content: what Ask is making, a page of what it made, newest first, each piece with
 * where it was posted, and how many there are in all. `?view=` narrows Made to what needs the owner, what is being made,
 * what waits for its time or what is up (each but the first two a page of lines, one post each), or what was set aside; `?about=`
 * finds All by its words (a piece's name, what Ask's look saw or heard in it); `?before=` is the `next` the
 * last page answered; `?limit=` how many, so a page that has scrolled reads what it holds again in one read. Every member reads it. The body is its reader's
 * (readers/content.ts).
 */
export const GET = read({
  scope: workspace,
  query: Asked,
  handle: async ({ ctx, member, input }) => (await load(readerContext(ctx, member), content, input)).data,
});
