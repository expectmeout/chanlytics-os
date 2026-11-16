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

/**
 * An area whose circle holds this many places a search of its kind already holds is read already, whichever search read
 * it: the source answers a term near a place from its top, and the top of such ground is mostly what is held, paid for
 * again and skipped (15 Nov 2026: 434 of 1,073 places a search paid for were the workspace's, near its earlier searches).
 */
export const HELD_IN_AN_AREA = 40;

/** Whether an area's circle holds HELD_IN_AN_AREA of the places already held. */
function holdsMuch(area: LeadArea, held: readonly LatLng[]): boolean {
  if (!area.center || held.length < HELD_IN_AN_AREA) return false;
  let inside = 0;
  for (const place of held) {
    if (haversineM(area.center, place) >= area.radius_m) continue;
    inside += 1;
    if (inside >= HELD_IN_AN_AREA) return true;
  }
  return false;
}

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
  /** Where the places a search of this kind already holds are: this search's, and the workspace's like it. */
  held?: readonly LatLng[];
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
    if (overlaps(area, input.read) || overlaps(area, rung) || holdsMuch(area, input.held ?? [])) continue;
    rung.push(area);
    if (rung.length === RUNG_AREAS) break;
  }
  return rung;
}
