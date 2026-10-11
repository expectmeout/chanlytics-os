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

/**
 * Whether the receptionist may offer to hand over the booking link where it is speaking. In chat the link is sent in
 * the thread, so a link is enough. A call can only send it by WhatsApp (retell-fn delivers it on the WhatsApp channel),
 * so it needs a WhatsApp line that answers too (facts.ts whatsapp_line); whether an approved booking-link message exists
 * is asked when it is sent, and retell-fn says so when there is none. Until 11 Oct 2026 a call offered the link by
 * WhatsApp on a workspace with no WhatsApp, and its record then said a link went out. One answer for every place a
 * receptionist is told it may offer the link: the prompt (compose.ts), and on a call the openings, a caller's visits,
 * the availability tool and a correction.
 */
export function offersLinkOn(
  on: "call" | "chat",
  brain: { booking_link?: string | null } | null | undefined,
  whatsappLine: string | null,
): boolean {
  return offersBookingLink(brain) && (on === "chat" || !!whatsappLine);
}

/**
 * What a call says to do when there is a booking link and no WhatsApp line to send it by (offersLinkOn): the details
 * for the team, as a business with no link takes them, and the website where the caller would rather book themselves.
 */
export const NO_WAY_TO_SEND_LINK = `Booking: the booking link can only be sent by WhatsApp, and this business has no WhatsApp line, so never use send_booking_link and never promise a link or a message. When the caller wants to book, change or cancel a booking, take ${NO_LINK_DETAILS}, and say the team will follow up. If they would rather book themselves and a website is listed above, they can book there.`;

/** What follows "a price is not mine to confirm", in the prompt's rule and a call's correction alike. */
export function priceNextStep(hasBookingLink: boolean): string {
  return hasBookingLink ? "offer the booking link" : `take ${NO_LINK_DETAILS}`;
}
