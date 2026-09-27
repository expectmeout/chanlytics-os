/**
 * What a receptionist with no booking link does where it would have sent one.
 *
 * A business that quotes each job -- a mover, a caterer, a contractor -- has no booking link (the first run's
 * decision 2, 24 Sep 2026): the price comes before anyone books, so its receptionist takes what the team needs to
 * follow up. Where it would have sent the link for someone to book, it asks for this one list instead: the prompt on
 * both channels (config.ts), the openings it offers and a price correction on a call (availability.ts, whisper.ts),
 * and the phone's two tools (apps/edge/api/retell-fn.ts, retell-availability.ts). However the receptionist comes to
 * it, it asks for the same things. Where the link was one offer among others -- a call back, a professional's advice,
 * a change to an appointment already booked -- the others stand alone.
 *
 * A receptionist with no link is read and saved. Who is asked for one is the pages' question, by how customers buy
 * (deals.ts bookingLinkOptional), since the config cannot see the answer.
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

/** What follows "a price is not mine to confirm", in the prompt's rule and a call's correction alike. */
export function priceNextStep(hasBookingLink: boolean): string {
  return hasBookingLink ? "offer the booking link" : `take ${NO_LINK_DETAILS}`;
}
