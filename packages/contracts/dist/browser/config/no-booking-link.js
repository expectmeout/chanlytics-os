export const NO_LINK_DETAILS = "their name, what they need, and where and when";
export function offersBookingLink(brain) {
  return !brain || !!brain.booking_link;
}
export function offersLinkOn(on, brain, whatsappLine) {
  return offersBookingLink(brain) && (on === "chat" || !!whatsappLine);
}
export const NO_WAY_TO_SEND_LINK = `Booking: the booking link can only be sent by WhatsApp, and this business has no WhatsApp line, so never use send_booking_link and never promise a link or a message. When the caller wants to book, change or cancel a booking, take ${NO_LINK_DETAILS}, and say the team will follow up. If they would rather book themselves and a website is listed above, they can book there.`;
export function priceNextStep(hasBookingLink) {
  return hasBookingLink ? "offer the booking link" : `take ${NO_LINK_DETAILS}`;
}
