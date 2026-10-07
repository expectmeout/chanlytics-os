/**
 * The Reviews lens: what customers say on Google, drawn from its own read (`reports_reviews`, reviews-surface.ts) and nothing else
 * (google.tsx draws the section). The page does not wait for that read, so "no value" is two things and the lens says which: a read
 * still out draws nothing, and a read that failed is the house's failed read, with its Retry. "Find your business on Google once" is
 * only what Google answers when nothing can be linked. The read is of the period it says, and Reports' strip of the one it says: the
 * body dims, by the one rule every page uses, while the two differ (a pick lands in two reads, each when it is made).
 */
import { FailedRead } from "../../kit/empty/empty";
import { useSurface, useSurfaceFailed } from "../../use-surface";
import { GoogleSection, googleReadable } from "../google";
import { LensEmpty, type LensProps } from "./shared";

export function ReviewsLens({ R }: LensProps) {
  const V = useSurface("reports_reviews");
  const failed = useSurfaceFailed("reports_reviews");
  if (!V) {
    return failed ? (
      <FailedRead kind="card" what="your Google reviews" surface="reports_reviews" testid="reviews-failed" />
    ) : null;
  }
  if (!googleReadable(V.dto.google)) return <LensEmpty lens="reviews" vm={R.vm} />;
  const behind = V.period !== R.period;
  return (
    <div data-loading={behind ? "" : undefined}>
      <div data-dims aria-busy={behind ? "true" : "false"}>
        <GoogleSection V={V.vm} range={{ since: R.vm.since, until: R.vm.until }} />
      </div>
    </div>
  );
}
