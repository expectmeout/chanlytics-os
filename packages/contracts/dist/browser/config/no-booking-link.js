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
export function callBookingLine(base) {
  const ways = callLinkWays(base, base.whatsapp_line, base.booking_message, base.texting_line);
  const ours = "so do not ask them for a number unless they want it sent somewhere else. ";
  const followUp = base.phone_display ? `take ${NO_LINK_DETAILS}, give the phone number above, and offer to have someone follow up.` : `take ${NO_LINK_DETAILS} and offer to have someone follow up.`;
  const said = "Then say what the tool answers: it tells you how the link went and whether it arrived. ";
  if (!ways.whatsapp)
    return `Booking: when the caller wants to book, use send_booking_link \u2014 it sends the booking link by text message to the number they are calling from, ${ours}Tell them it comes as a text message. ${said}If it fails, ${followUp}`;
  const asked = `Booking: when the caller wants to book, first ask "Do you use WhatsApp on this number?" If they do, use send_booking_link \u2014 it sends the booking link to the caller's WhatsApp, on the number they are calling from, ${ours}`;
  if (!ways.text)
    return `${asked}Tell them it comes by WhatsApp, not as a text message. Then say what the tool answers: it waits a moment for WhatsApp's own answer, so it tells you whether it arrived. If they do not use WhatsApp there, or it fails, ${followUp}`;
  return `${asked}Tell them it comes by WhatsApp. If they do not use WhatsApp there, use send_booking_link with by set to "text", and tell them it comes as a text message. When WhatsApp cannot deliver it, the tool sends it by text instead. ${said}If it fails, ${followUp}`;
}
export function priceNextStep(hasBookingLink) {
  return hasBookingLink ? "offer the booking link" : `take ${NO_LINK_DETAILS}`;
}
