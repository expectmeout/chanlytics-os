/**
 * Geography (PRD E7, decision 31): a ZIP ask takes its center from the bundled
 * ZCTA table; a city ask is geocoded by the card's own location query and its
 * center is the median of the probe's coordinates, with a radius from their
 * spread. Distance is haversine, in metres, deterministic. No other gazetteer
 * is bundled.
 *
 * zcta-centroids.json is written by tooling/scripts/gen-zcta-centroids.mjs
 * from the Census 2020 gazetteer: [zip, lat, lng] triples sorted by zip.
 */
import type { LeadArea } from "@chanlytics/contracts";
import ZCTA from "./zcta-centroids.json" with { type: "json" };

export interface LatLng {
  lat: number;
  lng: number;
}

const TABLE = ZCTA as [string, number, number][];
const R = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

/** The ZCTA's internal point, or null for a ZIP the table does not have (a PO-box-only ZIP, a typo). */
export function zctaCenter(zip: string): LatLng | null {
  const z = zip.trim();
  let lo = 0;
  let hi = TABLE.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const row = TABLE[mid];
    if (row[0] === z) return { lat: row[1], lng: row[2] };
    if (row[0] < z) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The median of the points, coordinate by coordinate: robust to one listing geocoded on the wrong coast. */
export function medianCenter(points: LatLng[]): LatLng | null {
  if (!points.length) return null;
  return { lat: median(points.map((p) => p.lat)), lng: median(points.map((p) => p.lng)) };
}

export const RADIUS_MIN_M = 5_000;
export const RADIUS_MAX_M = 60_000;

/** A radius from the spread: twice the distance within which three quarters of the probe's places fall, clamped. */
export function radiusFromSpread(center: LatLng, points: LatLng[]): number {
  if (!points.length) return RADIUS_MIN_M;
  const ds = points.map((p) => haversineM(center, p)).sort((a, b) => a - b);
  const q3 = ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.75))];
  return Math.max(RADIUS_MIN_M, Math.min(RADIUS_MAX_M, q3 * 2));
}

/** Inside the circle; a place with no location is never inside (PRD §0.1: Needs review). */
export function inArea(center: LatLng | null, radiusM: number, point: LatLng | null): boolean {
  if (!center || !point) return false;
  return haversineM(center, point) <= radiusM;
}

/**
 * Where to look when an area ran dry (D3): the nearest ZCTA centres past a ring around the centre, nearest first,
 * each as an area the plan can take -- a ZIP with its own centre and a radius that reads as "near 78660". The ring
 * keeps them out of the area just searched; the ceiling keeps them a drive away, not a flight.
 */
export function nearestAreas(
  center: LatLng,
  o: { excludeWithinM: number; take: number; maxM?: number; state?: string },
): LeadArea[] {
  const max = o.maxM ?? RADIUS_MAX_M;
  const state = (o.state ?? "").trim().toUpperCase();
  return TABLE.map(([zip, lat, lng]) => ({ zip, lat, lng, d: haversineM(center, { lat, lng }) }))
    .filter((x) => x.d >= o.excludeWithinM && x.d <= max)
    .sort((a, b) => a.d - b.d || (a.zip < b.zip ? -1 : 1))
    .slice(0, Math.max(0, o.take))
    .map((x) => ({
      kind: "zip" as const,
      label: `near ${x.zip}`,
      state,
      center: { lat: x.lat, lng: x.lng },
      radius_m: 8_000,
      zip: x.zip,
      query: state ? `${x.zip}, ${state}, USA` : `${x.zip}, USA`,
    }));
}
