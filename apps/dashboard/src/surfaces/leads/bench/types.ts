/** What the review bench and the bulk bar take of the page: Needs review's resolvers (D3), and an area to look in next. */
import type { LeadArea, LeadReviewAct } from "@chanlytics/contracts";

/** An area the round wrote when it ran dry (00145), or one Claude named near the search's own. */
export type NearbyArea = LeadArea;

/**
 * Needs review's resolvers (D3): which acts a set of its leads takes, and the doors. Keep and Exclude go through the bulk
 * door (00145); Check again through its own, and only where its courier exists, so nothing offers what no door can do.
 */
export interface ReviewDoors {
  actsFor: (ids: string[]) => LeadReviewAct[];
  canCheckAgain: boolean;
  onCheckAgain: (ids: string[]) => unknown;
  onKeep: (ids: string[]) => unknown;
  onExclude: (ids: string[]) => unknown;
}
