/**
 * The one line Today says of a new review (contracts GoogleVM.todayLine): the card draws it (card.tsx), and the away card drops
 * the bell's notice of the same review under it (away.tsx), so both ask the one function and a review is drawn once. News until it
 * is answered; a line gone, its notice is the bell's alone. Today's is the thirty days to today, whatever Reports shows.
 */
import { DEFAULT_TIMEZONE, toGoogleVM, type GoogleVM } from "@chanlytics/contracts";
import type { GoogleSurface } from "@/legacy-bridge/google";
import { workspaceClock } from "../shell";

/** Today's line for the Google read this tab holds, or none: no listing, no new review, or the new one answered. */
export function reviewLineOf(google: GoogleSurface | undefined): GoogleVM["todayLine"] {
  if (!google || !google.dto.listing) return null;
  return toGoogleVM(google.dto, { days: 30, until: null }, Date.now(), workspaceClock()?.zone() ?? DEFAULT_TIMEZONE)
    .todayLine;
}
