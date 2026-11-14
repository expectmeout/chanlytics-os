/**
 * The distance ladder (decision 0133): where a search looks once the area on its card is read. Each rung is the nearest
 * ZIP areas past that area and inside the search's reach (contracts' reachOf: the owner's, or 25 miles from a city, 15
 * from a ZIP, twice a circle's radius), never one an earlier rung read, each said in its own state (nearestAreas). The
 * rungs walk outward until the reach holds no ZIP left to read; a reach of 0 is the area alone, and no rung.
 *
 * Pure: the runner keeps what was read and asks for the next rung when a round ends short of its count.
 */
import { reachOf, type LeadArea, type LeadSearchPlan } from "@chanlytics/contracts";
import { nearestAreas, type LatLng } from "./geo";

/** How many areas one rung reads side by side. */
const RUNG_AREAS = 3;

/** The next rung: up to three ZIP areas, nearest first, or none when the reach is read or there is no centre to measure from. */
export function nextRung(input: {
  plan: Pick<LeadSearchPlan, "area" | "reach_m">;
  center: LatLng | null;
  /** How far the area on the card reaches from its centre: nothing inside it is a rung. */
  areaRadiusM: number;
  /** The ZIPs earlier rungs read. */
  read: readonly string[];
}): LeadArea[] {
  const reach = reachOf(input.plan.area, input.plan.reach_m);
  if (!input.center || reach <= input.areaRadiusM) return [];
  const read = new Set(input.read);
  return nearestAreas(input.center, {
    excludeWithinM: input.areaRadiusM,
    take: read.size + RUNG_AREAS,
    maxM: reach,
    state: input.plan.area.state,
  })
    .filter((area) => !area.zip || !read.has(area.zip))
    .slice(0, RUNG_AREAS);
}
