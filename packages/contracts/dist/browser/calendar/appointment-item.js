import { APPOINTMENT_STATUSES } from "./feed-appointments.js";
import { visitStands } from "./calendar-words.js";
import { replyFactsOf } from "./calendar-people.js";
import { bookingCopyTest, bookingToolName } from "./booking-notice.js";
import { appointmentKeyOf, recordKeyOf } from "./appointment-key.js";
import { shiftKey, zoneMidnight } from "./day-keys.js";
const APPOINTMENT_UNTITLED = "Booked";
export function appointmentTitle(row) {
  if (row.title?.trim()) return row.title.trim();
  const parts = [row.service, row.client_name].map((s) => s?.trim()).filter((s) => !!s);
  return parts.length ? parts.join(" \xB7 ") : APPOINTMENT_UNTITLED;
}
export function busyOfAppointments(rows) {
  return rows.map((r) => ({ start: Date.parse(r.starts_at), end: Date.parse(r.ends_at) }));
}
export function feedItemOfAppointment(row) {
  return {
    start: Date.parse(row.starts_at),
    end: Date.parse(row.ends_at),
    title: appointmentTitle(row),
    allDay: row.all_day,
    uid: recordKeyOf(row.id),
    // The client's number where an event carries one, and their address as a guest, so the one visits index
    // (indexFeed) finds the row by either as it finds an event: a notice that gave a number alone is still theirs.
    description: [row.note, row.client_phone].filter(Boolean).join("\n") || null,
    location: null,
    attendees: row.client_email ? [{ name: row.client_name, email: row.client_email }] : [],
    organizer: null,
    recordId: row.id,
    // And the person it is linked to, so a booking whose number and address are not theirs (a merge moved it, a request
    // came from a thread with neither) is still their visit.
    ...row.contact_id ? { contactId: row.contact_id } : {}
  };
}
export function personOfAppointment(row, people) {
  const linked = row.contact_id ? people.find((p) => p.id === row.contact_id) : void 0;
  const byPhone = !linked && row.client_phone ? people.find((p) => p.phone === row.client_phone) : void 0;
  const byEmail = !linked && !byPhone && row.client_email ? people.find((p) => p.email === row.client_email) : void 0;
  const found = linked ?? byPhone ?? byEmail;
  if (!found) return null;
  const via = linked ? "record" : byPhone ? "phone" : "email";
  return {
    id: found.id,
    name: found.name || row.client_name || "",
    via,
    ...found.thread !== void 0 ? { thread: found.thread, wa_inbound_at: found.waInboundAt ?? null } : {},
    ...replyFactsOf(found)
  };
}
function visitMarkOf(row) {
  return APPOINTMENT_STATUSES.includes(row.status) ? { id: row.id, status: row.status } : null;
}
export function feedMarksOf(rows) {
  const marks = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const mark = visitMarkOf(r);
    if (mark && r.external_id) marks.set(r.external_id, { ...mark, start: Date.parse(r.starts_at) });
  }
  return marks;
}
export function markOn(marks, it) {
  const m = marks?.get(appointmentKeyOf(it));
  return m && m.start === it.start ? { id: m.id, status: m.status } : null;
}
export function feedWithRecord(items, record, own) {
  if (!record) return [...items];
  const out = [];
  for (const it of withoutVisitsRowsDraw([...items], [...record.noted], own)) {
    const mark = markOn(record.marks, it);
    if (!visitStands(mark)) continue;
    const said = mark?.status;
    const withRow = mark ? { recordId: mark.id } : {};
    out.push(said === "kept" || said === "missed" ? { ...it, ...withRow, said } : { ...it, ...withRow });
  }
  for (const r of record.noted) {
    if (r.status !== "booked" && r.status !== "kept" && r.status !== "missed") continue;
    const it = feedItemOfAppointment(r);
    out.push(r.status === "booked" ? it : { ...it, said: r.status });
  }
  return out.sort((a, b) => a.start - b.start);
}
export function itemOfAppointment(row, people) {
  return {
    id: recordKeyOf(row.id),
    start: new Date(Date.parse(row.starts_at)).toISOString(),
    end: new Date(Date.parse(row.ends_at)).toISOString(),
    title: appointmentTitle(row),
    all_day: row.all_day,
    person: personOfAppointment(row, people),
    description: row.note,
    location: null,
    contacts: {
      phones: row.client_phone ? [row.client_phone] : [],
      emails: row.client_email ? [row.client_email] : []
    },
    guess: row.client_name,
    source: "notice",
    tool: bookingToolName(row.tool),
    service: row.service,
    staff: row.staff,
    price: row.price,
    visit: visitMarkOf(row),
    // A time a customer picked by text: answered in its thread, Booked it or Can't, while it is open (decision 0061).
    ...row.source === "receptionist" && row.conversation_id ? { request: { thread_id: row.conversation_id, open: row.status === "proposed" } } : {}
  };
}
export function withoutVisitsRowsDraw(items, rows, own) {
  const copy = bookingCopyTest(rows, own);
  return copy ? items.filter((it) => !copy(it)) : items;
}
export function daysWithAppointments(days, rows, tz, people) {
  if (!rows.length) return days;
  const items = rows.map((r) => ({
    at: { start: Date.parse(r.starts_at), end: Date.parse(r.ends_at) },
    item: itemOfAppointment(r, people)
  }));
  return days.map((d) => {
    const dayStart = zoneMidnight(tz, d.key);
    const dayEnd = zoneMidnight(tz, shiftKey(d.key, 1));
    const here = items.filter(({ at }) => at.end > dayStart && at.start < dayEnd).map(({ item }) => item);
    if (!here.length) return d;
    const merged = [...d.items, ...here].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    return { ...d, items: merged };
  });
}
