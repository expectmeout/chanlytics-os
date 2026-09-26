import { z } from "zod";
import { read, workspace } from "@/server/route";
import { AppError, REPORT_RANGES } from "@chanlytics/contracts";
import { load, readerContext } from "@/server/readers";
import { report } from "@/server/readers/report";

const Query = z.object({
  /** 7, 30 or 90; thirty by default. */
  days: z.string().optional(),
});

/**
 * GET /api/v1/reports?days=7|30|90 — the receptionist's numbers, day by day.
 *
 * One SECURITY INVOKER function computes the series in the tenant's own time
 * zone under the caller's RLS. The payload spans two periods so the client can
 * show deltas without a second round trip. Only the three presets are
 * accepted: a report that anyone can point at a different window than the
 * one beside it stops agreeing with itself. Counted with the other aggregate
 * reads. The body is its reader's (readers/report.ts), which Ask reads too.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const days = Number(input.days ?? 30);
    if (!REPORT_RANGES.some((r) => r.days === days)) {
      throw new AppError("validation", "days must be 7, 30 or 90.");
    }
    return (await load(readerContext(ctx, member), report, { days })).data;
  },
});
