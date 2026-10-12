/**
 * The Reviews lens: what customers say on Google, drawn from its own read (`reports_reviews`, reviews-surface.ts) and nothing else
 * (google.tsx draws the section). The page does not wait for that read, so "no value" is two things and the lens says which: a read
 * still out draws nothing, and a read that failed is the house's failed read, with its Retry. The read is of the period it says, and
 * Reports' strip of the one it says: a pick lands in two reads, each when it is made, and while they differ the page dims by the one
 * rule every page uses (the follower's `coming`, which the page reads for its `busy`); when the Reviews read for the pick could not
 * be made, the lens says so with its Retry, and never holds the period it left under the new one's name.
 */
import type { LensRange } from "@chanlytics/contracts";
import { FailedRead } from "../../kit/empty/empty";
import type { Follower } from "../../use-surface";
import { GoogleSection } from "../google";
import type { ReviewsSurface } from "../reviews-surface";

/** The house's failed read for the Reviews read: its Retry reads the surface again. */
function readFailed() {
  return <FailedRead kind="card" what="your Google reviews" surface="reports_reviews" testid="reviews-failed" />;
}

export function ReviewsLens({
  reviews,
  range,
  phone,
  review,
}: {
  reviews: Follower<ReviewsSurface>;
  range: LensRange;
  phone: boolean;
  /** The review the address names (reports/reviews:<id>): drawn where it is listed, with its reply box open. */
  review: string | null;
}) {
  const { value, state } = reviews;
  if (state === "failed") return readFailed();
  if (!value) return null;
  return <GoogleSection V={value.vm} range={range} phone={phone} review={review} />;
}
