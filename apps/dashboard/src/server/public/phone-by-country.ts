import "server-only";

/**
 * A phone number read in its country's own form (decision 0054; the Forms plan's call 16): `libphonenumber-js` behind a
 * seam of ours, on the server only, so no page carries it. The house's own reader (contracts normalizePhone) takes a
 * bare ten-digit number as a North American one; a form's visitor types their number the way their country writes it,
 * so a form reads it by the business's country, and falls back to the house's reader where the library cannot tell.
 */
import { normalizePhone } from "@chanlytics/contracts";
import { isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js/min";

/**
 * The reader of a typed number for a business in `country` (its record's two-letter code; anything else is read the
 * house's way): the number in its international form, or null for what is no number.
 */
export function phoneFor(country: string | null | undefined): (typed: string) => string | null {
  const region = (country ?? "").trim().toUpperCase();
  if (!isSupportedCountry(region)) return normalizePhone;
  return (typed) => {
    const read = parsePhoneNumberFromString(typed, region);
    if (read?.isValid()) return read.number;
    // What the library does not take as this country's may still be a number written in full: the house's reader says.
    return typed.trim().startsWith("+") ? normalizePhone(typed) : null;
  };
}
