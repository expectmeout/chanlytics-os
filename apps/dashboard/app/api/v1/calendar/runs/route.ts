import { z } from "zod";
import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { calendarRuns } from "@/server/readers/calendar";

const Query = z.object({
  /** YYYY-MM-DD; the Monday of today when absent. */
  from: z.string().optional(),
  /** How many days from there; seven when absent, nine weeks at most. */
  days: z.string().optional(),
  /** "today", with no `from`: the board's own window, the weeks around the business's today, as GET calendar reads it. */
  around: z.enum(["today"]).optional(),
});

/**
 * GET /api/v1/calendar/runs?from=YYYY-MM-DD&days=63 — campaigns over a span of the Calendar (contracts calendar-runs.ts):
 * the one-off sends and the campaigns' runs that fall in it with what each sent, every campaign's schedule with its
 * class's mode, and whether the workspace is paused, from which the board draws its marks. Its own read, beside GET
 * calendar and never inside it: that one is Today's day and the document head's first read, and a send must never count
 * as taken time or re-read the calendar's feed. Read-only, whoever reads; counted with the other aggregate reads.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    const { data } = await load(rc, calendarRuns, {
      from: input.from ?? null,
      days: Number(input.days ?? 7),
      around: input.around ?? null,
    });
    return data;
  },
});
