/**
 * What an opened visit's parts are drawn from (visit.tsx, outcome.tsx), made once for the sheet and the peek alike
 * (visit-sheet.tsx ctxOf): the block as the sheet draws it, its view model at this minute, and what its acts do.
 */
import type { AppointmentWord, CalendarBlockVM, VisitFollowUp, VisitWord } from "@chanlytics/contracts";
import type { VisitSheetVM } from "./sheet-view";

/** What the parts are drawn from, and what they do. */
export interface VisitCtx {
  block: CalendarBlockVM;
  vm: VisitSheetVM;
  word: AppointmentWord;
  bookingLink: string | null;
  /** Close the sheet or the peek (the address goes back with it). */
  close: () => void;
  /** Say something once, at the foot of the page (the board's toast). */
  flash: (text: string) => void;
  /** Keep what the door answered a word said here (useVisitOutcome): the sheet draws the visit as it was told. */
  settle: (word: VisitWord, follows: VisitFollowUp | null) => void;
}
