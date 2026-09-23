/**
 * The lead map's streets (D5, continued).
 *
 * The plot in leads-scope.jsx is contracts' square: every lead in metres from
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
import { Map as MapLibreMap, Marker, NavigationControl, ScaleControl, addProtocol, setWorkerUrl } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import {
  LEAD_MAP_ARCHIVE,
  LEAD_MAP_WORKER_URL,
  leadMapBase,
  leadMapCovers,
  leadMapStyle,
  metresPerPixel,
  squareBounds,
  type LeadMapTheme,
} from "./lead-map-plan";

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

/** The theme the page is drawn in: `data-theme` on the app's root, resolved from the member's preference. */
function themeAround(el: HTMLElement): { node: Element | null; theme: LeadMapTheme } {
  const node = el.closest("[data-theme]");
  const theme = node?.getAttribute("data-theme") === "light" ? "light" : "dark";
  return { node, theme };
}

function dressPin(btn: HTMLButtonElement, spec: LeadMapPinSpec, picked: string | null): void {
  btn.className = `ld-pin tone-${spec.tone}${spec.out ? " is-out" : ""}${picked === spec.id ? " on" : ""}`;
  btn.setAttribute("aria-label", spec.label);
  btn.dataset.testid = `lead-pin-${spec.id}`;
}

function mount(
  base: string,
  el: HTMLElement,
  opts: { onPick(id: string): void; onOpen(id: string): void },
): LeadMapHandle {
  const around = themeAround(el);
  let theme = around.theme;
  const map = new MapLibreMap({
    container: el,
    style: leadMapStyle(base, theme),
    attributionControl: { compact: true },
    cooperativeGestures: true,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
    minZoom: 3,
    maxZoom: 17,
    fadeDuration: 0,
  });
  map.addControl(new NavigationControl({ showCompass: false, showZoom: true }), "top-left");
  map.addControl(new ScaleControl({ unit: "imperial", maxWidth: 120 }), "top-right");

  // The theme can change under an open map (the toggle in the top bar); the style follows it. Markers are DOM
  // and survive a setStyle untouched.
  const watcher =
    around.node && typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => {
          const next = themeAround(el).theme;
          if (next === theme) return;
          theme = next;
          map.setStyle(leadMapStyle(base, theme));
        })
      : null;
  if (watcher && around.node) watcher.observe(around.node, { attributes: true, attributeFilter: ["data-theme"] });

  const pins = new Map<string, { marker: Marker; btn: HTMLButtonElement; spec: LeadMapPinSpec }>();
  let picked: string | null = null;
  let ring: { marker: Marker; box: HTMLDivElement; radiusM: number } | null = null;

  const sizeRing = () => {
    if (!ring) return;
    const px = (2 * ring.radiusM) / metresPerPixel(ring.marker.getLngLat().lat, map.getZoom());
    ring.box.style.width = `${px}px`;
    ring.box.style.height = `${px}px`;
  };
  map.on("zoom", sizeRing);

  return {
    setPins(next, pickedNow) {
      picked = pickedNow;
      const keep = new Set<string>();
      for (const spec of next) {
        keep.add(spec.id);
        const have = pins.get(spec.id);
        if (have) {
          have.spec = spec;
          dressPin(have.btn, spec, picked);
          const at = have.marker.getLngLat();
          if (at.lng !== spec.lng || at.lat !== spec.lat) have.marker.setLngLat([spec.lng, spec.lat]);
          continue;
        }
        const wrap = document.createElement("div");
        wrap.className = "ld-pin-mark";
        const btn = document.createElement("button");
        btn.type = "button";
        dressPin(btn, spec, picked);
        btn.addEventListener("mouseenter", () => opts.onPick(spec.id));
        btn.addEventListener("focus", () => opts.onPick(spec.id));
        btn.addEventListener("click", () => opts.onOpen(spec.id));
        wrap.appendChild(btn);
        const marker = new Marker({ element: wrap, anchor: "center" }).setLngLat([spec.lng, spec.lat]).addTo(map);
        pins.set(spec.id, { marker, btn, spec });
      }
      for (const [id, p] of pins) {
        if (keep.has(id)) continue;
        p.marker.remove();
        pins.delete(id);
      }
    },
    setPicked(next) {
      picked = next;
      for (const p of pins.values()) {
        dressPin(p.btn, p.spec, picked);
        // The pin under the pointer rises above its neighbours, as it does on the square.
        p.marker.getElement().style.zIndex = picked === p.spec.id ? "3" : "";
      }
    },
    setRing(next) {
      if (!next) {
        ring?.marker.remove();
        ring = null;
        return;
      }
      if (!ring) {
        const box = document.createElement("div");
        box.className = "ld-map-ring";
        box.setAttribute("aria-hidden", "true");
        box.dataset.testid = "lead-map-ring";
        const marker = new Marker({ element: box, anchor: "center" }).setLngLat([next.lng, next.lat]).addTo(map);
        ring = { marker, box, radiusM: next.radiusM };
      } else {
        ring.marker.setLngLat([next.lng, next.lat]);
        ring.radiusM = next.radiusM;
      }
      sizeRing();
    },
    fit(center, spanM) {
      const points: [number, number][] = [...pins.values()].map((p) => [p.spec.lng, p.spec.lat]);
      if (ring) {
        const at = ring.marker.getLngLat();
        for (const [w, s] of [squareBounds({ lat: at.lat, lng: at.lng }, ring.radiusM * 2)]) points.push(w, s);
      }
      const bounds = points.length
        ? points.reduce<[[number, number], [number, number]]>(
            (b, [lng, lat]) => [
              [Math.min(b[0][0], lng), Math.min(b[0][1], lat)],
              [Math.max(b[1][0], lng), Math.max(b[1][1], lat)],
            ],
            [
              [points[0][0], points[0][1]],
              [points[0][0], points[0][1]],
            ],
          )
        : squareBounds(center, spanM);
      map.fitBounds(bounds, { padding: 48, duration: 0, maxZoom: 15 });
      sizeRing();
    },
    destroy() {
      watcher?.disconnect();
      for (const p of pins.values()) p.marker.remove();
      pins.clear();
      ring?.marker.remove();
      ring = null;
      map.remove();
    },
  };
}

/**
 * Publish the streets to the page, when the product hosts a basemap. Reads the archive's header once so the page
 * can ask what ground it covers; a header that never answers (the address is wrong, the file is missing) leaves
 * the page on its square, quietly.
 */
export function installLeadMap(baseValue: string | null | undefined): void {
  const base = leadMapBase(baseValue);
  if (!base) return;
  const absolute = new URL(base, window.location.origin).href.replace(/\/+$/, "");
  // MapLibre draws in a worker it finds beside its own bundle by `import.meta.url`, which the app's bundler does
  // not preserve; so the worker and the chunk it imports are vendored under public/maplibre/ (the same bytes as
  // the installed package: maplibre-worker-vendored.test.mjs holds them together) and named here.
  setWorkerUrl(LEAD_MAP_WORKER_URL);
  addProtocol("pmtiles", new Protocol().tile);
  const archive = new PMTiles(`${absolute}/${LEAD_MAP_ARCHIVE}`);
  const ready: Promise<LeadMapCoverage> = archive.getHeader().then((h) => ({
    covers: (p) => leadMapCovers({ minLon: h.minLon, minLat: h.minLat, maxLon: h.maxLon, maxLat: h.maxLat }, p),
  }));
  ready.catch(() => {});
  window.__LEAD_MAP = {
    ready: () => ready,
    mount: (el, opts) => mount(absolute, el, opts),
  };
}
