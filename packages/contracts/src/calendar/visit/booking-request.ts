/**
 * A booking the receptionist asks for, held for the owner (decision 0061). When the team confirms its own bookings and a
 * customer picks one of the open times, the receptionist writes the slot and the service beside its reply; code decides
 * whether that is a request (requestedBookingOf), and the request and its hold are opened together (00443
 * booking_request_open). The owner answers with Booked it or Can't. Every sentence a request is said in is here. Pure.
 */
import type { Opening } from "../availability";
import { visitRoute } from "../appointment-key";
import { clockInZone, dayInZone, localToUtcMs } from "../zone-math";
import { MIN_MS, dateFormat } from "../../shared/time";

/** The two fields the receptionist writes beside its reply, empty when no time was picked. */
export interface BookingRequestFields {
  booking_slot: string;
  booking_service: string;
}

/**
 * The fields as the answer's schema says them, added to it only where a workspace takes requests (contracts
 * brainOutputSchemaFor): every other turn is sent and read exactly as before.
 */
export const BOOKING_REQUEST_SCHEMA_FIELDS = {
  booking_slot: {
    type: "string",
    description:
      "When the customer picked one of the open times you were given: its start as YYYY-MM-DD HH:MM on the business's clock. Empty otherwise.",
  },
  booking_service: {
    type: "string",
    description:
      "When the customer picked a time: the service it is for, exactly as the business lists it, or empty when they did not say. Empty otherwise.",
  },
} as const;

/**
 * What the receptionist is told to do with a time the customer picks, where requests are taken. The time written is what
 * reaches the team, so it is no handoff by itself: the model escalated such turns ("Booking requests are confirmed by
 * staff", the eval of 15 Oct 2026 on a workspace with no link), and a model's own handoff stands over a request.
 */
export const BOOKING_REQUEST_INSTRUCTION =
  "When they pick one, put its start in booking_slot and the service in booking_service, and tell them the team will confirm it shortly. Never confirm a slot yourself. Writing the time in booking_slot is what reaches the team, so it is no reason on its own to set escalate.";

/**
 * Whether a workspace takes booking requests on a text turn (decision 0061, point 2): its switch is on, and the team
 * confirms its own bookings: no booking link is offered in chat, or the booking row is set to Ask me first.
 */
export function takesBookingRequests(o: { switchOn: boolean; linkInChat: boolean; bookingHeld: boolean }): boolean {
  return o.switchOn && (!o.linkInChat || o.bookingHeld);
}

/**
 * What a time the customer picked is checked against, read when they picked it: the openings as they stand (the
 * person's own open request aside, so picking the same time again is the same request), the business's clock, the
 * services it lists and its slot length.
 */
export interface BookingRequestTerms {
  openings: readonly Opening[];
  tz: string;
  services: ReadonlyArray<{ name: string; duration_min?: number | null }>;
  slotMin: number;
}

export type RequestedBooking =
  | { ok: true; startMs: number; endMs: number; service: string | null }
  | { ok: false; why: "no_slot" | "unreadable" | "not_open" | "unknown_service" };

const SLOT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/;

/**
 * Whether what the receptionist wrote is a request (decision 0061, point 3), never the model's say: the slot is a time on
 * the business's clock that starts inside one of the windows computed for this turn, and the window runs from it as long
 * as the service takes (else the business's slot length); the service is one the business lists (any case and spacing),
 * or none. `no_slot` is a turn with nothing picked: no request, and nothing wrong.
 */
export function requestedBookingOf(
  input: { slot: string | null | undefined; service: string | null | undefined } & BookingRequestTerms,
): RequestedBooking {
  const slot = (input.slot ?? "").trim();
  if (!slot) return { ok: false, why: "no_slot" };
  const m = SLOT.exec(slot);
  if (!m) return { ok: false, why: "unreadable" };
  const [y = 0, mo = 0, d = 0, hh = 0, mm = 0] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return { ok: false, why: "unreadable" };
  const startMs = localToUtcMs(input.tz, y, mo, d, hh, mm);
  // A day or a clock time that does not exist (the 30th of February, a spring-forward gap) reads back as another: not a
  // time it was shown.
  const back = dayInZone(input.tz, startMs);
  const clock = clockInZone(input.tz, startMs);
  if (back.y !== y || back.m !== mo || back.d !== d || clock.hh !== hh || clock.mm !== mm)
    return { ok: false, why: "unreadable" };
  const named = (input.service ?? "").trim();
  const listed = named
    ? input.services.find(
        (s) => s.name.trim().toLowerCase().replace(/\s+/g, " ") === named.toLowerCase().replace(/\s+/g, " "),
      )
    : undefined;
  if (named && !listed) return { ok: false, why: "unknown_service" };
  const minutes = listed?.duration_min && listed.duration_min > 0 ? listed.duration_min : input.slotMin;
  const endMs = startMs + minutes * MIN_MS;
  const fits = input.openings.some((o) => o.windows.some((w) => startMs >= w.start && endMs <= w.end));
  if (!fits) return { ok: false, why: "not_open" };
  return { ok: true, startMs, endMs, service: listed ? listed.name.trim() : null };
}

/** "Sat, Oct 18, 2:00 PM": a slot on the business's clock, short, as the hold's line and the Today row say it. */
export function slotShort(atMs: number, tz: string): string {
  return dateFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(atMs));
}

/** "Saturday, October 18 at 2:00 PM": a slot on the business's clock, whole, as a reply to the customer says it. */
export function slotLong(atMs: number, tz: string): string {
  const day = dateFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(
    new Date(atMs),
  );
  const time = dateFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(atMs));
  return `${day} at ${time}`;
}

/** Every sentence a request is said in: the hold's line, the owner's two answers, and the reply Booked it drafts. */
export const BOOKING_REQUEST_WORDS = {
  /** The hold's line (its details): what was asked for. */
  hold: (when: string, service: string | null) => `Asked for ${when}${service ? ` · ${service}` : ""}`,
  /** The line Can't leaves on the thread, which now waits on a reply. */
  cant: (when: string, service: string | null) =>
    `Could not book ${when}${service ? ` · ${service}` : ""}: reply to them`,
  /** The reply Booked it drafts, for the owner to send: the row's own words. */
  booked: (when: string, service: string | null) =>
    `You're booked for ${when}${service ? ` for ${articled(service)}` : ""}.`,
  booked_it: "Booked it",
  cant_it: "Can't",
  /** The Inbox's request card (the thread canvas, 1 Nov 2026): its two answers, what they do, and the time it holds. */
  cant_do_it: "Can't do it",
  card_foot:
    "Booked it writes their confirmation into the box for you to send. Can't do it leaves the box to offer another time.",
  holds: "Open on your calendar",
  lapsed: "No longer held on your calendar",
  day: "Day",
  dayDoor: (day: string) => `See ${day} on the calendar`,
  /** The board's word for a request, and its sheet's foot. */
  requested: "Requested",
  foot: "Requested by text · Booked it or Can't",
  /** Its sheet's foot once answered: it is on no calendar, so it is changed with them, in their thread. */
  footBooked: "Booked by text · change it with them in their thread",
  footCant: "Asked for by text · you couldn't take it",
  /** What the role gate says the two presses are, to a member who may not press them. */
  gate: "confirm a booking",
  /** What a page says once a press is taken: booked, and the reply waiting in the thread; or theirs to answer. */
  said: {
    booked: (who: string) => `Booked. Tell ${who} in the thread.`,
    cant: (who: string) => `${who} is waiting on your reply`,
  },
} as const;

/** A booking request as the Inbox's card draws it (the thread canvas, 1 Nov 2026). */
export interface BookingRequestCardVM {
  id: string;
  /** Its day on a tile, by the business's clock: "THU" over "6". */
  weekday: string;
  date: string;
  /** Its day in words, for the door to it and a screen reader: "Thursday, November 6". */
  dayLong: string;
  /** Its hours: "3:00 – 4:00 PM". */
  hours: string;
  service: string | null;
  /** Whether it still takes its time on the calendar (it expires an hour before the slot, or a day after it was asked). */
  holds: boolean;
  /** Its day on the Calendar, its panel over it. */
  to: string;
}

/** "3:00 – 4:00 PM", "11:30 AM – 12:30 PM": a slot's hours on the business's clock, the shared half of the day said once. */
function hoursOf(startMs: number, endMs: number, tz: string): string {
  const time = dateFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const start = time.format(new Date(startMs));
  const end = time.format(new Date(endMs));
  const half = (t: string) => t.slice(-2);
  return half(start) === half(end) ? `${start.slice(0, -3)} – ${end}` : `${start} – ${end}`;
}

/** A request as the card draws it, from the row its hold carries (EscalationDto.request), on the business's clock. */
export function bookingRequestCardOf(
  r: { id: string; starts_at: string; ends_at: string; service: string | null; expires_at: string | null },
  tz: string,
  nowMs: number,
): BookingRequestCardVM {
  const startMs = Date.parse(r.starts_at);
  const endMs = Date.parse(r.ends_at);
  const at = new Date(startMs);
  const key = dayInZone(tz, startMs).key;
  return {
    id: r.id,
    weekday: dateFormat("en-US", { timeZone: tz, weekday: "short" }).format(at).toUpperCase(),
    date: dateFormat("en-US", { timeZone: tz, day: "numeric" }).format(at),
    dayLong: dateFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(at),
    hours: hoursOf(startMs, endMs, tz),
    service: r.service && r.service.trim() ? r.service.trim() : null,
    holds: !r.expires_at || Date.parse(r.expires_at) > nowMs,
    to: visitRoute(r.id, key),
  };
}

/** What the answer door refuses, in a sentence for the member who pressed (00443 booking_request_answer). */
export const BOOKING_REQUEST_REFUSALS = {
  none: "Nothing here waits to be confirmed: it was answered, or they asked for another time since.",
  not_a_request: "That one wasn't asked for by text: say what became of it on the Calendar.",
  answered: "It was answered already.",
  expired:
    "It expired, so its time may have gone to someone else: check the calendar and reply to them, or press Can't.",
} as const;

/** The sentence for a refusal the answer door gave, or null for one the set does not know (logged where it is met). */
export function bookingRequestRefusalOf(code: string | null | undefined): string | null {
  const words: Readonly<Record<string, string>> = BOOKING_REQUEST_REFUSALS;
  return code && Object.hasOwn(words, code) ? (words[code] ?? null) : null;
}

/** "a Balayage", "an Eyebrow wax": a service named after "for". */
function articled(service: string): string {
  return `${/^[aeiou]/i.test(service) ? "an" : "a"} ${service}`;
}
