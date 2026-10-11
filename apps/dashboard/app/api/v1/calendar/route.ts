import { z } from "zod";
import { ROLE_PERMS } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { addPeopleSeen } from "@/server/calendar/people-seen";
import { weekFrom } from "@/server/calendar/calendar-week";
import { load, readerContext } from "@/server/readers";
import { sources } from "@/server/readers/calendar";
import { log } from "@/server/log";

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
    // Whoever acts in the workspace (owner, operator, partner) opening the board puts the people its appointments
    // name in People; a viewer's read changes nothing. The one table, as is_acting_member in SQL.
    const canAct = !!ROLE_PERMS[member.role]?.approve;
    const fresh = input.fresh === "1";
    // The calendar's one read (readers/calendar.ts), then the write a reader never makes (D7): the people the feed
    // names put in People before the board is matched, as calendarWeek does for its callers. One clock, the read's,
    // for the span, the people and the windows.
    const rc = readerContext(ctx, member);
    const s = (await load(rc, sources, { from, days, fresh, around: input.around ?? null })).data;
    const people = [...s.people];
    // Only a feed adds people here: a notice's person was put in People when it was read (booking_read, 00345).
    if (canAct && s.parsed)
      people.push(
        ...(await addPeopleSeen(ctx, member.tenantId, s.parsed.items, s.serviceNames, people, rc.now).catch(
          (e: unknown) => {
            log.error("calendar_people_seen_failed", {
              tenant_id: member.tenantId,
              error: e instanceof Error ? e.message : String(e),
            });
            return [];
          },
        )),
      );
    return { calendar: weekFrom(s, people, rc.now) };
  },
});
