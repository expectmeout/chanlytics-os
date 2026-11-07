import type { TodayReadDto } from "@chanlytics/contracts";
import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { appointmentWord } from "@/server/readers/facts";
import { findDoneToday, getSinceYouLooked, today } from "@/server/readers/today";

/**
 * GET /api/v1/today — the day's read whole, as the Today page makes the day from it (Today in three zones, 2 Nov 2026,
 * the build's lane L5: one request where the page made six; surfaces/today/surface.ts).
 *
 * The page makes the day from it (contracts toTodayVM) and again each minute by the clock with no read, so it is handed
 * the read and not the day. Ask reads the same reader (readers/today.ts) and makes the same day, so the two cannot count
 * it two ways. Beside the reader, what the page alone says and Ask's day does not: how many things were done today, what
 * happened since this member last looked, and the workspace's word for a visit (facts.ts appointmentWord, "appointment"
 * where it cannot be read). The calls, the searches, the runs, the held threads, the leads who tried, what was done today
 * and what happened since are additive: a failed read is null, and the day stands without it. Counted with the other aggregate
 * reads; any member may read it.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  handle: async ({ ctx, member }): Promise<{ read: TodayReadDto }> => {
    const rc = readerContext(ctx, member);
    const [r, done, since, word] = await Promise.all([
      load(rc, today, undefined).then((t) => t.data),
      findDoneToday(rc),
      getSinceYouLooked(rc),
      load(rc, appointmentWord, undefined).then((w) => w.data),
    ]);
    return {
      read: {
        metrics: r.metrics,
        conversations: r.conversations,
        escalations: r.escalations,
        calls: r.calls,
        searches: r.searches,
        runs: r.runs,
        held_threads: r.heldThreads,
        previews_tried: r.previewsTried,
        done_today: done,
        since,
        word,
      },
    };
  },
});
