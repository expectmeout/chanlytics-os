import "server-only";
import { z } from "zod";
import { REPORT_RANGES, toBookingReportVM, toDealReportVM, toReportVM } from "@chanlytics/contracts";
import { load } from "../../../readers";
import { report } from "../../../readers/report";
import { defineRead, unlessNotFound, type ToolContext } from "../context";

/** The counts of days the table offers (Month is no count: it is the days since the 1st, and the page's own), as the model is told them. */
const PERIOD_DAYS = REPORT_RANGES.flatMap((r) => (r.days === null ? [] : [r.days]));
const PERIOD_DAYS_SAID = `${PERIOD_DAYS.slice(0, -1).join(", ")} or ${PERIOD_DAYS.at(-1)}`;

async function getReport(t: ToolContext, input: { days: number }): Promise<unknown> {
  // The schema below refuses any other count, so the turn never gets here with one.
  const days = Number(input.days) || 30;
  // The Reports page's own read (readers/report.ts), once a turn: the series, then the booking line and the deals
  // beside it, with how the workspace's customers buy taken from the turn (ledger #1). A report the function will not
  // answer is the reader's 404, said as the tool always said it.
  const r = await unlessNotFound(load(t.rc, report, { days }));
  if (!r) return { error: "report unavailable" };
  // The page's own builders over the page's own payload, as the bridge applies them (legacy-bridge/surface-data.ts).
  const vm = toReportVM(r.data.report, { profile: r.data.profile });
  const booking = r.data.booking ? toBookingReportVM(r.data.booking) : null;
  const deals = toDealReportVM(r.data.deals, vm.rangeLabel);
  return {
    range: vm.rangeLabel,
    empty: vm.empty,
    tiles: vm.tiles.map((x) => ({ label: x.label, value: x.value, meta: x.meta, change: x.delta?.text ?? null })),
    answered: vm.answered.totals,
    // The median and p90 include the hold the owner set; `hold` splits the replies against it, null where none waited one.
    reply_time: {
      median: vm.replyTime.medianLabel,
      p90: vm.replyTime.p90Label,
      count: vm.replyTime.count,
      hold: vm.replyTime.hold,
    },
    calls: { total: vm.calls.total, minutes: vm.calls.minutes, voicemail: vm.calls.voicemail },
    new_people: vm.people.total,
    escalation_reasons: vm.reasons.slice(0, 5).map((r) => `${r.label}: ${r.value}`),
    by_day: vm.answered.points
      .slice(-14)
      .map((p) => ({ day: p.short, in: p.in, receptionist: p.ai, you: p.you, unanswered: p.none })),
    // Asked, then booked: the page's one conversion line, its headline ("12 of 40 booked", "Nobody asked") where the
    // calendar was read, else the page's own sentence for why there is nothing to count. Null: that line's read failed.
    booking: booking ? (booking.present ? booking.headline : booking.sub) : null,
    // The Deals section as the page draws it, where it draws one (deals are on and one was recorded): the cohort's
    // headline, what became of its proposals, the lines beside the bars, and the clients now. Null where it draws none.
    deals: deals.present
      ? {
          headline: deals.headline,
          outcomes: (deals.outcomes?.rows ?? []).map((o) => `${o.label}: ${o.value}`),
          lines: deals.lines.map((l) => l.text),
          stock: deals.stock,
        }
      : null,
  };
}

export const reportTool = defineRead({
  name: "report",
  description: `The Reports page for the last ${PERIOD_DAYS_SAID} days: messages answered by the receptionist, by a person and left unanswered, the median and p90 reply time (both include the hold the owner set before a reply goes out; reply_time.hold splits the replies against it: with no hold, as the hold ended, or later, and the most any took past it), calls and their minutes, new people, the escalation reasons, the change against the period before, a by-day series, the booking line (asked, then booked) where the calendar is read, and the Deals section where deals are on. Call it for how a period went or for a trend; the today tool has the day itself and its counts, and the Reports page on screen already holds this. days takes ${PERIOD_DAYS_SAID} and nothing else. An empty period says so in empty; a range the report cannot answer is an error, said in words.`,
  // The table's counts as literals, not a number: the schema refuses 8, and says the ones it takes.
  input: z.object({ days: z.literal(PERIOD_DAYS) }),
  label: "Reading Reports",
  run: getReport,
});
