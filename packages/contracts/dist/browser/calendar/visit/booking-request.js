import { clockInZone, dayInZone, localToUtcMs } from "../zone-math.js";
import { MIN_MS, dateFormat } from "../../shared/time.js";
export const BOOKING_REQUEST_SCHEMA_FIELDS = {
  booking_slot: {
    type: "string",
    description: "When the customer picked one of the open times you were given: its start as YYYY-MM-DD HH:MM on the business's clock. Empty otherwise."
  },
  booking_service: {
    type: "string",
    description: "When the customer picked a time: the service it is for, exactly as the business lists it, or empty when they did not say. Empty otherwise."
  }
};
export const BOOKING_REQUEST_INSTRUCTION = "When they pick one, put its start in booking_slot and the service in booking_service, and tell them the team will confirm it shortly. Never confirm a slot yourself. Writing the time in booking_slot is what reaches the team, so it is no reason on its own to set escalate.";
export function takesBookingRequests(o) {
  return o.switchOn && (!o.linkInChat || o.bookingHeld);
}
const SLOT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/;
export function requestedBookingOf(input) {
  const slot = (input.slot ?? "").trim();
  if (!slot) return { ok: false, why: "no_slot" };
  const m = SLOT.exec(slot);
  if (!m) return { ok: false, why: "unreadable" };
  const [y = 0, mo = 0, d = 0, hh = 0, mm = 0] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return { ok: false, why: "unreadable" };
  const startMs = localToUtcMs(input.tz, y, mo, d, hh, mm);
  const back = dayInZone(input.tz, startMs);
  const clock = clockInZone(input.tz, startMs);
  if (back.y !== y || back.m !== mo || back.d !== d || clock.hh !== hh || clock.mm !== mm)
    return { ok: false, why: "unreadable" };
  const named = (input.service ?? "").trim();
  const listed = named ? input.services.find(
    (s) => s.name.trim().toLowerCase().replace(/\s+/g, " ") === named.toLowerCase().replace(/\s+/g, " ")
  ) : void 0;
  if (named && !listed) return { ok: false, why: "unknown_service" };
  const minutes = listed?.duration_min && listed.duration_min > 0 ? listed.duration_min : input.slotMin;
  const endMs = startMs + minutes * MIN_MS;
  const fits = input.openings.some((o) => o.windows.some((w) => startMs >= w.start && endMs <= w.end));
  if (!fits) return { ok: false, why: "not_open" };
  return { ok: true, startMs, endMs, service: listed ? listed.name.trim() : null };
}
export function slotShort(atMs, tz) {
  return dateFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(atMs));
}
export function slotLong(atMs, tz) {
  const day = dateFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(
    new Date(atMs)
  );
  const time = dateFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(atMs));
  return `${day} at ${time}`;
}
export const BOOKING_REQUEST_WORDS = {
  /** The hold's line (its details): what was asked for. */
  hold: (when, service) => `Asked for ${when}${service ? ` \xB7 ${service}` : ""}`,
  /** The line Can't leaves on the thread, which now waits on a reply. */
  cant: (when, service) => `Could not book ${when}${service ? ` \xB7 ${service}` : ""}: reply to them`,
  /** The reply Booked it drafts, for the owner to send: the row's own words. */
  booked: (when, service) => `You're booked for ${when}${service ? ` for ${articled(service)}` : ""}.`,
  booked_it: "Booked it",
  cant_it: "Can't",
  /** The board's word for a request, and its sheet's foot. */
  requested: "Requested",
  foot: "Requested by text \xB7 Booked it or Can't",
  /** Its sheet's foot once answered: it is on no calendar, so it is changed with them, in their thread. */
  footBooked: "Booked by text \xB7 change it with them in their thread",
  footCant: "Asked for by text \xB7 you couldn't take it",
  /** What the role gate says the two presses are, to a member who may not press them. */
  gate: "confirm a booking",
  /** What a page says once a press is taken: booked, and the reply waiting in the thread; or theirs to answer. */
  said: {
    booked: (who) => `Booked. Tell ${who} in the thread.`,
    cant: (who) => `${who} is waiting on your reply`
  },
  /** The switch, in Settings › Hours & booking, the booking tool's fold. */
  setting: {
    name: "Booking requests",
    says: "Where you confirm bookings yourself, a time a customer picks by text waits on Today: Booked it, or Can't."
  }
};
export const BOOKING_REQUEST_REFUSALS = {
  none: "Nothing here waits to be confirmed: it was answered, or they asked for another time since.",
  not_a_request: "That one wasn't asked for by text: say what became of it on the Calendar.",
  answered: "It was answered already.",
  expired: "It expired, so its time may have gone to someone else: check the calendar and reply to them, or press Can't."
};
export function bookingRequestRefusalOf(code) {
  const words = BOOKING_REQUEST_REFUSALS;
  return code && Object.hasOwn(words, code) ? words[code] ?? null : null;
}
function articled(service) {
  return `${/^[aeiou]/i.test(service) ? "an" : "a"} ${service}`;
}
