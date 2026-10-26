/**
 * Asked, then booked: whether someone who reached out has an appointment that answers it. Reports' booking line and
 * People's "Asked, never booked" both read this one rule (decision 0009).
 */
import { DAY_MS } from "../../shared/time";

/**
 * Whether someone who reached out has an appointment that answers it: one
 * upcoming, or one held since they got in touch. The conversion Chanlytics
 * counts is the booking, not a stage somebody moved a card into, so a visit a
 * member said they missed answers it too: they booked (0002's readers).
 */
export function bookedAfterAsk(
  visits: { next: Started | null; last: Started | null; missed?: Started | null } | null | undefined,
  askedMs: number,
): boolean {
  if (!visits) return false;
  return visitAnswersAsk(visitStartOf(visits.next), begunOf(visits.last, visits.missed), askedMs);
}

/** A visit as a parse (ms) or the wire (ISO) carries it: its start is all the ask's rule reads. */
type Started = { start: number | string };

/** A visit's start in ms; null for none, or one that is not a time. */
function visitStartOf(v: Started | null | undefined): number | null {
  const t = !v ? NaN : typeof v.start === "number" ? v.start : Date.parse(v.start);
  return Number.isFinite(t) ? t : null;
}

/** The start of the latest visit begun, kept or missed or neither (null: none): what an ask is answered by since. */
function begunOf(last: Started | null | undefined, missed: Started | null | undefined): number | null {
  const starts = [visitStartOf(last), visitStartOf(missed)].filter((t): t is number => t !== null);
  return starts.length ? Math.max(...starts) : null;
}

/**
 * The rule over the moments: a visit ahead, or one begun no more than a day before they asked. Reports' booking line
 * and People's "Asked, never booked" both read it through bookedAfterAsk, so Today's line that prints the two numbers
 * side by side counts one rule twice, never two rules once (decision 0009).
 */
function visitAnswersAsk(nextStartMs: number | null, lastStartMs: number | null, askedMs: number): boolean {
  if (nextStartMs !== null) return true;
  return lastStartMs !== null && lastStartMs >= askedMs - DAY_MS;
}
