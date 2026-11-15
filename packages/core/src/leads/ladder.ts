/**
 * The distance ladder (decision 0133): where a search looks once the area on its card is read. Each rung is the nearest
 * ZIP areas past that area and inside the search's reach (contracts' reachOf: the owner's, or 25 miles from a city, 15
 * from a ZIP, twice a circle's radius), each said in its own state (nearestAreas). No area of a rung lies within its own
 * radius of an area read before or of another in the same rung, so a leg reads ground no earlier leg read: the source
 * charges for every place it returns, a duplicate too. The rungs walk outward until the reach holds no such ZIP; a
 * reach of 0 is the area alone, and no rung.
 *
 * Pure: the runner keeps what was read (each leg's area, on its round) and asks for the next rung when a round ends
 * short of its count.
 */
import { reachOf, type LeadArea, type LeadSearchPlan } from "@chanlytics/contracts";
import { haversineM, nearestAreas, type LatLng } from "./geo";

/** One area as the search's rounds name it: two rounds of one area read the same ground. */
export const areaKey = (area: Pick<LeadArea, "kind" | "label">): string => `${area.kind}:${area.label}`;

/** How many areas one rung names: the first is the next leg's, all of them the owner's "look near" when widening is off. */
const RUNG_AREAS = 3;
/** Every ZIP centre nearestAreas could give inside any reach, so the spacing below has all of them to choose from. */
const ALL_ZIPS = 100_000;

/** Whether an area's circle reaches the centre of one already read or chosen: its ground is already read. */
const overlaps = (area: LeadArea, taken: readonly Pick<LeadArea, "center" | "zip">[]): boolean =>
  taken.some(
    (other) =>
      (area.zip !== undefined && area.zip === other.zip) ||
      (area.center !== null && other.center !== null && haversineM(area.center, other.center) < area.radius_m),
  );

/** The next rung: up to three ZIP areas, nearest first, or none when the reach is read or there is no centre to measure from. */
export function nextRung(input: {
  plan: Pick<LeadSearchPlan, "area" | "reach_m">;
  center: LatLng | null;
  /** How far the area on the card reaches from its centre: nothing inside it is a rung. */
  areaRadiusM: number;
  /** The areas earlier legs read. */
  read: readonly Pick<LeadArea, "center" | "zip">[];
}): LeadArea[] {
  const reach = reachOf(input.plan.area, input.plan.reach_m);
  if (!input.center || reach <= input.areaRadiusM) return [];
  const rung: LeadArea[] = [];
  for (const area of nearestAreas(input.center, {
    excludeWithinM: input.areaRadiusM,
    take: ALL_ZIPS,
    maxM: reach,
    state: input.plan.area.state,
  })) {
    if (overlaps(area, input.read) || overlaps(area, rung)) continue;
    rung.push(area);
    if (rung.length === RUNG_AREAS) break;
  }
  return rung;
}
