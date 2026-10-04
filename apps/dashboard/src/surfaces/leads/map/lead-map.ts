/**
 * The lead map's streets (D5, continued).
 *
 * The plot in map.tsx is contracts' square: every lead in metres from
 * one centre, no projection, no tile, no request to anyone. That was the seam
 * the plan left for streets, and this is what fills it: MapLibre over a
 * Protomaps basemap the product hosts ITSELF -- one PMTiles archive, the fonts
 * its labels are set in and the sprites its icons come from, all under one
 * base address (NEXT_PUBLIC_LEAD_MAP_BASE). Nothing here reaches a map vendor:
 * the browser reads byte ranges of the archive from that address and draws the
 * streets on its own. docs/runbook.md, "The lead map's streets", says how the
 * bundle is made and where it goes.
 *
 * With the address empty the page keeps its square, exactly as before. With it
 * set, the page asks whether the archive COVERS the place it is looking at (a
 * metro extract covers one city; the whole country is 19 GB, so a workspace may
 * start smaller) and draws streets only where it does -- a lead in a city the
 * archive has not got still stands on the square, never on a blank map.
 *
 * The pins stay the page's: the same `.ld-pin` element, the same tone classes
 * from contracts' registry, so a pin on the streets says what its row says. The
 * area a search asked for is the same `.ld-map-ring`, sized in pixels from its
 * radius at the zoom the map is at.
 */

/** The archive's name under the base: the bundle recipe (docs/runbook.md) writes it so. */
export const LEAD_MAP_ARCHIVE = "basemap.pmtiles";

/** The address the bundle lives under, without a trailing slash; null when unset, and the page keeps its square. */
export function leadMapBase(value: string | null | undefined): string | null {
  const v = (value || "").trim().replace(/\/+$/, "");
  return v ? v : null;
}

interface LeadMapBounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/** Whether the archive has tiles under this point: its header's bounds, which an extract sets to its bbox. */
export function leadMapCovers(b: LeadMapBounds, p: { lat: number; lng: number }): boolean {
  return p.lng >= b.minLon && p.lng <= b.maxLon && p.lat >= b.minLat && p.lat <= b.maxLat;
}

/** What the page hands the streets for each lead the source placed. */
export interface LeadMapPinSpec {
  id: string;
  lat: number;
  lng: number;
  /** The registry's tone (contracts leadPinTone): `ok`, `warn`, `info`, `danger`, `plain`. */
  tone: string;
  /** Left out: the pin steps back, as its row does. */
  out: boolean;
  /** "Name — kind · where": what the pin says to a screen reader and on hover. */
  label: string;
}

export interface LeadMapRingSpec {
  lat: number;
  lng: number;
  radiusM: number;
}

export interface LeadMapHandle {
  setPins(pins: LeadMapPinSpec[], picked: string | null): void;
  setPicked(picked: string | null): void;
  setRing(ring: LeadMapRingSpec | null): void;
  /**
   * Frame what is on the map: every pin and the whole ring, with room round them; with nothing placed yet, contracts'
   * square (`spanM` metres across on `center`), so the ground is the one the page is looking at.
   */
  fit(center: { lat: number; lng: number }, spanM: number): void;
  destroy(): void;
}

export interface LeadMapCoverage {
  covers(p: { lat: number; lng: number }): boolean;
}

interface LeadMapApi {
  /** Resolves once the archive's header was read: which ground it covers. Rejects when the address answers nothing. */
  ready(): Promise<LeadMapCoverage>;
  mount(el: HTMLElement, opts: { onPick(id: string): void; onOpen(id: string): void }): LeadMapHandle;
}

/** The streets, once installed with a base the product hosts; null with none, and the page keeps its square. */
let installed: LeadMapApi | null = null;

/** What the map draws its streets through (installLeadMap below), or null where there is no basemap. */
export function leadMapApi(): LeadMapApi | null {
  return installed;
}

/** The streets' own module (lead-map-draw.ts), loaded on the first mount: MapLibre is not in the boot chunk. */
type LeadMapDraw = {
  prepare(): void;
  mountStreets(
    base: string,
    el: HTMLElement,
    opts: { onPick(id: string): void; onOpen(id: string): void },
  ): LeadMapHandle;
};
type LoadDraw = () => Promise<LeadMapDraw>;

/**
 * A handle the page can use at once while the streets are still loading: what it asks for before they land is
 * kept in order and done the moment they do; after that every call goes straight through. A handle destroyed before
 * they land destroys them on arrival and does nothing else.
 */
export function deferredHandle(streets: Promise<LeadMapHandle>): LeadMapHandle {
  let real: LeadMapHandle | null = null;
  let gone = false;
  const queue: Array<(h: LeadMapHandle) => void> = [];
  streets.then(
    (h) => {
      if (gone) {
        h.destroy();
        return;
      }
      real = h;
      for (const call of queue.splice(0)) call(h);
    },
    () => {
      // The streets never came (the module failed to load): the page keeps its square, and every call is nothing.
      queue.length = 0;
    },
  );
  const on = (call: (h: LeadMapHandle) => void) => {
    if (gone) return;
    if (real) call(real);
    else queue.push(call);
  };
  return {
    setPins: (pins, picked) => on((h) => h.setPins(pins, picked)),
    setPicked: (picked) => on((h) => h.setPicked(picked)),
    setRing: (ring) => on((h) => h.setRing(ring)),
    fit: (center, spanM) => on((h) => h.fit(center, spanM)),
    destroy: () => {
      if (gone) return;
      gone = true;
      queue.length = 0;
      if (real) real.destroy();
    },
  };
}

/**
 * Hand the streets to the page, when the product hosts a basemap; with none there are none (leadMapApi answers null).
 * Reads the archive's header once so the page can ask what ground it covers; a header that never answers (the address is wrong, the file is missing) leaves
 * the page on its square, quietly. The streets' module is asked for on the first mount, once, and shared.
 */
export function installLeadMap(
  baseValue: string | null | undefined,
  load: LoadDraw = () => import("./lead-map-draw"),
): void {
  const base = leadMapBase(baseValue);
  if (!base) {
    installed = null;
    return;
  }
  const absolute = new URL(base, window.location.origin).href.replace(/\/+$/, "");
  // The archive's reader comes with its own chunk, asked for here as before: pmtiles and its inflater were on every
  // page's first load for a header only the Leads map reads (2 Oct 2026).
  const ready: Promise<LeadMapCoverage> = import("pmtiles")
    .then(({ PMTiles }) => new PMTiles(`${absolute}/${LEAD_MAP_ARCHIVE}`).getHeader())
    .then((h) => ({
      covers: (p) => leadMapCovers({ minLon: h.minLon, minLat: h.minLat, maxLon: h.maxLon, maxLat: h.maxLat }, p),
    }));
  ready.catch(() => {});
  let draw: Promise<LeadMapDraw> | null = null;
  const streets = () => {
    draw ??= load().then((m) => {
      m.prepare();
      return m;
    });
    return draw;
  };
  installed = {
    ready: () => ready,
    mount: (el, opts) => deferredHandle(streets().then((m) => m.mountStreets(absolute, el, opts))),
  };
}
