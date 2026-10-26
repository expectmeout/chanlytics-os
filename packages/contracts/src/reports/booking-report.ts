/**
 * Asked, then booked: Reports' one conversion line (the dashboard's bookingReport counts it, readers/report.ts). Of the
 * people who wrote or called in the period, how many have an appointment on the calendar, by the visits' own rule
 * (visit/booked-after-ask.ts visitAnswersAsk, which People's "Asked, never booked" reads too). Its shape on the wire, and
 * every word the page says of it. Out of calendar-people.ts (9 Oct 2026), which is the match of an appointment to a
 * person: this is what Reports says of the count.
 */
import { BOOKED_NEEDS_A_LINK } from "../setup/calendar-source";
import { plural } from "../shared/words";

export interface BookingReportDto {
  /**
   * "ended": the report is of days that ended before today (days a member picked on Reports). The line is counted from
   * people as they stand now (who wrote last, and what is on the calendar), which says nothing true of a month ago, so
   * it is not counted at all for such a period, and says why.
   */
  calendar: "ok" | "unavailable" | "none" | "ended";
  days: number;
  asked: number;
  booked: number;
}

/** Why the booking line is not counted for days that ended before today: it follows people as they stand now. */
export const BOOKED_NEEDS_TODAY =
  "It follows people as they stand today, so it is only true of a period that ends today.";

export interface BookingReportVM {
  /** False without a readable calendar: nothing to count against. */
  present: boolean;
  /** Where the count came from: a calendar that was read, one that could not be read, none connected, or a period
   *  that ended before today, which it is never counted for ("ended"). */
  calendar: "ok" | "unavailable" | "none" | "ended";
  /** "12 of 40 booked" */
  headline: string;
  sub: string;
  /** What the share is of, for a page that draws the share itself (the sub is the share and these words); empty when nothing was counted. */
  words: string;
  pct: number | null;
  asked: number;
  booked: number;
  /** Of the ones who asked, how many still have nothing on the calendar. */
  unbooked: number;
  /** The share's other side, as a sentence of its own: "10 of the 26 who asked have nothing on the calendar yet",
   *  or the good news when everybody booked. Empty when there is nothing to count. */
  rest: string;
}

export function toBookingReportVM(dto: BookingReportDto | null | undefined): BookingReportVM {
  if (!dto || dto.calendar === "none")
    return {
      present: false,
      calendar: "none",
      headline: "—",
      sub: BOOKED_NEEDS_A_LINK,
      words: "",
      pct: null,
      asked: 0,
      booked: 0,
      unbooked: 0,
      rest: "",
    };
  if (dto.calendar === "ended")
    return {
      present: false,
      calendar: "ended",
      headline: "Not counted for these days",
      sub: BOOKED_NEEDS_TODAY,
      words: "",
      pct: null,
      asked: 0,
      booked: 0,
      unbooked: 0,
      rest: "",
    };
  if (dto.calendar === "unavailable")
    return {
      present: false,
      calendar: "unavailable",
      headline: "—",
      sub: "Your calendar could not be read.",
      words: "",
      pct: null,
      asked: dto.asked,
      booked: 0,
      unbooked: 0,
      rest: "",
    };
  if (dto.asked === 0)
    return {
      present: true,
      calendar: "ok",
      headline: "Nobody asked",
      sub: `nobody wrote or called in the last ${plural(dto.days, "day")}`,
      words: "",
      pct: null,
      asked: 0,
      booked: 0,
      unbooked: 0,
      rest: "",
    };
  const pct = Math.round((dto.booked / dto.asked) * 100);
  const words = `of the people who wrote or called in the last ${plural(dto.days, "day")} have booked`;
  const unbooked = dto.asked - dto.booked;
  return {
    present: true,
    calendar: "ok",
    headline: `${dto.booked} of ${dto.asked} booked`,
    sub: `${pct}% ${words}`,
    words,
    pct,
    asked: dto.asked,
    booked: dto.booked,
    unbooked,
    // The other side of the same share, said once: who is still waiting to be
    // given a time. It is the half an owner can do something about.
    rest:
      unbooked === 0
        ? `Everyone who asked in the last ${plural(dto.days, "day")} has booked.`
        : `${unbooked} of the ${dto.asked} who asked ${unbooked === 1 ? "has" : "have"} nothing on the calendar yet.`,
  };
}
