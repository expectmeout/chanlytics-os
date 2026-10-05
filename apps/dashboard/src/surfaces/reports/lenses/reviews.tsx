/** The Reviews lens: Google's listing, its rating and its newest reviews, over the period (google.tsx draws the section). */
import { GoogleSection } from "../google";
import type { LensProps } from "./shared";

export function ReviewsLens({ R }: LensProps) {
  return <GoogleSection days={R.days} />;
}
