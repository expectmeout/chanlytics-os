/**
 * The one fact most worth adding, with the row that adds it (businessGap), and what the booking link's row says
 * with nothing in it. The services, whose absence the gap line names, are services-words.ts.
 */
import { bookingLinkOptional } from "../../deals/sells-by";
import { offersBookingLink } from "../no-booking-link";

/**
 * What the booking link's row says with nothing in it, and the hint under its box, by how the workspace's customers buy
 * (deals.ts bookingLinkOptional): a business that quotes has none by right, and its receptionist takes their details
 * instead (the first run's decision 2); one that books, or has not said, is missing it. The create card's box says the
 * same, by the answer chosen in it.
 */
export function bookingLinkRowWords(sellsBy: string | null | undefined): { empty: string; hint: string } {
  return bookingLinkOptional(sellsBy)
    ? {
        empty: "None — it takes their details instead",
        hint: "Optional for a business that quotes: without one, it takes their details instead.",
      }
    : { empty: "Not set", hint: "Sent instead of confirming an appointment itself." };
}

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
 * The page says nothing above its cards while every fact is there: the rows already say what it answers from, and the
 * price rule's fold says what it does instead of a price, per channel (`checkedOn`). A line that repeated both was the
 * clutter Ruben cut on 26 Sep 2026.
 *
 * `sellsBy` is the workspace's answer to how its customers buy, null where it was never said, and required and checked
 * as it runs: the page that calls this is untyped JSX, a business that quotes has no booking link by right (deals.ts
 * bookingLinkOptional), and one left out would be told its missing link is the gap to fix.
 */
export function businessGap(i: StandingInputs, sellsBy: string | null): BusinessGap | null {
  if (sellsBy !== null && typeof sellsBy !== "string") {
    throw new TypeError(
      "businessGap needs how customers buy (the workspace's sells_by, null when not said): whether a missing booking link is a gap turns on it.",
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
    return { sentence: "It has no voice of its own yet — it answers in nobody in particular's words.", row: "tone" };
  return null;
}
