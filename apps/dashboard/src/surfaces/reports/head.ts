/**
 * What Reports says to the frame's head (the lenses spec, D4): its name on every lens, and the lens's own answer beside it, one
 * sentence from contracts (`lensAnswerOf`), taken from the view models the page draws, so no two of them say different numbers.
 * Nothing while the page has no read to answer from. A lens is picked in the strip of lenses, so none has a way back above the
 * name (Ruben, 6 Oct 2026: "‹ Reports" over a lens said again what the strip's Overview says), as People's scopes and
 * Campaigns' tabs have none. The act is the page's own (the period, on a desk: reports-page.tsx), at the strip's right.
 */
import type { ReactNode } from "react";
import { lensAnswerOf, type LensId } from "@chanlytics/contracts";
import { useStanding } from "../kit/head/standing";
import type { ReportsSurface } from "./surface";

export function useReportsStanding(lens: LensId, R: ReportsSurface | null, act: ReactNode = null): void {
  useStanding({ title: "Reports", sentence: R ? lensAnswerOf(lens, R) : undefined, act: act ?? undefined, back: null });
}
