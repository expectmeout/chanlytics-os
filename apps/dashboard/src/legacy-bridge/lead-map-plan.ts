/**
 * The lead map's streets, the part with no browser in it (D5, continued):
 * where the bundle lives, the style the streets are drawn in, whether the
 * archive covers a place, and the arithmetic that puts contracts' square on
 * the ground. `lead-map.ts` holds the map itself; this is what a test can run.
 */
import type { StyleSpecification } from "maplibre-gl";
import { layers, namedFlavor, type Flavor } from "@protomaps/basemaps";

export type LeadMapTheme = "light" | "dark";

/** The archive's name under the base: the bundle recipe (docs/runbook.md) writes it so. */
export const LEAD_MAP_ARCHIVE = "basemap.pmtiles";

/** MapLibre's worker, served by the app itself (apps/dashboard/public/maplibre/), beside the chunk it imports. */
export const LEAD_MAP_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

/** The address the bundle lives under, without a trailing slash; null when unset, and the page keeps its square. */
export function leadMapBase(value: string | null | undefined): string | null {
  const v = (value || "").trim().replace(/\/+$/, "");
  return v ? v : null;
}

const ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">&copy; OpenStreetMap</a>';

/**
 * The basemap's ground sits on the app's own paper, not the flavour's: the map is a panel of the page, and a
 * different grey behind the streets read as a picture pasted in. Everything else is the flavour's, so the
 * hierarchy of roads, water and labels is the one its authors tuned.
 */
const ON_THE_APPS_PAPER: Record<LeadMapTheme, Partial<Flavor>> = {
  dark: { background: "#26272c", earth: "#1f2024", buildings: "#17181c" },
  light: { background: "#e6e3de", earth: "#f1eee9", buildings: "#e4e1dc" },
};

/** The style: one vector source at the base, the flavour's layers in English, glyphs and sprites beside it. */
export function leadMapStyle(base: string, theme: LeadMapTheme): StyleSpecification {
  const flavor: Flavor = { ...namedFlavor(theme), ...ON_THE_APPS_PAPER[theme] };
  return {
    version: 8,
    glyphs: `${base}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${base}/sprites/v4/${theme}`,
    sources: {
      protomaps: { type: "vector", url: `pmtiles://${base}/${LEAD_MAP_ARCHIVE}`, attribution: ATTRIBUTION },
    },
    layers: layers("protomaps", flavor, { lang: "en" }),
  };
}

export interface LeadMapBounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/** Whether the archive has tiles under this point: its header's bounds, which an extract sets to its bbox. */
export function leadMapCovers(b: LeadMapBounds, p: { lat: number; lng: number }): boolean {
  return p.lng >= b.minLon && p.lng <= b.maxLon && p.lat >= b.minLat && p.lat <= b.maxLat;
}

const M_PER_DEG_LAT = 111_320;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

/** Ground metres per screen pixel at this latitude and zoom (Web Mercator, 512px tiles as MapLibre counts them). */
export function metresPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/** The square contracts drew, as the bounds MapLibre frames: `spanM` across, on `center`. */
export function squareBounds(
  center: { lat: number; lng: number },
  spanM: number,
): [[number, number], [number, number]] {
  const half = Math.max(spanM, 500) / 2;
  const dLat = half / M_PER_DEG_LAT;
  const dLng = half / (M_PER_DEG_LAT * Math.cos((center.lat * Math.PI) / 180));
  return [
    [center.lng - dLng, center.lat - dLat],
    [center.lng + dLng, center.lat + dLat],
  ];
}
