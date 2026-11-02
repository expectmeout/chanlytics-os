/**
 * A lead somebody is reaching for, read ahead so their sheet opens whole: the sheet draws nothing under the name until the
 * reads that decide it are in (facts.ts sheetStillReading), and a read begun at the press is one the owner waits for. A
 * row under the pointer, a row a finger lands on, and the rows beside the sheet open ask where that lead stands and what
 * the add door says of them; the sheet's own reads then find those answers, or share the read on its way.
 */
import type { PointerEvent } from "react";
import { warmLeadPlace } from "../../campaigns/sequences/verbs";
import type { LeadAim } from "./use-aim";

/** How long a pointer rests on a row before it counts: a sweep down the list reads nothing. */
const REST_MS = 90;
/** A lead's row, by the table's own id for it (kit/table/rows.tsx). */
const LEAD_ROW = /^lead-([0-9a-f-]{36})$/;

const leadUnder = (e: PointerEvent<HTMLElement>): string | null => {
  const target = e.target as Element | null;
  const row = target && target.closest ? target.closest<HTMLElement>('[id^="lead-"]') : null;
  const at = row ? LEAD_ROW.exec(row.id) : null;
  return at ? (at[1] ?? null) : null;
};

export function reachLead(aim: Pick<LeadAim, "check">, id: string): void {
  void warmLeadPlace(id);
  void aim.check([id]);
}

let resting: { id: string; timer: ReturnType<typeof setTimeout> } | null = null;

/** What the rows' pane listens with: one listener for every row, as the sidebar's reach is. */
export const leadRowReach = (aim: Pick<LeadAim, "check">) => ({
  onPointerOver: (e: PointerEvent<HTMLElement>) => {
    const id = leadUnder(e);
    if (resting && resting.id === id) return;
    if (resting) clearTimeout(resting.timer);
    resting = id ? { id, timer: setTimeout(() => reachLead(aim, id), REST_MS) } : null;
  },
  onPointerDown: (e: PointerEvent<HTMLElement>) => {
    const id = leadUnder(e);
    if (id) reachLead(aim, id);
  },
});
