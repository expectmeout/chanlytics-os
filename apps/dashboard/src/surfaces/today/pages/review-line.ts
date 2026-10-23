/**
 * The one line Today says of a new review (contracts GoogleVM.todayLine): the card draws it (card.tsx), and the away card drops
 * the bell's notice of the same review under it (away.tsx), so both ask the one function and a review is drawn once. News until it
 * is answered; a line gone, its notice is the bell's alone. Today's is the thirty days to today, whatever Reports shows.
 */
import { DEFAULT_TIMEZONE, toGoogleVM, type GoogleVM } from "@chanlytics/contracts";
import type { GoogleSurface } from "@/legacy-bridge/google";
import { workspaceClock } from "../shell";
import { reviewsToAnswer } from "../need-you/reviews";

/**
 * Today's line for the Google read this tab holds, or none: no listing, no new review, or the new one answered. A review
 * Need you offers to answer is said there, once (decision 0071), so the card says no line of it.
 */
export function reviewLineOf(google: GoogleSurface | undefined): GoogleVM["todayLine"] {
  if (!google || !google.dto.listing) return null;
  const line = toGoogleVM(
    google.dto,
    { days: 30, until: null },
    Date.now(),
    workspaceClock()?.zone() ?? DEFAULT_TIMEZONE,
  ).todayLine;
  return line && reviewsToAnswer(google).some((r) => r.id === line.review.id) ? null : line;
}
