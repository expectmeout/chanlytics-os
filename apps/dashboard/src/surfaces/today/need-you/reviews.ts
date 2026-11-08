/**
 * The Google reviews Need you offers to answer (decision 0071): on a connected Business Profile (only then can a reply be
 * posted), not answered, not held by a reply of the receptionist's (Reports' Reviews lens stops or sends that one), the
 * newest two, in To do. A new review the profile cannot answer from here is the bell's news (Since you looked).
 * Not today rests one a week, as Not today does wherever Today says it (rests.tsx).
 */
import type { GoogleReviewDto } from "@chanlytics/contracts";
import type { GoogleSurface } from "@/bridge/google";
import { reviewRestKey } from "./rests";

/** How many reviews Need you offers at once: the rest are on Reports' Reviews lens. */
const REVIEWS_OFFERED_MAX = 2;

/** The reviews Need you offers to answer, newest first, less those at rest; none without a connected profile. */
export function reviewsToAnswer(google: GoogleSurface | undefined, rests: (key: string) => boolean): GoogleReviewDto[] {
  if (!google || !google.dto.connection) return [];
  return google.dto.reviews
    .filter((r) => !r.reply_text && !r.draft_text && !rests(reviewRestKey(r.id)))
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, REVIEWS_OFFERED_MAX);
}
