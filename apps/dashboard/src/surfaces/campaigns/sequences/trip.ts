/**
 * A trip from Leads into Sequences and back (the lead sheet's hand-off, 17 Oct 2026: every trip comes back). The address
 * carries where to go back to (contracts sequenceRouteBack); this holds, for the tab, what it does not: the lead's and the
 * list's names, which the head's way back says, and the lead whose row the record lights. A link opened cold has none of
 * it, and says "Leads" instead.
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

/** Leads, as it opens Sequences: what the way back says. */
export function holdTrip(t: Trip): void {
  trip = t;
}

/** The trip's names, where Leads held them. */
export const tripNow = (): Trip | null => trip;

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

/** The way back this record holds now, read without changing it: a phone's Back follows it (record.tsx). */
export const recordBackNow = (id: string): string | null =>
  recordBack && recordBack.id === id ? recordBack.back : null;
