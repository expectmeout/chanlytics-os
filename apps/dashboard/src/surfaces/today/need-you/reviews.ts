/**
 * The Google reviews Need you offers to answer (decision 0071): on a connected Business Profile (only then can a reply be
 * posted), not answered, not held by a reply of the receptionist's (Reports' Reviews lens stops or sends that one), the
 * newest two, in To do. A new review the profile cannot answer from here is the bell's news (While you were away).
 * Not today hides one for the rest of the tab's session.
 */
import type { GoogleReviewDto } from "@chanlytics/contracts";
import type { GoogleSurface } from "@/legacy-bridge/google";

/** How many reviews Need you offers at once: the rest are on Reports' Reviews lens. */
const REVIEWS_OFFERED_MAX = 2;
const NOT_TODAY_KEY = "chanlytics.need-you.reviews-not-today";

/** The reviews set aside this session, by their row's id. */
function notToday(): Set<string> {
  try {
    const raw = sessionStorage.getItem(NOT_TODAY_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Set a review aside for the rest of the tab's session. */
export function reviewNotToday(id: string): void {
  try {
    sessionStorage.setItem(NOT_TODAY_KEY, JSON.stringify([...notToday(), id]));
  } catch {
    // Storage blocked: it stays aside until the row is drawn again.
  }
}

/** The reviews Need you offers to answer, newest first; none without a connected profile. */
export function reviewsToAnswer(google: GoogleSurface | undefined): GoogleReviewDto[] {
  if (!google || !google.dto.connection) return [];
  const aside = notToday();
  return google.dto.reviews
    .filter((r) => !r.reply_text && !r.draft_text && !aside.has(r.id))
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, REVIEWS_OFFERED_MAX);
}
