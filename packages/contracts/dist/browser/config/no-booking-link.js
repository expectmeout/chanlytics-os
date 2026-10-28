export const NO_LINK_DETAILS = "their name, what they need, and where and when";
export function offersBookingLink(brain) {
  return !brain || !!brain.booking_link;
}
export function callLinkWays(brain, whatsappLine, bookingMessage, textingLine) {
  const link = offersBookingLink(brain);
  return { whatsapp: link && !!whatsappLine && bookingMessage !== false, text: link && textingLine === true };
}
export function offersLinkOn(on, brain, whatsappLine, bookingMessage, textingLine) {
  if (on === "chat") return offersBookingLink(brain);
  const ways = callLinkWays(brain, whatsappLine, bookingMessage, textingLine);
  return ways.whatsapp || ways.text;
}
export const NO_WAY_TO_SEND_LINK = `Booking: the booking link can only be sent by WhatsApp or by text, and this business has no WhatsApp line and no texting line, so never use send_booking_link and never promise a link or a message. When the caller wants to book, change or cancel a booking, take ${NO_LINK_DETAILS}, and say the team will follow up. If they would rather book themselves and a website is listed above, they can book there.`;
const NO_MESSAGE_FOR_LINK = `Booking: the booking link is sent as a WhatsApp message that is not approved yet, and this business has no texting line, so never use send_booking_link and never promise a link or a message. When the caller wants to book, change or cancel a booking, take ${NO_LINK_DETAILS}, and say the team will follow up. If they would rather book themselves and a website is listed above, they can book there.`;
export const cannotSendLink = (whatsappLine) => whatsappLine ? NO_MESSAGE_FOR_LINK : NO_WAY_TO_SEND_LINK;
export function priceNextStep(hasBookingLink) {
  return hasBookingLink ? "offer the booking link" : `take ${NO_LINK_DETAILS}`;
}
