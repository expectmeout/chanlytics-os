/**
 * The business a person works at, as it trails their name wherever a page names them (0052): the Inbox's list and
 * Conversations, Today's queue, the Calendar's appointment and Live. One reading of People's rows (contracts
 * businessTrailOf), so every page says what People says. Nothing before People is read; someone People does not hold yet
 * (linked or made since its last read) asks for it to be read again, once (want-person.ts; the wiring's second audit, R10).
 */
import { useSyncExternalStore } from "react";
import { businessTrailOf } from "@chanlytics/contracts";
import { onSurfaceValue, surfaceValue } from "../surface-values";
import { wantPerson } from "./want-person";

/** People's rows as they stand: nothing before their first read. */
const peopleRows = () => surfaceValue("people")?.rows;

/** People's rows as their trails, kept for the rows they were made of: a list draws many names. */
let trailRows: unknown = null;
let trails = new Map<string, string>();

/**
 * The business a person works at, as it trails their name (contracts businessTrailOf over their People row): null for a
 * stand-in, someone who works nowhere, someone People does not hold, or before People is read.
 */
export function businessTrailFor(personId: string | null | undefined): string | null {
  const rows = peopleRows();
  if (!rows || !personId) return null;
  if (rows !== trailRows) {
    trailRows = rows;
    trails = new Map(
      rows.flatMap((r): [string, string][] => {
        const trail = businessTrailOf(r);
        return trail ? [[r.id, trail]] : [];
      }),
    );
  }
  const trail = trails.get(personId);
  // Someone with no trail may simply work nowhere; one People does not hold asks for its next read (want-person.ts).
  if (trail === undefined) wantPerson(personId);
  return trail ?? null;
}

const heardPeople = (moved: () => void) => onSurfaceValue("people", moved);

/** Draw again when People's rows are published, read or given back by the tab's cache, without asking for a read. */
export function usePeopleTrails(): void {
  useSyncExternalStore(heardPeople, peopleRows, peopleRows);
}
