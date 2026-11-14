import type { TodayPeopleDto } from "@chanlytics/contracts";
import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { todayPeople } from "@/server/readers/today";

/**
 * GET /api/v1/today/people — what Today draws from People, in Today's first read (Today knows its shape at its first draw,
 * 13 Nov 2026; contracts today/people.ts): People's lists counted, how many are in People, and the people Ask found's checks
 * and To do's steps due can name, each as GET contacts answers them. The page makes their rows as People's page does, so
 * Ask found and the steps stand in Today's first draw and say what People's book says once it is in. Or, where People holds
 * more than one page, how many there are, and the page waits for the book. Counted with the other aggregate reads; any
 * member may read it, as any member may read People.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  handle: async ({ ctx, member }): Promise<{ people: TodayPeopleDto }> => ({
    people: (await load(readerContext(ctx, member), todayPeople, undefined)).data,
  }),
});
