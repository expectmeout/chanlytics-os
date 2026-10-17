import { visitRoute } from "../calendar/appointment-key.js";
import { visitDateKey, visitLine } from "../calendar/calendar-people.js";
const ARRIVES = /* @__PURE__ */ new Set(["added", "confirmed"]);
export const VISIT_CHANGES_TOLD = {
  added: "A booking arriving (bookingArriving): told, unless it is the owner's own entry or a calendar's catching up.",
  confirmed: "A proposed one the tool confirmed: told as a booking arriving.",
  cancelled: "Told when the customer cancelled through their booking tool (bookingChanged); a member's cancel is theirs.",
  moved: "Told when the customer moved it through their booking tool; the calendar's moves are the owner's own diary.",
  kept: "A member's word that they came: theirs, not news.",
  missed: "A member's word on a no-show: theirs, not news.",
  vanished: "Gone from the owner's calendar, their own diary: not told, as a feed's rebuild would tell them all.",
  back: "Back on the owner's calendar, their own diary: not told."
};
const ARRIVES_BY = /* @__PURE__ */ new Set(["booking_email", "booking_tool", "calendar_feed"]);
export const CATCH_UP_VISITS = 8;
const NAMED_IN_A_GROUP = 3;
export function feedAdditionIsBooking(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const d = data;
  return d.change === "added" && d.source === "calendar_feed" && d.named === true && d.series === false && d.twin === false && d.first === false;
}
export function bookingArriving(event) {
  if (event.kind !== "appointment.changed" || event.subject_type !== "appointment" || !event.subject_id) return null;
  const data = event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : null;
  if (!data) return null;
  const { change, source, starts_at: startsAt } = data;
  if (typeof change !== "string" || !ARRIVES.has(change)) return null;
  if (typeof source !== "string" || !ARRIVES_BY.has(source)) return null;
  if (source === "calendar_feed" && !feedAdditionIsBooking(data)) return null;
  return {
    appointmentId: event.subject_id,
    via: source,
    startsAt: typeof startsAt === "string" ? startsAt : null
  };
}
const CHANGES = /* @__PURE__ */ new Set(["cancelled", "moved"]);
const CHANGES_BY = /* @__PURE__ */ new Set(["booking_email", "booking_tool"]);
export function bookingChanged(event) {
  if (event.kind !== "appointment.changed" || event.subject_type !== "appointment" || !event.subject_id) return null;
  const data = event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : null;
  if (!data) return null;
  const { change, source, by } = data;
  if (typeof change !== "string" || !CHANGES.has(change)) return null;
  if (typeof source !== "string" || !CHANGES_BY.has(source)) return null;
  if (by !== "service") return null;
  return { appointmentId: event.subject_id, change };
}
const VIA_WORDS = {
  booking_email: "From your booking tool's email",
  booking_tool: "From your booking tool",
  calendar_feed: "From your calendar"
};
const visitDayOf = (v) => visitDateKey(v.start, v.timezone);
export function visitChangeNews(v, change, nowMs) {
  const when = visitLine({ start: v.start, end: v.end, allDay: v.allDay }, v.timezone, nowMs);
  const who = v.who ?? "Someone";
  const cancelled = change === "cancelled";
  return {
    kind: "booking",
    route: visitRoute(v.id, visitDayOf(v)),
    about: { type: "appointment", id: v.id },
    // Said without the workspace's word for an appointment, as visitNews says a booking arriving: a booking is the act.
    subject: (cancelled ? `${who} cancelled their booking` : `${who} moved their booking`).slice(0, 200),
    body: [
      cancelled ? when : `Now ${when}`,
      ...v.service ? [v.service] : [],
      ...cancelled ? ["That time is free again."] : [],
      "",
      VIA_WORDS[v.via]
    ].join("\n"),
    redactedBody: cancelled ? "A booking was cancelled, and nobody could be told." : "A booking was moved, and nobody could be told."
  };
}
function bookedLineOf(v, nowMs) {
  const when = visitLine({ start: v.start, end: v.end, allDay: v.allDay }, v.timezone, nowMs);
  return [v.who ?? "Someone", when, v.service].filter(Boolean).join(" \xB7 ");
}
export function visitNews(visits, nowMs) {
  const sorted = [...visits].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const first = sorted.at(0);
  if (!first) throw new Error("visitNews: nothing booked to tell");
  const route = visitRoute(first.id, visitDayOf(first));
  if (sorted.length === 1) {
    const when = visitLine({ start: first.start, end: first.end, allDay: first.allDay }, first.timezone, nowMs);
    return {
      kind: "booking",
      route,
      about: { type: "appointment", id: first.id },
      // Said without the workspace's word for an appointment, which core's subscriber does not read: a booking is the act.
      subject: (first.who ? `${first.who} booked with you` : "Someone booked with you").slice(0, 200),
      body: [when, ...first.service ? [first.service] : [], "", VIA_WORDS[first.via]].join("\n"),
      redactedBody: "A booking arrived, and nobody could be told."
    };
  }
  const named = sorted.slice(0, NAMED_IN_A_GROUP).map((v) => bookedLineOf(v, nowMs));
  const more = sorted.length - named.length;
  return {
    kind: "booking",
    route,
    about: null,
    subject: `${sorted.length} new bookings on your calendar`,
    body: [...named, ...more > 0 ? [`and ${more} more`] : [], "", VIA_WORDS[first.via]].join("\n"),
    redactedBody: "New bookings arrived on a calendar, and nobody could be told."
  };
}
