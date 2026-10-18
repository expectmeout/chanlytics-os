/**
 * The one fact most worth adding, with the row that adds it (businessGap), and what the booking link's row says
 * with nothing in it. The services, whose absence the gap line names, are services-words.ts.
 */
import { offersBookingLink } from "../no-booking-link";

/**
 * What the booking link's row says with nothing in it, and the hint under its box: the same for every business (0008,
 * amended 18 Oct 2026). A receptionist with no link takes their details instead (the first run's decision 2, and
 * no-booking-link.ts), whether the business books or quotes, so the link is an offer, never a fault. The create card's
 * box and the first run's Check say the same.
 */
export const BOOKING_LINK_ROW_WORDS: { empty: string; hint: string } = {
  empty: "None — it takes their details instead",
  hint: "Optional. Add one and they book themselves.",
};

/** The subset of the brain the gap line reads. */
export interface StandingInputs {
  business_name?: string | null;
  booking_link?: string | null;
  profile?: {
    address?: string | null;
    tone?: string | null;
    hours?: Record<string, unknown> | null;
    services?: unknown[] | null;
  } | null;
}

/** The single most useful gap, and the row that fixes it. */
export interface BusinessGap {
  sentence: string;
  row: string;
}

/**
 * What a receptionist with no services cannot do, in ONE place: the gap line says it ("It cannot say what you
 * offer."), and so does the services sheet's foot once the last one is taken out (servicesToldWords).
 */
export const CANNOT_SAY_SERVICES = "cannot say what you offer";

const has = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : !!v && Object.keys(v).length > 0;

/**
 * The one fact most worth adding, and the row that adds it; null when nothing is missing.
 *
 * The gaps are ordered by what a customer notices: a receptionist with no name
 * cannot introduce itself, one with no hours cannot answer the commonest
 * question, and one with no voice answers in nobody's words. Only
 * the first gap is named — a list of six is a list nobody starts.
 *
 * The booking link comes last, as an offer: without one the receptionist still answers and takes their details, so a
 * business with no link hears first of what it cannot say at all (0008, amended 18 Oct 2026; it was second, and only
 * where customers book).
 *
 * The page says nothing above its cards while every fact is there: the rows already say what it answers from, and the
 * price rule's fold says what it does instead of a price, per channel (`checkedOn`). A line that repeated both was the
 * clutter Ruben cut on 26 Sep 2026.
 */
export function businessGap(i: StandingInputs): BusinessGap | null {
  const p = i.profile ?? {};
  if (!has(i.business_name)) return { sentence: "It has no name to introduce itself with.", row: "name" };
  if (!has(p.hours)) return { sentence: "It cannot say when you are open.", row: "hours" };
  if (!has(p.services)) return { sentence: `It ${CANNOT_SAY_SERVICES}.`, row: "services" };
  if (!has(p.address)) return { sentence: "It cannot say where you are.", row: "address" };
  if (!has(p.tone))
    return { sentence: "It has no voice of its own yet — it answers in nobody in particular's words.", row: "tone" };
  if (!offersBookingLink(i))
    return { sentence: "It has no booking link to send, so it takes their details instead.", row: "booking_link" };
  return null;
}
