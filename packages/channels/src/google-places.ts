/**
 * Google Places (New): the public listing — what anyone can read on Maps.
 *
 * Two calls, pinned to the documented shapes. Text Search finds the business
 * from its name and address and asks for Pro fields only (a name, an
 * address, a link — never the rating, which would bill the Enterprise SKU
 * for a search the owner confirms by eye anyway). Place Details reads what
 * the listing says: the rating, the count, and the five reviews Google shows
 * first — `reviews` is the Enterprise + Atmosphere field, the one that
 * costs, and it is asked for once a day per workspace.
 *
 * The key travels in a header and the field mask in another; without the
 * mask Google refuses the call. HTTP is a port, so the planner beside this
 * (google-sync.ts) and every test run without a network.
 */

export const PLACES_BASE = "https://places.googleapis.com/v1";
export const PLACES_SEARCH_MASK = "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.businessStatus";
export const PLACES_DETAILS_MASK = "id,displayName,formattedAddress,googleMapsUri,businessStatus,rating,userRatingCount,reviews";
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
  constructor(public readonly status: number, message: string) {
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
}

function headers(key: string, mask: string, json = false): Record<string, string> {
  return { "X-Goog-Api-Key": key, "X-Goog-FieldMask": mask, ...(json ? { "Content-Type": "application/json" } : {}) };
}

/** Text Search: the query as the owner or the facts give it; a handful of results. */
export function placesSearchRequest(key: string, query: string, opts: { limit?: number; languageCode?: string } = {}): PlacesRequest {
  const pageSize = Math.max(1, Math.min(20, opts.limit ?? PLACES_SEARCH_LIMIT));
  return {
    url: `${PLACES_BASE}/places:searchText`,
    method: "POST",
    headers: headers(key, PLACES_SEARCH_MASK, true),
    body: JSON.stringify({ textQuery: query, pageSize, languageCode: opts.languageCode ?? "en" }),
  };
}

/** Place Details: the listing by its id, with the reviews. */
export function placesDetailsRequest(key: string, placeId: string, opts: { languageCode?: string } = {}): PlacesRequest {
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
  return { place_id: id, name, address: str(p.formattedAddress), maps_uri: str(p.googleMapsUri), business_status: str(p.businessStatus) };
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
  const reviews = Array.isArray(p.reviews) ? p.reviews.map((r) => (obj(r) ? reviewOf(obj(r)!) : null)).filter((r): r is PlaceReview => r !== null) : [];
  return {
    place_id: id,
    name,
    address: str(p.formattedAddress),
    maps_uri: str(p.googleMapsUri),
    business_status: str(p.businessStatus),
    rating: num(p.rating),
    review_count: num(p.userRatingCount),
    reviews,
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
  } catch { /* the status is the message */ }
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

export async function searchPlaces(http: PlacesHttp, key: string, query: string, opts: { limit?: number; languageCode?: string } = {}): Promise<PlaceCandidate[]> {
  return parsePlacesSearch(await call(http, placesSearchRequest(key, query, opts)));
}

export async function getPlace(http: PlacesHttp, key: string, placeId: string, opts: { languageCode?: string } = {}): Promise<PlaceDetails> {
  return parsePlaceDetails(await call(http, placesDetailsRequest(key, placeId, opts)));
}

/** The real port: fetch with a timeout, the body as text whatever the status. */
export function placesFetch(fetchImpl: typeof fetch = fetch, timeoutMs = PLACES_TIMEOUT_MS): PlacesHttp {
  return async (req) => {
    const r = await fetchImpl(req.url, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(timeoutMs) });
    return { status: r.status, body: await r.text() };
  };
}

/** A place id as Google issues them: letters, digits, dashes and underscores. */
export const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
