/**
 * What Reports says to the frame's head (the lenses spec, D4): its name on every lens, and the lens's own answer beside it, one
 * sentence from contracts (`lensAnswerOf`), taken from the view models the page draws, so no two of them say different numbers.
 * Nothing while the page has no read to answer from.
 */
import { lensAnswerOf, type LensId } from "@chanlytics/contracts";
import { useStanding } from "../kit/head/standing";
import type { ReportsSurface } from "./surface";

export function useReportsStanding(lens: LensId, R: ReportsSurface | null): void {
  useStanding({ title: "Reports", sentence: R ? lensAnswerOf(lens, R) : undefined });
}
