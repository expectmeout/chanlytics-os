import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { coldEmailNote } from "@/server/readers/cold-email-note";

/**
 * GET /api/v1/settings/reach-out/note: Cold email's one line on Today, or none (the page's read is GET settings/reach-out,
 * too much to ask each time Today opens). Members read, as every member reads Today; RLS scopes; counted with the other
 * aggregate reads, since Today asks it again as the day moves. The body is its reader's.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), coldEmailNote, undefined)).data,
});
