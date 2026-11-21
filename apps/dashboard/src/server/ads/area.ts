/**
 * An ad shown wider than the circle around a business (the Ads plan's 4.6 and G8, as Ruben settled them on
 * 20 November 2026): a city, a state or region, or the whole country, by the key Meta gives it. Five miles around the
 * address stays the draft's own start for a business people visit; a wider place is chosen by the owner telling AI,
 * or proposed where Google says the business goes to its customers.
 *
 * A place is only ever one Meta has said it knows: the edge's place search (the account door's `place` op) answers
 * Meta's places by a name, and the one meant is picked here, by its name and by where the words around it say it is.
 * So a draft never holds a place Meta would refuse. Nothing is kept: the draft holds what was picked.
 *
 * What Chanlytics knows of where a business serves is Google's own mark on its listing, that it goes to its customers
 * and shows no address (`service_area_only`), and the place its listing names in the address's stead. Nothing says a
 * business serves online: Services keeps no such fact, so no draft proposes a wider place for that reason.
 */
import "server-only";
import { usStateCode, usStateName, type TenantId } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";
import { callAdsEdge } from "../connections/ads-ready";
import type { AdWideArea } from "./draft-shape";

/** One of Meta's places, as the edge answers it. */
interface FoundPlace {
  kind: AdWideArea["kind"];
  key: string;
  name: string;
  region: string | null;
  country: string;
  country_name: string;
}

/** What is looked for: a kind of place, its name, and the words that say where it is (a region, a country), if any. */
interface PlaceAsk {
  kind: AdWideArea["kind"];
  name: string;
  within: string;
  /** Picked only where `within` names where it is: never a guess among namesakes. */
  strict: boolean;
}

/** Words as they are compared: no accents, lower case, single spaces. */
const foldedWords = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Whether `within` names a place's region: by its name, or a state of the United States by its postal code. */
function namesRegion(place: FoundPlace, words: string, tokens: ReadonlySet<string>): boolean {
  const region = place.region ? foldedWords(place.region) : null;
  if (region === null) return false;
  if (words.includes(region)) return true;
  // A state of the United States, named by its postal code: "Austin, TX" names Texas.
  const code = place.country === "US" && place.region ? usStateCode(place.region) : null;
  return !!code && tokens.has(code.toLowerCase());
}

/** Whether `within` names a place's country: by its name, its code, or "USA". */
function namesCountry(place: FoundPlace, words: string, tokens: ReadonlySet<string>): boolean {
  if (place.country === "US" && tokens.has("usa")) return true;
  return words.includes(foldedWords(place.country_name)) || tokens.has(place.country.toLowerCase());
}

/**
 * How well `within` says where a place is: 2 where it names its region, 1 its country alone, 0 neither. A city's
 * region outranks its country, so "Austin, TX, USA" is the Austin in Texas, never another Austin in the same country.
 */
function whereScore(place: FoundPlace, within: string): number {
  const words = foldedWords(within);
  if (!words) return 0;
  const tokens = new Set(words.split(/[^a-z0-9]+/).filter(Boolean));
  if (namesRegion(place, words, tokens)) return 2;
  return namesCountry(place, words, tokens) ? 1 : 0;
}

/**
 * The place meant, of those Meta found: of the ones whose name is the name asked, the one the words around it place
 * best; where they place none, unless the ask is strict, Meta's own first of that name. Strict, a city is taken only
 * where its region is named: "Austin, TX, USA" never proposes an Austin in another state. None where Meta found none.
 */
function pickPlace(places: readonly FoundPlace[], ask: PlaceAsk): FoundPlace | null {
  const named = places.filter((place) => place.kind === ask.kind && foldedWords(place.name) === foldedWords(ask.name));
  const scored = named.map((place) => ({ place, score: whereScore(place, ask.within) }));
  const least = ask.strict && ask.kind === "city" ? 2 : 1;
  const best = scored.reduce<{ place: FoundPlace; score: number } | null>(
    (top, one) => (one.score >= least && one.score > (top?.score ?? 0) ? one : top),
    null,
  );
  if (best) return best.place;
  return ask.strict ? null : (named[0] ?? null);
}

/** A place as a draft holds it: Meta's key, and the name a sentence says it by. */
function draftAreaOf(place: FoundPlace): AdWideArea {
  const name = place.kind === "city" && place.region ? `${place.name}, ${place.region}` : place.name;
  return { kind: place.kind, key: place.key, name, country: place.country };
}

/** Who asks: the workspace and the member, as the edge's door names them. */
interface PlaceAsker {
  tenantId: TenantId;
  userId: string;
}

/**
 * The place Meta keys by a name, as a draft holds it; null where Meta knows none that is meant, the account is not
 * connected, or the edge did not answer. Never throws: a place not found is a change not made.
 */
export async function findAdPlace(asker: PlaceAsker, ask: PlaceAsk): Promise<AdWideArea | null> {
  const name = ask.name.trim();
  if (!name || name.length > 120) return null;
  const answer = await callAdsEdge({
    op: "place",
    tenant_id: asker.tenantId,
    user_id: asker.userId,
    place: { kind: ask.kind, query: name },
  }).catch(logAndGoOn("an ad's place at Meta", null));
  const places = answer?.body?.ok ? (answer.body.places ?? []) : [];
  const picked = pickPlace(places, { ...ask, name });
  return picked ? draftAreaOf(picked) : null;
}

/**
 * The wider place a business that goes to its customers is proposed with, from the place its Google listing names in
 * the address's stead: the city first named there ("Austin, TX, USA"), where the rest names its region; else that
 * region, by its name or a state's postal code ("TX"), or the region a listing names first ("Texas, USA"), where the rest
 * names its country. Null where neither is sure: the draft keeps its circle.
 */
export async function findCustomersPlace(asker: PlaceAsker, listed: string): Promise<AdWideArea | null> {
  const parts = listed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const [first, ...rest] = parts;
  if (first === undefined || rest.length === 0) return null;
  const city = await findAdPlace(asker, { kind: "city", name: first, within: rest.join(", "), strict: true });
  if (city) return city;
  const [region = first, ...country] = parts.length >= 3 ? rest : parts;
  const named = usStateName(region) ?? region;
  return findAdPlace(asker, { kind: "region", name: named, within: country.join(", "), strict: true });
}
