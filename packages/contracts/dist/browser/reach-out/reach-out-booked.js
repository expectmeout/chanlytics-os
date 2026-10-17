import { extractContacts } from "../calendar/calendar-people.js";
export const BOOKED_SEEN_CAP = 500;
export function bookedSeenOf(items, own) {
  const out = [];
  const byStart = [...items].sort((a, b) => b.start - a.start);
  for (const it of byStart) {
    const c = extractContacts(it, own);
    const start = new Date(it.start).toISOString();
    for (const email of c.emails) out.push({ email, start });
    for (const phone of c.phones) out.push({ phone, start });
    if (out.length >= BOOKED_SEEN_CAP) break;
  }
  return out.slice(0, BOOKED_SEEN_CAP);
}
