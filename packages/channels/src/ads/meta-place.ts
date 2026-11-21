/**
 * Meta's ads wire, the area's part: a place wider than the circle around a business, as Meta keys it (the Ads plan's
 * 4.6 and G8, as Ruben settled them on 20 November 2026: a business that serves away from its address can show its ad
 * across a city, a state or the whole country).
 *
 * Read on Meta's own pages on 20 November 2026 (Marketing API, basic targeting and targeting search):
 *
 *  - A country is its ISO code (`geo_locations.countries`); a region (a state, a province) and a city are each Meta's
 *    own key, which never changes and is found by Meta's location search (`search?type=adgeolocation`, with
 *    `location_types` naming the kind). A city's answer names its region and its country; a region's, its country.
 *  - A city is shown with a ring around it, from 10 to 50 miles. Here it is always the least, 10, so the city is what it
 *    says, and the ring is named in the request so what Meta holds is what was sent.
 *  - Meta's guide for an ad that opens WhatsApp names no limit on where it is shown; its own example shows one to two
 *    whole countries.
 *
 * A search is a read with the business's own sign-in, and is never sent without a name to look for. Its answer is read
 * defensively: a place with no key, no name, or no country is left out alone.
 */
import { valueAt } from "@chanlytics/contracts";
import { metaGraphUrl, metaObject, metaProofQuery, metaText } from "../meta/client";
import type { MetaRequest } from "../meta/client";

/** The kinds of place wider than a circle that an ad may be shown across. */
export type MetaPlaceKind = "city" | "region" | "country";

/** The ring around a city an ad made here is shown in, in miles: Meta's least for a city. */
export const META_CITY_MILES = 10;

/** One place Meta's search found: its key, its own name, and where it is. */
export interface MetaPlace {
  kind: MetaPlaceKind;
  /** Meta's key for it: a number for a city or a region, the ISO code for a country. */
  key: string;
  name: string;
  /** The region a city is in, by Meta's name; null for a region or a country. */
  region: string | null;
  /** The ISO 3166 code of its country, upper case, and Meta's name for it. */
  country: string;
  countryName: string;
}

/** The most places one search answers: enough to find the one meant beside its namesakes elsewhere. */
const PLACES_ASKED = 10;
/** The longest name looked for. */
const PLACE_QUERY_MAX = 120;

/** Meta's places of one kind whose names match `query`, best first. Throws where there is nothing to look for. */
export function metaPlacesRequest(
  token: string,
  appSecret: string,
  ask: { kind: MetaPlaceKind; query: string },
): MetaRequest {
  const query = ask.query.trim();
  if (!query || query.length > PLACE_QUERY_MAX) throw new Error("a place is looked for by its name");
  return {
    url: metaGraphUrl("search", {
      type: "adgeolocation",
      location_types: JSON.stringify([ask.kind]),
      q: query,
      limit: String(PLACES_ASKED),
      ...metaProofQuery(token, appSecret),
    }),
    method: "GET",
  };
}

const COUNTRY = /^[A-Z]{2}$/;

function metaPlaceOf(row: unknown, kind: MetaPlaceKind): MetaPlace[] {
  const place = metaObject(row);
  if (metaText(valueAt(place, "type")) !== kind) return [];
  const key = metaText(valueAt(place, "key")).trim();
  const name = metaText(valueAt(place, "name")).trim().slice(0, 200);
  const country = (kind === "country" ? key : metaText(valueAt(place, "country_code"))).trim().toUpperCase();
  if (!key || !name || !COUNTRY.test(country)) return [];
  const region = kind === "city" ? metaText(valueAt(place, "region")).trim().slice(0, 200) || null : null;
  const countryName =
    (kind === "country" ? name : metaText(valueAt(place, "country_name")).trim().slice(0, 200)) || country;
  return [{ kind, key: kind === "country" ? country : key, name, region, country, countryName }];
}

/** The places a search found, of the kind asked, in Meta's order. */
export function parseMetaPlaces(json: unknown, kind: MetaPlaceKind): MetaPlace[] {
  const rows = valueAt(metaObject(json), "data");
  return Array.isArray(rows) ? rows.flatMap((row) => metaPlaceOf(row, kind)) : [];
}

/** A place an ad set is shown across, as it is sent: what `geo_locations` holds for it. */
export function metaPlaceTargeting(place: Pick<MetaPlace, "kind" | "key">): Record<string, unknown> {
  if (place.kind === "country") return { countries: [place.key] };
  if (place.kind === "region") return { regions: [{ key: place.key }] };
  return { cities: [{ key: place.key, radius: META_CITY_MILES, distance_unit: "mile" }] };
}

/** Where an ad set made here is shown, as metaAreaWord says it: the wider place where one was chosen, else the circle. */
export function metaAreaSent(area: { wide: Pick<MetaPlace, "kind" | "key"> | null; miles: number }): string | null {
  return metaAreaWord(
    area.wide ? metaPlaceTargeting(area.wide) : { custom_locations: [{ radius: area.miles, distance_unit: "mile" }] },
  );
}

/**
 * Where an ad set is shown, as one word that is the same for what was sent and what Meta holds: `circle:<miles>`,
 * `city:<key>:<miles>`, `region:<key>` or `country:<code>`. Null for anything else: no place, several, or another unit.
 */
export function metaAreaWord(geo: unknown): string | null {
  const held = metaObject(geo);
  const parts = ["custom_locations", "cities", "regions", "countries"].filter((field) => {
    const list = valueAt(held, field);
    return Array.isArray(list) && list.length > 0;
  });
  const [only] = parts;
  if (parts.length !== 1 || only === undefined) return null;
  const list = valueAt(held, only);
  if (!Array.isArray(list) || list.length !== 1) return null;
  const entry: unknown = list[0];
  if (only === "countries") return `country:${metaText(entry).toUpperCase()}`;
  const one = metaObject(entry);
  if (only === "regions") return `region:${metaText(valueAt(one, "key"))}`;
  const radius = Number(metaText(valueAt(one, "radius")));
  if ((metaText(valueAt(one, "distance_unit")) || "mile") !== "mile" || !(radius > 0)) return null;
  return only === "cities" ? `city:${metaText(valueAt(one, "key"))}:${radius}` : `circle:${radius}`;
}
