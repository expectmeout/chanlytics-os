/**
 * The streets themselves: MapLibre over the product's own basemap (lead-map.ts says what and why). This module is
 * loaded when a page first draws them, never at boot: measured on production (25 Sep 2026) the map's library rode
 * in the shell's boot chunk on every page, a person's included -- 364 references to maplibre in 2.65 MB, roughly a
 * quarter of a megabyte compressed, parsed for a map nobody had opened. lead-map.ts publishes the page's door and
 * asks for this the first time it is walked through.
 */
import { Map as MapLibreMap, Marker, NavigationControl, ScaleControl, addProtocol, setWorkerUrl } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { LEAD_MAP_WORKER_URL, leadMapStyle, metresPerPixel, squareBounds, type LeadMapTheme } from "./lead-map-plan";
import type { LeadMapHandle, LeadMapPinSpec } from "./lead-map";

let prepared = false;
/**
 * Once per page: where MapLibre's worker is (vendored under public/maplibre/, since the app's bundler does not keep
 * the `import.meta.url` the library finds it by; maplibre-worker-vendored.test.mjs holds the two together), and how
 * it reads the archive's tiles.
 */
export function prepare(): void {
  if (prepared) return;
  prepared = true;
  setWorkerUrl(LEAD_MAP_WORKER_URL);
  addProtocol("pmtiles", new Protocol().tile);
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

export function mountStreets(
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
