import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { AdPeopleQuery, adPeople } from "@/server/readers/ads-page";

/**
 * GET /api/v1/ads/people?ad=<id>|unnamed&offset= — the people one ad brought in the page's thirty days, newest first,
 * fifty at a time, each with whether they have booked since; `unnamed` is the people from an ad Chanlytics cannot
 * name. The body is its reader's (readers/ads-page.ts).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: AdPeopleQuery,
  handle: async ({ ctx, member, input }) => (await load(readerContext(ctx, member), adPeople, input)).data,
});
