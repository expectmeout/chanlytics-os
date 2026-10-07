/**
 * The one sentence the head says for a lens (the lenses spec, D4: the head stays "Reports" and the lens's answer stands beside
 * it): taken from the view model that holds it, never composed on the page. A lens with nothing to say of itself says
 * nothing, and the head is its name alone.
 */
import type { DealReportVM } from "../deals/deal-report";
import type { CampaignReportVM } from "./campaign-report";
import type { LensId } from "./lenses";
import type { ReportVM } from "./reports";
import type { ReviewsReportVM } from "./review-report";

export function lensAnswerOf(
  lens: LensId,
  parts: {
    vm: ReportVM;
    campaigns: CampaignReportVM | null;
    deals: DealReportVM | null | undefined;
    /** The Reviews lens's own read, which the page holds beside the report; absent where it has not landed. */
    reviews?: ReviewsReportVM | null;
  },
): string | undefined {
  const { vm, campaigns, deals, reviews } = parts;
  switch (lens) {
    case "overview":
      return vm.empty ? undefined : vm.lines.hero;
    case "receptionist":
      return vm.empty ? undefined : (vm.lines.answered ?? undefined);
    case "people":
      return vm.empty ? undefined : (vm.lines.channels ?? undefined);
    case "pipeline":
      return deals?.present ? deals.headline : undefined;
    case "campaigns":
      return campaigns && !campaigns.empty ? campaigns.lines.funnel : undefined;
    case "reviews":
      return reviews && !reviews.empty ? (reviews.lines.head ?? undefined) : undefined;
  }
}
