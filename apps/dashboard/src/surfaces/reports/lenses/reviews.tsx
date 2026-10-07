/**
 * The Reviews lens: Google's listing, its rating and its newest reviews, over the period (google.tsx draws the section). Reports does
 * not wait for Google, so "no value" is two things and the lens says which: a read still out draws nothing, and a read that failed
 * is the house's failed read, with its Retry. "Find your business on Google once" is only what Google answers when nothing is linked.
 */
import { FailedRead } from "../../kit/empty/empty";
import { useSurface, useSurfaceFailed } from "../../use-surface";
import { GoogleSection, googleReadable } from "../google";
import { LensEmpty, type LensProps } from "./shared";

export function ReviewsLens({ R }: LensProps) {
  const G = useSurface("google");
  const failed = useSurfaceFailed("google");
  if (!G) {
    return failed ? (
      <FailedRead kind="card" what="your Google reviews" surface="google" testid="reviews-failed" />
    ) : null;
  }
  return googleReadable(G) ? (
    <GoogleSection days={R.days} range={{ since: R.vm.since, until: R.vm.until }} />
  ) : (
    <LensEmpty lens="reviews" vm={R.vm} />
  );
}
