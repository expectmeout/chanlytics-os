/**
 * The lead map's streets (D5, continued).
 *
 * The plot in leads-map.jsx is contracts' square: every lead in metres from
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
import { PMTiles } from "pmtiles";
import { LEAD_MAP_ARCHIVE, leadMapBase, leadMapCovers } from "./lead-map-plan";

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

export interface LeadMapApi {
  /** Resolves once the archive's header was read: which ground it covers. Rejects when the address answers nothing. */
  ready(): Promise<LeadMapCoverage>;
  mount(el: HTMLElement, opts: { onPick(id: string): void; onOpen(id: string): void }): LeadMapHandle;
}

declare global {
  interface Window {
    __LEAD_MAP?: LeadMapApi;
  }
}

/** The streets' own module (lead-map-draw.ts), loaded on the first mount: MapLibre is not in the boot chunk. */
export type LeadMapDraw = {
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
 * Publish the streets to the page, when the product hosts a basemap. Reads the archive's header once so the page
 * can ask what ground it covers; a header that never answers (the address is wrong, the file is missing) leaves
 * the page on its square, quietly. The streets' module is asked for on the first mount, once, and shared.
 */
export function installLeadMap(
  baseValue: string | null | undefined,
  load: LoadDraw = () => import("./lead-map-draw"),
): void {
  const base = leadMapBase(baseValue);
  if (!base) return;
  const absolute = new URL(base, window.location.origin).href.replace(/\/+$/, "");
  const archive = new PMTiles(`${absolute}/${LEAD_MAP_ARCHIVE}`);
  const ready: Promise<LeadMapCoverage> = archive.getHeader().then((h) => ({
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
  window.__LEAD_MAP = {
    ready: () => ready,
    mount: (el, opts) => deferredHandle(streets().then((m) => m.mountStreets(absolute, el, opts))),
  };
}
