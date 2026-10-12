import { z } from "zod";
import { read, workspace } from "@/server/route";
import { weekFrom } from "@/server/calendar/calendar-week";
import { load, readerContext } from "@/server/readers";
import { sources } from "@/server/readers/calendar";

const Query = z.object({
  /** YYYY-MM-DD; the Monday of today when absent. */
  from: z.string().optional(),
  /** How many days from there; seven when absent. */
  days: z.string().optional(),
  /**
   * "today", with no `from`: the board's own window, the weeks around the business's today (contracts windowFor), by
   * the business's clock. What the page opens on: a read that names no day of the browser's, so the document's head can
   * start it before anything knows the zone (contracts PREFETCH_READS).
   */
  around: z.enum(["today"]).optional(),
  /** "1": the calendar itself rather than the few minutes' cache -- the board's Refresh, never more often than the loader's floor. */
  fresh: z.enum(["1"]).optional(),
});

/**
 * GET /api/v1/calendar?from=YYYY-MM-DD&days=7 — the calendar as the
 * receptionist reads it: what the feed says is taken, the hours and
 * closures, and the windows a caller would be offered, for one span of
 * days by the business's clock. `from` defaults to the Monday of today, and
 * `around=today` asks for the board's nine weeks around it instead.
 * Read-only, whoever reads: it adds nobody to People (decision 0047, lane 6; 0034 section 4). The people an
 * appointment names are put in People by the hourly sweep and by the booking email's reader, and a visit whose person
 * the board cannot match offers "Add to People" (POST contacts). The feed's address never leaves the server. Counted
 * with the other aggregate reads.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    // The calendar's one read (readers/calendar.ts), then the board assembled from it: one clock, the read's, for the
    // span, the people and the windows.
    const s = (
      await load(rc, sources, {
        from: input.from ?? null,
        days: Number(input.days ?? 7),
        fresh: input.fresh === "1",
        around: input.around ?? null,
      })
    ).data;
    return { calendar: weekFrom(s, s.people, rc.now) };
  },
});
