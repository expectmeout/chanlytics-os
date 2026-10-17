import { serviceNamedIn } from "./service-offer.js";
import { matchPerson } from "./calendar-people.js";
import { bookingCopyTest } from "./booking-notice.js";
import { appointmentKeyOf, recordIdOf } from "./appointment-key.js";
import { isConsultationTitle } from "../deals/deal-consultations.js";
export const APPOINTMENT_SOURCES = [
  "calendar_feed",
  "booking_email",
  "booking_tool",
  "person",
  "receptionist"
];
export const APPOINTMENT_STATUSES = ["proposed", "booked", "kept", "missed", "cancelled"];
const APPOINTMENT_KEY_MAX = 512;
export function feedAppointmentRows(items, o) {
  const out = /* @__PURE__ */ new Map();
  const copy = bookingCopyTest(o.bookings ?? [], o.own);
  for (const it of items) {
    if (it.start < o.window.from || it.start > o.window.to) continue;
    const key = appointmentKeyOf(it);
    if (key.length > APPOINTMENT_KEY_MAX || out.has(key)) continue;
    const title = it.title.trim() || null;
    const contactId = matchPerson(it, o.people, o.own)?.id ?? null;
    out.set(key, {
      external_id: key,
      starts_at: new Date(it.start).toISOString(),
      ends_at: new Date(it.end).toISOString(),
      all_day: it.allDay,
      service: serviceNamedIn(title, o.services),
      consultation: isConsultationTitle(title, o.services, o.rules),
      contact_id: contactId,
      series: it.occurrence !== void 0,
      twin: copy ? copy(it, contactId) : false
    });
  }
  return [...out.values()];
}
const OFF = /* @__PURE__ */ new Set(["missed", "cancelled"]);
export function appointmentHolds(rows, facts) {
  const key = typeof facts.appointment === "string" ? facts.appointment : null;
  const start = typeof facts.visit_start === "string" ? Date.parse(facts.visit_start) : NaN;
  const row = key ? rows.get(key) : void 0;
  if (!row || !Number.isFinite(start)) return true;
  if (OFF.has(row.status)) return false;
  const read = typeof facts.appointment_read_at === "string" ? Date.parse(facts.appointment_read_at) : NaN;
  if (!Number.isFinite(read)) return true;
  if (row.vanished_at !== null && Date.parse(row.vanished_at) > read) return false;
  return Date.parse(row.starts_at) === start || !(Date.parse(row.updated_at) > read);
}
export function feedNamesOf(items, span) {
  return { keys: new Set(items.map(appointmentKeyOf)), from: span.from, to: span.to };
}
function feedKeyOf(facts) {
  const key = typeof facts.appointment === "string" && facts.appointment ? facts.appointment : null;
  const start = typeof facts.visit_start === "string" ? Date.parse(facts.visit_start) : NaN;
  return key && recordIdOf(key) === null && Number.isFinite(start) ? key : null;
}
export function asksTheFeed(facts) {
  return feedKeyOf(facts) !== null;
}
export function feedStillNames(feed, facts) {
  const key = feedKeyOf(facts);
  if (key === null) return true;
  const start = Date.parse(String(facts.visit_start));
  if (start < feed.from || start > feed.to) return true;
  return feed.keys.has(key);
}
export function appointmentKeysOf(rows) {
  const keys = /* @__PURE__ */ new Set();
  for (const r of rows) {
    const f = r.facts;
    if (f && typeof f === "object" && !Array.isArray(f)) {
      const k = f.appointment;
      if (typeof k === "string" && k) keys.add(k);
    }
  }
  return [...keys];
}
