/**
 * What a receptionist with no booking link asks for, where it would have sent one.
 *
 * A business that quotes each job -- a mover, a caterer, a contractor -- has no booking link (the first run's
 * decision 2, 24 Sep 2026): the price comes before anyone books, so its receptionist takes what the team needs to
 * follow up. Every sentence that would have offered the link to book finishes this one list instead: the prompt on
 * both channels (config.ts), the openings and a correction on a call (availability.ts, whisper.ts), and the phone's
 * two tools (apps/edge/api/retell-fn.ts, retell-availability.ts). However the receptionist comes to it, it asks for
 * the same things. (A caller's appointment already booked is changed through the team: calendar-people.ts.)
 *
 * Read, not yet written: a receptionist with no link parses, and the save still refuses one
 * (TenantConfigWriteSchema) until the first run's Check asks how customers buy.
 */
export const NO_LINK_DETAILS = "their name, what they need, and where and when";

/**
 * Whether what the receptionist is told offers the booking link: yes, unless its config is known to hold none. With no
 * receptionist config at all nothing is known, and a call is then told the voice shell's FACTS_UNAVAILABLE, which
 * offers the link -- so the openings, a caller's appointments and a correction said beside it offer it too.
 */
export function offersBookingLink(brain: { booking_link?: string | null } | null | undefined): boolean {
  return !brain || !!brain.booking_link;
}
