import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { adsPage } from "@/server/readers/ads-page";

/**
 * GET /api/v1/ads/page — Campaigns › Ads once an account is or was connected: each ad Chanlytics holds, with what its
 * platform says it spent in the last thirty days and who Chanlytics counts it brought and booked, and the people from
 * an ad it cannot name. Null where no account was ever connected. Counted whole in the database, over the same people
 * Reports › People counts under "An ad". The body is its reader's (readers/ads-page.ts).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), adsPage, undefined)).data,
});
