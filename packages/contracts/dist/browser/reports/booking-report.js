import { BOOKED_NEEDS_A_LINK } from "../setup/calendar-source.js";
import { plural } from "../shared/words.js";
export const BOOKED_NEEDS_TODAY = "It follows people as they stand today, so it is only true of a period that ends today.";
export function toBookingReportVM(dto) {
  if (!dto || dto.calendar === "none")
    return {
      present: false,
      calendar: "none",
      headline: "\u2014",
      sub: BOOKED_NEEDS_A_LINK,
      words: "",
      pct: null,
      asked: 0,
      booked: 0,
      unbooked: 0,
      rest: ""
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
      rest: ""
    };
  if (dto.calendar === "unavailable")
    return {
      present: false,
      calendar: "unavailable",
      headline: "\u2014",
      sub: "Your calendar could not be read.",
      words: "",
      pct: null,
      asked: dto.asked,
      booked: 0,
      unbooked: 0,
      rest: ""
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
      rest: ""
    };
  const pct = Math.round(dto.booked / dto.asked * 100);
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
    rest: unbooked === 0 ? `Everyone who asked in the last ${plural(dto.days, "day")} has booked.` : `${unbooked} of the ${dto.asked} who asked ${unbooked === 1 ? "has" : "have"} nothing on the calendar yet.`
  };
}
