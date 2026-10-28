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
 * A receptionist with no link is read and saved, and every business is offered one the same way (business-gap.ts
 * BOOKING_LINK_ROW_WORDS; 0008, amended 18 Oct 2026), whether it books or quotes.
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
 * The ways a call can hand over the booking link (retell-fn's send_booking_link): by WhatsApp, which needs a WhatsApp
 * line (facts.ts whatsapp_line) and a booking-link message Meta approved (facts.ts booking_message, decision 0073, R14;
 * not read, null, it is offered as before and retell-fn says so when there is none), and by text, which needs a texting
 * line the carriers approved (facts.ts texting_line; not read, no text is offered). The tool tries WhatsApp first and
 * texts when WhatsApp cannot carry it (the live walk's SET-2, 28 Oct 2026). No link, no way.
 */
export function callLinkWays(
  brain: { booking_link?: string | null } | null | undefined,
  whatsappLine: string | null,
  bookingMessage: boolean | null | undefined,
  textingLine: boolean | null | undefined,
): { whatsapp: boolean; text: boolean } {
  const link = offersBookingLink(brain);
  return { whatsapp: link && !!whatsappLine && bookingMessage !== false, text: link && textingLine === true };
}

/**
 * Whether the receptionist may offer to hand over the booking link where it is speaking. In chat the link is sent in
 * the thread, so a link is enough. A call sends it by WhatsApp or by text (callLinkWays), so it needs one of the two:
 * without either nothing can go, so nothing is offered. Until 11 Oct 2026 a call offered the link by WhatsApp on a
 * workspace with no WhatsApp, and its record then said a link went out. One answer for every place a receptionist is
 * told it may offer the link: the prompt (compose.ts), and on a call the openings, a caller's visits, the availability
 * tool and a correction.
 */
export function offersLinkOn(
  on: "call" | "chat",
  brain: { booking_link?: string | null } | null | undefined,
  whatsappLine: string | null,
  bookingMessage: boolean | null | undefined,
  textingLine: boolean | null | undefined,
): boolean {
  if (on === "chat") return offersBookingLink(brain);
  const ways = callLinkWays(brain, whatsappLine, bookingMessage, textingLine);
  return ways.whatsapp || ways.text;
}

/**
 * What a call says to do when there is a booking link and neither a WhatsApp line nor a texting line to send it by
 * (offersLinkOn): the details for the team, as a business with no link takes them, and the website where the caller
 * would rather book themselves.
 */
export const NO_WAY_TO_SEND_LINK = `Booking: the booking link can only be sent by WhatsApp or by text, and this business has no WhatsApp line and no texting line, so never use send_booking_link and never promise a link or a message. When the caller wants to book, change or cancel a booking, take ${NO_LINK_DETAILS}, and say the team will follow up. If they would rather book themselves and a website is listed above, they can book there.`;

/**
 * What a call says to do when there is a booking link and a WhatsApp line, the message that carries the link is not
 * approved by Meta yet (decision 0073, R14), and there is no texting line to send it by instead: as with no line, the
 * details for the team, and never a promised link.
 */
const NO_MESSAGE_FOR_LINK = `Booking: the booking link is sent as a WhatsApp message that is not approved yet, and this business has no texting line, so never use send_booking_link and never promise a link or a message. When the caller wants to book, change or cancel a booking, take ${NO_LINK_DETAILS}, and say the team will follow up. If they would rather book themselves and a website is listed above, they can book there.`;

/** What a call with a link it cannot send says instead: no line to send it by, or a WhatsApp line and no approved message. */
export const cannotSendLink = (whatsappLine: string | null): string =>
  whatsappLine ? NO_MESSAGE_FOR_LINK : NO_WAY_TO_SEND_LINK;

/** What follows "a price is not mine to confirm", in the prompt's rule and a call's correction alike. */
export function priceNextStep(hasBookingLink: boolean): string {
  return hasBookingLink ? "offer the booking link" : `take ${NO_LINK_DETAILS}`;
}
