import { bookingLinkOptional } from "../../deals/sells-by.js";
import { offersBookingLink } from "../no-booking-link.js";
export function bookingLinkRowWords(sellsBy) {
  return bookingLinkOptional(sellsBy) ? {
    empty: "None \u2014 it takes their details instead",
    hint: "Optional. Without one, it takes their details."
  } : { empty: "Not set", hint: "Sent so customers book themselves." };
}
export const CANNOT_SAY_SERVICES = "cannot say what you offer";
const has = (v) => typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : !!v && Object.keys(v).length > 0;
export function businessGap(i, sellsBy) {
  if (sellsBy !== null && typeof sellsBy !== "string") {
    throw new TypeError(
      "businessGap needs how customers buy (the workspace's sells_by, null when not said): whether a missing booking link is a gap turns on it."
    );
  }
  const p = i.profile ?? {};
  if (!has(i.business_name)) return { sentence: "It has no name to introduce itself with.", row: "name" };
  if (!offersBookingLink(i) && !bookingLinkOptional(sellsBy))
    return { sentence: "It has no booking link to send anyone.", row: "booking_link" };
  if (!has(p.hours)) return { sentence: "It cannot say when you are open.", row: "hours" };
  if (!has(p.services)) return { sentence: `It ${CANNOT_SAY_SERVICES}.`, row: "services" };
  if (!has(p.address)) return { sentence: "It cannot say where you are.", row: "address" };
  if (!has(p.tone))
    return { sentence: "It has no voice of its own yet \u2014 it answers in nobody in particular's words.", row: "tone" };
  return null;
}
