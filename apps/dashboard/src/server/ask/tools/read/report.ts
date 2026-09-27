import "server-only";
import { z } from "zod";
import { REPORT_RANGES, toBookingReportVM, toDealReportVM, toReportVM } from "@chanlytics/contracts";
import { load } from "../../../readers";
import { report } from "../../../readers/report";
import { defineRead, unlessNotFound, type ToolContext } from "../context";

async function getReport(t: ToolContext, input: { days: number }): Promise<unknown> {
  const days = Number(input.days) || 30;
  if (!REPORT_RANGES.some((r) => r.days === days)) return { error: "days must be 7, 30 or 90" };
  // The Reports page's own read (readers/report.ts), once a turn: the series, then the booking line and the deals
  // beside it, with how the workspace's customers buy taken from the turn (ledger #1). A report the function will not
  // answer is the reader's 404, said as the tool always said it.
  const r = await unlessNotFound(load(t.rc, report, { days }));
  if (!r) return { error: "report unavailable" };
  // The page's own builders over the page's own payload, as the bridge applies them (legacy-bridge/surface-data.ts).
  const vm = toReportVM(r.data.report);
  const booking = r.data.booking ? toBookingReportVM(r.data.booking) : null;
  const deals = toDealReportVM(r.data.deals, vm.rangeLabel);
  return {
    range: vm.rangeLabel,
    empty: vm.empty,
    tiles: vm.tiles.map((x) => ({ label: x.label, value: x.value, meta: x.meta, change: x.delta?.text ?? null })),
    answered: vm.answered.totals,
    reply_time: { median: vm.replyTime.medianLabel, p90: vm.replyTime.p90Label, count: vm.replyTime.count },
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

export const get_report = defineRead({
  name: "get_report",
  description:
    "The Reports page for the last 7, 30 or 90 days: messages answered by the receptionist, by a person and left unanswered, the median and p90 reply time, calls and their minutes, new people, the escalation reasons, the change against the period before, a by-day series, the booking line (asked, then booked) where the calendar is read, and the Deals section where deals are on. Call it for how a period went or for a trend; get_today has the day itself and its counts, and the Reports page on screen already holds this. days takes 7, 30 or 90 and nothing else. An empty period says so in empty; a range the report cannot answer is an error, said in words.",
  // The three periods as literals, not a number: the schema refuses 8, and says the three it takes.
  input: z.object({ days: z.literal([7, 30, 90]) }),
  label: "Reading Reports",
  run: getReport,
});
