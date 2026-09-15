import { z } from "zod";
import { read, workspace } from "@/server/route";
import { calendarWeek } from "@/server/calendar";

const Query = z.object({
  /** YYYY-MM-DD; the Monday of today when absent. */
  from: z.string().optional(),
  /** How many days from there; seven when absent. */
  days: z.string().optional(),
  /** "1": the calendar itself rather than the few minutes' cache -- the board's Refresh, never more often than the loader's floor. */
  fresh: z.enum(["1"]).optional(),
});

/**
 * GET /api/v1/calendar?from=YYYY-MM-DD&days=7 — the calendar as the
 * receptionist reads it: what the feed says is taken, the hours and
 * closures, and the windows a caller would be offered, for one span of
 * days by the business's clock. `from` defaults to the Monday of today.
 * Read-only; the feed's address never leaves the server. Counted with the
 * other aggregate reads.
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const from = input.from ?? null;
    const days = Number(input.days ?? 7);
    // An owner or operator opening the board puts the people its appointments
    // name in People; a viewer's read changes nothing.
    const canAct = member.role === "owner" || member.role === "operator";
    const fresh = input.fresh === "1";
    return { calendar: await calendarWeek(ctx, member.tenantId, { from, days }, new Date(), { canAct, fresh }) };
  },
});
