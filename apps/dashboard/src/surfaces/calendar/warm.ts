/**
 * Which windows the board reads before they are asked for (the loading standard's warming, as the Inbox warms the thread
 * a pointer rests on): a move past the loaded weeks was a read to wait for, and the board is where a person steps one week
 * at a time towards that edge. Pure: the loaded days, the view and its anchor in; the windows a move a few steps on would
 * read, out. What reads them, and holds them, is surface.ts (`warmCalendar`), so a board that gets there paints the window
 * at once, as it does one it has been to.
 */
import { coversSpan, shiftKey, shiftMonth, spanForView, windowFor, type CalendarView } from "@chanlytics/contracts";
import { crStep } from "./words";

/** How many moves ahead, each way, the board looks for the first one the loaded weeks do not cover. */
const MOVES_AHEAD = 3;

/** The window each direction's nearest uncovered move would read: none for a way the loaded weeks cover far enough. */
export function windowsToWarm(p: {
  view: CalendarView;
  anchor: string;
  loaded: ReadonlyArray<{ key: string }>;
}): Array<{ from: string; days: number }> {
  if (!p.loaded.length) return [];
  const out: Array<{ from: string; days: number }> = [];
  for (const way of [1, -1]) {
    for (let ahead = 1; ahead <= MOVES_AHEAD; ahead++) {
      const there = crStep(p.view, p.anchor, way * ahead, { shiftKey, shiftMonth });
      const need = spanForView(p.view, there);
      if (coversSpan(p.loaded, need.from, need.days)) continue;
      const w = windowFor(there);
      if (!out.some((o) => o.from === w.from)) out.push(w);
      break;
    }
  }
  return out;
}
