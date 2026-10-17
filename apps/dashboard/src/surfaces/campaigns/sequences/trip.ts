/**
 * A trip from Leads into Sequences and back (the lead sheet's hand-off, 17 Oct 2026: every trip comes back). The address
 * carries where to go back to (contracts sequenceRouteBack); this holds, for the tab, what it does not: the lead's and the
 * list's names, which the head's way back and the composer say, and the sequence a Start made, which the lead's sheet
 * takes as the one its adds go to next. A link opened cold has none of it, and says "Leads" and "this lead" instead.
 */

/** What Leads said as it opened Sequences: the lead and the list, by id and name. */
interface Trip {
  leadId: string | null;
  leadName: string | null;
  listId: string | null;
  listName: string | null;
}

let trip: Trip | null = null;
/** A record's way back, kept while its tabs change (a tab's address does not carry it). */
let recordBack: { id: string; back: string } | null = null;
/** The sequence a Start made on the trip, and what the lead's sheet says of it as it comes back. */
let tripStarted: { rootId: string; said: string } | null = null;

/** Leads, as it opens Sequences: what the way back and the composer say. */
export function holdTrip(t: Trip): void {
  trip = t;
}

/** The trip's names, where Leads held them. */
export const tripNow = (): Trip | null => trip;

/** The lead's name on the trip, if it is this lead's. */
export const tripLeadName = (leadId: string | null): string | null =>
  trip && leadId && trip.leadId === leadId ? trip.leadName : null;

/**
 * A record's way back: the one its address names, else the one it was opened with while its tabs change; none once
 * another record or the list is open.
 */
export function recordBackOf(id: string | null, named: string | null): string | null {
  if (!id) {
    recordBack = null;
    return null;
  }
  if (named) recordBack = { id, back: named };
  else if (recordBack && recordBack.id !== id) recordBack = null;
  return recordBack ? recordBack.back : null;
}

/** A Start on the trip made this sequence. */
export function tripMade(rootId: string, said: string): void {
  tripStarted = { rootId, said };
}

/** The sequence a Start made, taken once by the sheet that comes back. */
export function takeTripMade(): { rootId: string; said: string } | null {
  const m = tripStarted;
  tripStarted = null;
  return m;
}
