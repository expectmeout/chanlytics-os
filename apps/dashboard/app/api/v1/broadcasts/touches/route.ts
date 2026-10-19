import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { broadcastTouches } from "@/server/readers/broadcasts";

/**
 * GET /api/v1/broadcasts/touches — { touched_at }: who a run of any kind reached from a week ago on, or is due to, and
 * when -- the composer says how many of an audience hear from one within a week of the time it picks, either side. Touches
 * that cannot be read are null, and the composer says nothing, rather than a list of nobody. Read where who an audience
 * reaches is counted (the audiences surface), never with Sent's runs, which the Inbox waits for. The body is its reader's
 * (readers/broadcasts.ts).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), broadcastTouches, undefined)).data,
});
