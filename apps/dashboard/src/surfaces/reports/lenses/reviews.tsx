/**
 * The Reviews lens: what customers say on Google, drawn from its own read (`reports_reviews`, reviews-surface.ts) and nothing else
 * (google.tsx draws the section). The page does not wait for that read, so "no value" is two things and the lens says which: a read
 * still out draws nothing, and a read that failed is the house's failed read, with its Retry. "Find your business on Google once" is
 * only what Google answers when nothing can be linked. The read is of the period it says, and Reports' strip of the one it says: a
 * pick lands in two reads, each when it is made, and while they differ the page dims by the one rule every page uses
 * (`useReviewsLag`, which the page reads for its `busy`); when the Reviews read for the pick could not be made, the lens says so
 * with its Retry, and never holds the period it left under the new one's name.
 */
import { FailedRead } from "../../kit/empty/empty";
import { useSurface, useSurfaceDegraded, useSurfaceFailed } from "../../use-surface";
import { GoogleSection, googleReadable } from "../google";
import type { ReportsSurface } from "../surface";
import { LensEmpty, type LensProps } from "./shared";

/**
 * Where the Reviews read stands against the period Reports shows: "coming" while the read for a pick is out (what is held is of
 * the period left), "failed" when that read could not be made (the surface's latest read failed after one had landed, which
 * `useSurfaceFailed` does not say), and null when what is held is of the period shown or none is held.
 */
export function useReviewsLag(R: ReportsSurface | null): "coming" | "failed" | null {
  const held = useSurface("reports_reviews");
  const stopped = useSurfaceDegraded("reports_reviews");
  if (!R || !held || held.period === R.period) return null;
  return stopped ? "failed" : "coming";
}

/** The house's failed read for the Reviews read: its Retry reads the surface again. */
function readFailed() {
  return <FailedRead kind="card" what="your Google reviews" surface="reports_reviews" testid="reviews-failed" />;
}

export function ReviewsLens({ R }: LensProps) {
  const V = useSurface("reports_reviews");
  const failed = useSurfaceFailed("reports_reviews");
  const lag = useReviewsLag(R);
  if (!V) return failed ? readFailed() : null;
  if (lag === "failed") return readFailed();
  if (!googleReadable(V.dto.google)) return <LensEmpty lens="reviews" vm={R.vm} />;
  return <GoogleSection V={V.vm} range={{ since: R.vm.since, until: R.vm.until }} />;
}
