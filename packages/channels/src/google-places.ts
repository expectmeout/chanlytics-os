/**
 * Google Places (New): the public listing — what anyone can read on Maps.
 *
 * Two calls, pinned to the documented shapes. Text Search finds the business
 * from its name and address and asks for Pro fields only (a name, an
 * address, a link and the kind of place, which tells two listings of one name
 * apart — never the rating, which would bill the Enterprise SKU for a search
 * the owner confirms by eye anyway; Google's Text Search (New) field list,
 * checked on 24 Sep 2026, has primaryTypeDisplayName under Pro). Place Details reads what
 * the listing says: the rating, the count, and the five reviews Google shows
 * first — `reviews` is the Enterprise + Atmosphere field, the one that
 * costs, and it is asked for once a day per workspace.
 *
 * The key travels in a header and the field mask in another; without the
 * mask Google refuses the call. HTTP is a port, so the planner beside this
 * (google-sync.ts) and every test run without a network.
 *
 * Details also reads what the listing says beyond its name: the week, the
 * numbers, the site, the kind of place, whether it serves an area rather
 * than an address, and its zone -- kept on the listing for the first run to
 * offer the owner (contracts GoogleListingFacts). None of those costs more:
 * `reviews` already bills the read at the top tier. The names are Google's
 * Place reference's own, checked on 24 Sep 2026; one wrong name and Google
 * refuses the whole read, so the test pins them name by name.
 */
import { E164, type GoogleListingFacts, type GooglePeriod, type GooglePoint } from "@chanlytics/contracts";

export const PLACES_BASE = "https://places.googleapis.com/v1";
export const PLACES_SEARCH_MASK =
  "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus," +
  "places.primaryTypeDisplayName";
export const PLACES_DETAILS_MASK =
  "id,displayName,formattedAddress,googleMapsUri,businessStatus,rating,userRatingCount,reviews," +
  "regularOpeningHours,internationalPhoneNumber,nationalPhoneNumber,websiteUri,primaryType,primaryTypeDisplayName," +
  "pureServiceAreaBusiness,timeZone";
/** Candidates shown to the owner: a handful, never a page of twenty. */
export const PLACES_SEARCH_LIMIT = 5;
export const PLACES_TIMEOUT_MS = 10_000;

export interface PlacesRequest {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers: Record<string, string>;
  body?: string;
}

/** One HTTP round trip. The real one is placesFetch(); tests hand in a fake. */
export type PlacesHttp = (req: PlacesRequest) => Promise<{ status: number; body: string }>;

export class PlacesError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlacesError";
  }
}

export interface PlaceCandidate {
  place_id: string;
  name: string;
  address: string | null;
  maps_uri: string | null;
  business_status: string | null;
  /** Google's name for the kind of place ("Moving company"), when it gives one. */
  category: string | null;
}

export interface PlaceReview {
  review_id: string;
  rating: number | null;
  author: string | null;
  author_uri: string | null;
  author_photo_uri: string | null;
  text: string | null;
  language_code: string | null;
  published_at: string | null;
  maps_uri: string | null;
}

export interface PlaceDetails {
  place_id: string;
  name: string;
  address: string | null;
  maps_uri: string | null;
  business_status: string | null;
  rating: number | null;
  review_count: number | null;
  reviews: PlaceReview[];
  /** What the listing says beyond its name and address, for the owner to check. */
  facts: GoogleListingFacts;
}

function headers(key: string, mask: string, json = false): Record<string, string> {
  return { "X-Goog-Api-Key": key, "X-Goog-FieldMask": mask, ...(json ? { "Content-Type": "application/json" } : {}) };
}

/** Text Search: the query as the owner or the facts give it; a handful of results. */
export function placesSearchRequest(
  key: string,
  query: string,
  opts: { limit?: number; languageCode?: string } = {},
): PlacesRequest {
  const pageSize = Math.max(1, Math.min(20, opts.limit ?? PLACES_SEARCH_LIMIT));
  return {
    url: `${PLACES_BASE}/places:searchText`,
    method: "POST",
    headers: headers(key, PLACES_SEARCH_MASK, true),
    body: JSON.stringify({ textQuery: query, pageSize, languageCode: opts.languageCode ?? "en" }),
  };
}

/** Place Details: the listing by its id, with the reviews. */
export function placesDetailsRequest(
  key: string,
  placeId: string,
  opts: { languageCode?: string } = {},
): PlacesRequest {
  const q = new URLSearchParams({ languageCode: opts.languageCode ?? "en" });
  return {
    url: `${PLACES_BASE}/places/${encodeURIComponent(placeId)}?${q.toString()}`,
    method: "GET",
    headers: headers(key, PLACES_DETAILS_MASK),
  };
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** Google's LocalizedText: { text, languageCode }. */
const localized = (v: unknown): { text: string | null; languageCode: string | null } => {
  const o = obj(v);
  return { text: str(o?.text), languageCode: str(o?.languageCode) };
};

function candidateOf(p: Obj): PlaceCandidate | null {
  const id = str(p.id);
  const name = localized(p.displayName).text;
  if (!id || !name) return null;
  return {
    place_id: id,
    name,
    address: str(p.formattedAddress),
    maps_uri: str(p.googleMapsUri),
    business_status: str(p.businessStatus),
    category: localized(p.primaryTypeDisplayName).text,
  };
}

/** A review's id is the last segment of its resource name, places/{place}/reviews/{review}. */
export function reviewIdOf(name: unknown): string | null {
  const s = str(name);
  if (!s) return null;
  const last = s.split("/").pop();
  return last && last.length > 0 ? last : null;
}

function reviewOf(r: Obj): PlaceReview | null {
  const id = reviewIdOf(r.name);
  if (!id) return null;
  const author = obj(r.authorAttribution);
  const text = localized(r.text);
  return {
    review_id: id,
    rating: num(r.rating),
    author: str(author?.displayName),
    author_uri: str(author?.uri),
    author_photo_uri: str(author?.photoUri),
    text: text.text,
    language_code: text.languageCode,
    published_at: str(r.publishTime),
    maps_uri: str(r.googleMapsUri),
  };
}

/** A moment in Google's week. A field Google left out is its zero: proto3 drops defaults, so Sunday at midnight is {}. */
function pointOf(v: unknown): GooglePoint | null {
  const o = obj(v);
  if (!o) return null;
  const day = num(o.day) ?? 0;
  const hour = num(o.hour) ?? 0;
  const minute = num(o.minute) ?? 0;
  return day >= 0 && day <= 6 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { day, hour, minute } : null;
}

/** One opening period; no close is open around the clock, and a close that is not a moment is no period. */
function periodOf(v: unknown): GooglePeriod | null {
  const o = obj(v);
  const open = pointOf(o?.open);
  if (!o || !open) return null;
  if (o.close === undefined) return { open, close: null };
  const close = pointOf(o.close);
  return close ? { open, close } : null;
}

/**
 * The number as Google writes it for the world ("+44 20 7946 0958"), in E.164: its own digits after its own country
 * code. Never normalizePhone's reading, which takes any ten digits for an American number and would give a
 * ten-digit number from elsewhere a +1 it does not have.
 */
function e164Of(international: string | null): string | null {
  if (!international || !international.trim().startsWith("+")) return null;
  const e164 = `+${international.replace(/\D/g, "")}`;
  return E164.test(e164) ? e164 : null;
}

/** What the listing says beyond its name and address, as Google says it; nothing invented where it says nothing. */
function factsOf(p: Obj): GoogleListingFacts {
  const periods = obj(p.regularOpeningHours)?.periods;
  return {
    hours: Array.isArray(periods) ? periods.map(periodOf).filter((x): x is GooglePeriod => x !== null) : null,
    phone_e164: e164Of(str(p.internationalPhoneNumber)),
    phone_display: str(p.nationalPhoneNumber),
    website: str(p.websiteUri),
    primary_type: str(p.primaryType),
    primary_type_label: localized(p.primaryTypeDisplayName).text,
    service_area_only: p.pureServiceAreaBusiness === true,
    time_zone: str(obj(p.timeZone)?.id),
    // Google names no booking page: the edge reads the website for one, with the listing's first read.
    booking_page: null,
  };
}

export function parsePlacesSearch(json: unknown): PlaceCandidate[] {
  const places = obj(json)?.places;
  if (!Array.isArray(places)) return [];
  return places.map((p) => (obj(p) ? candidateOf(obj(p)!) : null)).filter((c): c is PlaceCandidate => c !== null);
}

export function parsePlaceDetails(json: unknown): PlaceDetails {
  const p = obj(json);
  const id = str(p?.id);
  const name = localized(p?.displayName).text;
  if (!p || !id || !name) throw new PlacesError(502, "Google answered without a place");
  const reviews = Array.isArray(p.reviews)
    ? p.reviews.map((r) => (obj(r) ? reviewOf(obj(r)!) : null)).filter((r): r is PlaceReview => r !== null)
    : [];
  return {
    place_id: id,
    name,
    address: str(p.formattedAddress),
    maps_uri: str(p.googleMapsUri),
    business_status: str(p.businessStatus),
    rating: num(p.rating),
    review_count: num(p.userRatingCount),
    reviews,
    facts: factsOf(p),
  };
}

/** Google's error envelope: { error: { code, message, status } }. */
function refusal(status: number, body: string): PlacesError {
  let message = `Google answered ${status}`;
  try {
    const e = obj(obj(JSON.parse(body))?.error);
    const m = str(e?.message);
    const s = str(e?.status);
    if (m) message = s ? `${s}: ${m}` : m;
  } catch {
    /* the status is the message */
  }
  return new PlacesError(status, message);
}

async function call(http: PlacesHttp, req: PlacesRequest): Promise<unknown> {
  const r = await http(req);
  if (r.status < 200 || r.status >= 300) throw refusal(r.status, r.body);
  try {
    return JSON.parse(r.body);
  } catch {
    throw new PlacesError(502, "Google answered with something other than JSON");
  }
}

export async function searchPlaces(
  http: PlacesHttp,
  key: string,
  query: string,
  opts: { limit?: number; languageCode?: string } = {},
): Promise<PlaceCandidate[]> {
  return parsePlacesSearch(await call(http, placesSearchRequest(key, query, opts)));
}

export async function getPlace(
  http: PlacesHttp,
  key: string,
  placeId: string,
  opts: { languageCode?: string } = {},
): Promise<PlaceDetails> {
  return parsePlaceDetails(await call(http, placesDetailsRequest(key, placeId, opts)));
}

/** The real port: fetch with a timeout, the body as text whatever the status. */
export function placesFetch(fetchImpl: typeof fetch = fetch, timeoutMs = PLACES_TIMEOUT_MS): PlacesHttp {
  return async (req) => {
    const r = await fetchImpl(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: r.status, body: await r.text() };
  };
}

/** A place id as Google issues them: letters, digits, dashes and underscores. */
export const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
