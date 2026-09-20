#!/usr/bin/env node
/**
 * The ZIP table the lead finder's geography reads (PRD E7, decision 31): one
 * centroid per ZCTA, keys and coordinates only, bundled in packages/core.
 *
 * Source: the Census Bureau's 2020 ZCTA gazetteer,
 *   https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip
 * which unzips to 2020_Gaz_zcta_national.txt: tab-separated, one header row,
 * columns GEOID, ALAND, AWATER, ALAND_SQMI, AWATER_SQMI, INTPTLAT, INTPTLONG.
 * Three are read: GEOID (the five-digit ZCTA), INTPTLAT and INTPTLONG (the
 * internal point, decimal degrees). Every other column is ignored; nothing
 * about a person is in the file.
 *
 * Writes packages/core/src/leads/zcta-centroids.json: a JSON array of
 * [zip, lat, lng] triples sorted by zip, coordinates rounded to four decimals
 * (about eleven metres, a center and not a survey). About 33,000 rows.
 *
 *   node tooling/scripts/gen-zcta-centroids.mjs <path/to/2020_Gaz_zcta_national.txt>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const OUT = path.join(ROOT, "packages/core/src/leads/zcta-centroids.json");

/** The gazetteer's text to the table. Exported so a test can feed it three rows. */
export function centroidsOf(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split("\t").map((h) => h.trim());
  const geoid = header.indexOf("GEOID");
  const lat = header.indexOf("INTPTLAT");
  const lng = header.indexOf("INTPTLONG");
  if (geoid < 0 || lat < 0 || lng < 0) throw new Error("not the ZCTA gazetteer: GEOID, INTPTLAT and INTPTLONG are the columns it must have");
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const zip = (cells[geoid] ?? "").trim();
    const la = Number(cells[lat]);
    const lo = Number(cells[lng]);
    if (!/^\d{5}$/.test(zip) || !Number.isFinite(la) || !Number.isFinite(lo)) throw new Error(`a row that is not a ZCTA: ${line.slice(0, 40)}`);
    rows.push([zip, Math.round(la * 10_000) / 10_000, Math.round(lo * 10_000) / 10_000]);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = process.argv[2];
  if (!src) {
    console.error("usage: node tooling/scripts/gen-zcta-centroids.mjs <2020_Gaz_zcta_national.txt>");
    process.exit(2);
  }
  const rows = centroidsOf(fs.readFileSync(src, "utf8"));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // One row per line, so a diff of the table reads as rows and not as one line.
  fs.writeFileSync(OUT, `[\n${rows.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${rows.length} ZCTAs, ${fs.statSync(OUT).size} bytes`);
}
