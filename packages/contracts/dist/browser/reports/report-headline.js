import { toBookingReportVM } from "./booking-report.js";
import { periodWords, rangeLabelOf } from "./reports.js";
import { compareWords } from "./report-tiles.js";
export function isReportDto(answer) {
  return typeof answer === "object" && answer !== null && "series" in answer && Array.isArray(answer.series) && "days" in answer && typeof answer.days === "number";
}
export function toHeadlineVM(dto) {
  const rangeLabel = rangeLabelOf(dto.days);
  return {
    period: dto.period,
    days: dto.days,
    rangeLabel,
    // Today reads a period by name, never days a member picked: it ends today.
    lead: periodWords(dto.days, null).now,
    empty: dto.empty,
    messages: {
      total: dto.messages_in,
      compare: compareWords(dto.messages_in, dto.messages_before ?? 0, rangeLabel, dto.messages_before !== null)
    },
    answered: { ai: dto.answered_ai, you: dto.answered_you, none: dto.unanswered, share: dto.answered_share },
    calls: dto.calls,
    booking: toBookingReportVM(dto.booking)
  };
}
