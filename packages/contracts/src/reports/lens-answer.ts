/**
 * The one sentence the head says for a lens (the lenses spec, D4: the head stays "Reports" and the lens's answer stands beside
 * it): taken from the view model that holds it, never composed on the page. A lens with nothing to say of itself says
 * nothing, and the head is its name alone. The People lens always has a sentence: its own where its read has landed and
 * said one, else the frame's count of new people, which a quiet period has too (a type import alone: the fold that
 * builds the lens's head stays in the page-only entry, out of the route's chunk). The Campaigns lens's is the head of its own
 * read the same way, and nothing before that read lands or where it could not be made. The Ads lens's (a demo session's for now) is the
 * head of its fold, and nothing where the fold is not drawn.
 */
import type { DealReportVM } from "../deals/deal-report";
import type { LensId } from "./lenses";
import type { PeopleReportVM } from "./people/people-report";
import type { ReportVM } from "./reports";
import type { ReviewsReportVM } from "./review-report";

export function lensAnswerOf(
  lens: LensId,
  parts: {
    vm: ReportVM;
    /** The Campaigns lens's own read, which the page holds beside the report: its head alone; null where it has not landed or failed. */
    campaigns: { head: string | null } | null;
    deals: DealReportVM | null | undefined;
    /** The Reviews lens's own read, which the page holds beside the report; null where it has not landed. */
    reviews: ReviewsReportVM | null;
    /** The People lens's own read, which the page holds beside the report: its head alone; null where it has not landed. */
    people: Pick<PeopleReportVM, "head"> | null;
    /** The Ads lens's fold, which the page holds beside the report (a demo session's): its head alone; none where it is not drawn. */
    ads?: { head: string | null } | null;
  },
): string | undefined {
  const { vm, campaigns, deals, reviews, people, ads } = parts;
  switch (lens) {
    case "overview":
      return vm.empty ? undefined : vm.lines.hero;
    case "receptionist":
      return vm.empty ? undefined : (vm.lines.receptionist ?? undefined);
    case "people":
      // No `vm.empty` gate: a period nobody wrote in still says how many new people reached you (none).
      return people?.head ?? vm.lines.people;
    case "pipeline":
      return deals?.present ? deals.headline : undefined;
    case "campaigns":
      return campaigns?.head ?? undefined;
    case "ads":
      return ads?.head ?? undefined;
    case "reviews":
      return reviews && !reviews.empty ? (reviews.lines.head ?? undefined) : undefined;
  }
}
