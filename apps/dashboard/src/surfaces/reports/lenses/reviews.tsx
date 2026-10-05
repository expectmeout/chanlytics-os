/** The Reviews lens: Google's listing, its rating and its newest reviews, over the period (google.tsx draws the section). */
import { useSurface } from "../../use-surface";
import { GoogleSection, googleReadable } from "../google";
import { LensEmpty, type LensProps } from "./shared";

export function ReviewsLens({ R }: LensProps) {
  const G = useSurface("google");
  return googleReadable(G) ? (
    <GoogleSection days={R.days} range={{ since: R.vm.since, until: R.vm.until }} />
  ) : (
    <LensEmpty lens="reviews" vm={R.vm} />
  );
}
