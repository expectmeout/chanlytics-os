import { toTodayVM } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { today } from "@/server/readers/today";

/**
 * GET /api/v1/today — the day as the Today page draws it, composed once on the server (the phone app's PRD, PR 9).
 *
 * The browser composes Today from five reads (legacy-bridge/surface-data.ts, todayOverride); Ask reads the same five
 * through one reader (readers/today.ts) and composes the same view model. A native screen has no page to compose
 * for it, so it asks here and draws what comes back: every sentence is contracts toTodayVM's, the one the page and
 * Ask already say, and the calls and the searches are additive here as they are there (a failed read is null, and
 * the view model says so). Counted with the other aggregate reads; any member may read it.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  handle: async ({ ctx, member }) => {
    const rc = readerContext(ctx, member);
    const { metrics, conversations, escalations, calls, searches } = (await load(rc, today, undefined)).data;
    return { today: toTodayVM(metrics, conversations, escalations, calls, rc.now, searches) };
  },
});
