/**
 * What Reports says to the frame's head (the lenses spec, D4): its name on every lens, and the lens's own answer beside it, one
 * sentence from contracts (`lensAnswerOf`), taken from the view models the page draws, so no two of them say different numbers
 * (Reviews' is the fold of its own read, `reports_reviews`, that its figures are drawn from: the page hands it over; People's
 * is the head of its own read, `reports_people`, the same way, and until that lands the frame's own count of new people; so is
 * Campaigns', the head of `reports_campaigns`, and nothing before it lands or where it could not be made).
 * Nothing while the page has no read to answer from. A lens is picked in the strip of lenses, so none has a way back above the
 * name (Ruben, 6 Oct 2026: "‹ Reports" over a lens said again what the strip's Overview says), as People's scopes and
 * Campaigns' tabs have none. The act is the page's own (the period, on a desk: reports-page.tsx), at the strip's right.
 */
import type { ReactNode } from "react";
import { lensAnswerOf, type LensId, type ReviewsReportVM } from "@chanlytics/contracts";
import type { CampaignLensVM, PeopleReportVM } from "@chanlytics/contracts/report-lens";
import { useStanding } from "../kit/head/standing";
import type { ReportsSurface } from "./surface";

/** The lens reads the page holds beside the report, whose own sentence a head says: each null where its read has not landed. One object: the surfaces tree takes at most four parameters (max-params). */
interface ReportsHeads {
  reviews: ReviewsReportVM | null;
  people: Pick<PeopleReportVM, "head"> | null;
  campaigns: Pick<CampaignLensVM, "head"> | null;
}

export function useReportsStanding(
  lens: LensId,
  R: ReportsSurface | null,
  heads: ReportsHeads,
  act: ReactNode = null,
): void {
  useStanding({
    title: "Reports",
    sentence: R ? lensAnswerOf(lens, { ...R, ...heads }) : undefined,
    act: act ?? undefined,
    back: null,
  });
}
