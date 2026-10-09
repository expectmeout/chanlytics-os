/**
 * The headline: what Today reads of a period (the period line at the foot of the day's card and the two rows of Worth a look
 * that read Reports), and nothing else of the report. The report is a series of days over two periods; Today wants six counts,
 * one share and the calendar's line. `headlineOf` (reports.ts) sums them where the series is, from the facts the page's view
 * model is built from; `toHeadlineVM` words them. The Overview reads it too from phase C (the lenses spec, §6.5).
 */
import { toBookingReportVM, type BookingReportDto, type BookingReportVM } from "./booking-report";
import type { ReportPeriodId } from "./report-periods";
import { periodWords, rangeLabelOf, type ReportDto } from "./reports";
import { compareWords } from "./report-tiles";

/** What `GET reports/headline` answers: counts over the period, and the calendar's line over the same days. */
export interface ReportHeadlineDto {
  /** The period asked for, as a request names it. */
  period: ReportPeriodId;
  /** The days it is: Month is the days since the 1st in the workspace's zone, today included. */
  days: number;
  /** Nobody wrote or called in the period. */
  empty: boolean;
  /** Customer messages in the period. */
  messages_in: number;
  /** Customer messages the period before; null where nothing reached the business then, so there is nothing to compare with. */
  messages_before: number | null;
  /** Who answered the period's customer messages, and the ones nobody did. */
  answered_ai: number;
  answered_you: number;
  unanswered: number;
  /** The receptionist's part of the answered, 0..1; null with nothing answered. */
  answered_share: number | null;
  /** Connected calls in the period. */
  calls: number;
  /** Asked, then booked, over the same days; null where it could not be counted at all. */
  booking: BookingReportDto | null;
}

/** What Today says of the period, in the words it says them: the one view model its line and its leaks read. */
export interface ReportHeadlineVM {
  period: ReportPeriodId;
  days: number;
  /** The period as a sentence takes it: "7 days", "30 days", "5 days" (Month on the 5th). */
  rangeLabel: string;
  /** How the period's sentences begin: "Last 7 days" (Reports' own words, periodWords). */
  lead: string;
  empty: boolean;
  /** The period's customer messages and how they compare with the period before, in counts ("up from 99"); null with nothing to compare. */
  messages: { total: number; compare: string | null };
  /** Who answered them, and the receptionist's share (0..1; null with nothing answered). */
  answered: { ai: number; you: number; none: number; share: number | null };
  calls: number;
  /** Asked, then booked: absent (`present` false) without a calendar to count against. */
  booking: BookingReportVM;
}

/** Whether the database answered a report (`report_series`): the series and the days it counts, and not its own `{ error }`. */
export function isReportDto(answer: unknown): answer is ReportDto {
  return (
    typeof answer === "object" &&
    answer !== null &&
    "series" in answer &&
    Array.isArray(answer.series) &&
    "days" in answer &&
    typeof answer.days === "number"
  );
}

export function toHeadlineVM(dto: ReportHeadlineDto): ReportHeadlineVM {
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
      compare: compareWords(dto.messages_in, dto.messages_before ?? 0, rangeLabel, dto.messages_before !== null),
    },
    answered: { ai: dto.answered_ai, you: dto.answered_you, none: dto.unanswered, share: dto.answered_share },
    calls: dto.calls,
    booking: toBookingReportVM(dto.booking),
  };
}
