/**
 * The lead map's streets, the part with no browser in it (legacy-bridge/lead-map-plan.ts):
 * where the bundle lives, the style the streets are drawn in, what ground the archive
 * covers, and the arithmetic that puts contracts' square on the ground.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

const { leadMapBase, leadMapStyle, leadMapCovers, metresPerPixel, squareBounds, LEAD_MAP_ARCHIVE } = await importSrc(
  "apps/dashboard/src/legacy-bridge/lead-map-plan.ts",
);

test("the base: unset or blank means no streets; a trailing slash is not part of an address", () => {
  assert.equal(leadMapBase(undefined), null);
  assert.equal(leadMapBase(""), null);
  assert.equal(leadMapBase("   "), null);
  assert.equal(leadMapBase("/lead-map/"), "/lead-map");
  assert.equal(
    leadMapBase("https://x.supabase.co/storage/v1/object/public/lead-map//"),
    "https://x.supabase.co/storage/v1/object/public/lead-map",
  );
});

test("the style reads everything from under the base: the archive, the glyphs, the sprites; and its ground is the app's paper", () => {
  const dark = leadMapStyle("https://h/lead-map", "dark");
  assert.equal(dark.version, 8);
  assert.equal(dark.glyphs, "https://h/lead-map/fonts/{fontstack}/{range}.pbf");
  assert.equal(dark.sprite, "https://h/lead-map/sprites/v4/dark");
  assert.equal(dark.sources.protomaps.url, `pmtiles://https://h/lead-map/${LEAD_MAP_ARCHIVE}`);
  assert.match(
    String(dark.sources.protomaps.attribution),
    /openstreetmap\.org\/copyright/,
    "OpenStreetMap is credited",
  );
  assert.ok(dark.layers.length > 20, "the flavour's layers, not a blank sheet");
  const background = dark.layers.find((l) => l.type === "background");
  assert.equal(
    background.paint["background-color"],
    "#26272c",
    "the ground is the app's dark paper, not the flavour's grey",
  );
  const light = leadMapStyle("/lead-map", "light");
  assert.equal(light.sprite, "/lead-map/sprites/v4/light");
  assert.equal(light.layers.find((l) => l.type === "background").paint["background-color"], "#e6e3de");
  // Every layer reads the one source, so nothing in the style reaches anywhere but the base.
  for (const l of dark.layers) if (l.type !== "background") assert.equal(l.source, "protomaps", l.id);
});

test("coverage is the archive's own bounds: inside draws streets, outside keeps the square", () => {
  const nyc = { minLon: -74.6, minLat: 40.4, maxLon: -73.4, maxLat: 41.1 };
  assert.equal(leadMapCovers(nyc, { lat: 40.7282, lng: -73.7949 }), true, "Queens");
  assert.equal(leadMapCovers(nyc, { lat: 25.7617, lng: -80.1918 }), false, "Miami");
  assert.equal(leadMapCovers(nyc, { lat: 40.4, lng: -74.6 }), true, "the edge is inside");
});

test("metres per pixel: the Web Mercator figure MapLibre frames with, so a ring's radius lands where it should", () => {
  assert.ok(Math.abs(metresPerPixel(0, 0) - 78271.5) < 1, "the equator at zoom 0, 512px tiles");
  const atQueens15 = metresPerPixel(40.73, 15);
  assert.ok(atQueens15 > 1.8 && atQueens15 < 1.82, `zoom 15 in Queens is about 1.81 m/px, was ${atQueens15}`);
});

test("the square on the ground: spanM across, centred, never narrower than the half-kilometre floor contracts keep", () => {
  const [[w, s], [e, n]] = squareBounds({ lat: 40.73, lng: -73.79 }, 2000);
  assert.ok(Math.abs((n - s) * 111_320 - 2000) < 1, "north to south is the span");
  assert.ok(
    Math.abs((e - w) * 111_320 * Math.cos((40.73 * Math.PI) / 180) - 2000) < 1,
    "and east to west, at this latitude",
  );
  assert.ok(Math.abs((n + s) / 2 - 40.73) < 1e-9 && Math.abs((e + w) / 2 + 73.79) < 1e-9, "centred");
  const [[, s2], [, n2]] = squareBounds({ lat: 40.73, lng: -73.79 }, 0);
  assert.ok(Math.abs((n2 - s2) * 111_320 - 500) < 1, "a lone lead is a place, not a pinpoint");
});
