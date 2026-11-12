import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { contentNote } from "@/server/readers/content";

/**
 * GET /api/v1/content/note: Content's one line on Today, or none (the content redesign's stage 3; the page's read is GET
 * content, too much to ask each time Today opens). Members read, as every member reads Today; RLS scopes; counted with the
 * other aggregate reads, since Today asks it again as the day moves. The body is its reader's (readers/content.ts).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), contentNote, undefined)).data,
});
