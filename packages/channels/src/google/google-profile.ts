/**
 * Google Business Profile: the owner's own listing, with every review and
 * the right to answer them. Three APIs, pinned to the documented shapes:
 * Account Management (whose accounts), Business Information (which
 * locations, with the place id that ties one to the public listing), and
 * the v4 API that still carries reviews and replies.
 *
 * Nothing here holds a token for longer than a call; the edge trades the
 * Vault-held refresh token for one. HTTP is the same port the Places client
 * uses, so the planner beside this runs in tests without a network.
 */
import { PlacesError, type PlacesHttp, type PlacesRequest, refusal } from "./google-places";
import { nonBlankOrNull, recordOrNull } from "@chanlytics/contracts";

export const GBP_ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
export const GBP_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
export const GBP_V4_BASE = "https://mybusiness.googleapis.com/v4";
/** What a location is asked for: its name, its title, where it is, and the metadata that names its place on Maps. */
export const GBP_LOCATIONS_READ_MASK = "name,title,storefrontAddress,metadata";
export const GBP_REVIEWS_PAGE = 50;
/** Pages of fifty read on one sync: a history of two hundred and fifty, then the newest page each day. */
export const GBP_REVIEWS_MAX_PAGES = 5;

type Obj = Record<string, unknown>;

function bearer(token: string, v4 = false): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...(v4 ? { "X-GOOG-API-FORMAT-VERSION": "2" } : {}) };
}

export function accountsRequest(token: string, pageToken?: string | null): PlacesRequest {
  const q = new URLSearchParams({ pageSize: "20" });
  if (pageToken) q.set("pageToken", pageToken);
  return { url: `${GBP_ACCOUNTS_URL}?${q.toString()}`, method: "GET", headers: bearer(token) };
}

export function locationsRequest(token: string, accountName: string, pageToken?: string | null): PlacesRequest {
  const q = new URLSearchParams({ readMask: GBP_LOCATIONS_READ_MASK, pageSize: "100" });
  if (pageToken) q.set("pageToken", pageToken);
  return { url: `${GBP_INFO_BASE}/${accountName}/locations?${q.toString()}`, method: "GET", headers: bearer(token) };
}

/** The v4 review path: accounts/{a}/locations/{l}, from the account's name and the location's. */
export function reviewParent(accountName: string, locationName: string): string {
  const loc = locationName.startsWith("locations/") ? locationName.slice("locations/".length) : locationName;
  return `${accountName}/locations/${loc}`;
}

export function reviewsRequest(token: string, parent: string, pageToken?: string | null): PlacesRequest {
  const q = new URLSearchParams({ pageSize: String(GBP_REVIEWS_PAGE), orderBy: "updateTime desc" });
  if (pageToken) q.set("pageToken", pageToken);
  return { url: `${GBP_V4_BASE}/${parent}/reviews?${q.toString()}`, method: "GET", headers: bearer(token, true) };
}

export function replyRequest(token: string, reviewName: string, comment: string): PlacesRequest {
  return {
    url: `${GBP_V4_BASE}/${reviewName}/reply`,
    method: "PUT",
    headers: { ...bearer(token, true), "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  };
}

export function deleteReplyRequest(token: string, reviewName: string): PlacesRequest & { method: "DELETE" } {
  return { url: `${GBP_V4_BASE}/${reviewName}/reply`, method: "DELETE", headers: bearer(token, true) };
}

export interface GbpAccount {
  /** accounts/{id} */
  name: string;
  title: string;
  type: string | null;
}

export interface GbpLocation {
  /** locations/{id} */
  name: string;
  title: string;
  address: string | null;
  /** The listing on Maps, when Google has one; null for a location not yet on Maps. */
  place_id: string | null;
  maps_uri: string | null;
  new_review_uri: string | null;
}

export interface GbpReview {
  /** accounts/{a}/locations/{l}/reviews/{id} */
  name: string;
  review_id: string;
  rating: number | null;
  author: string | null;
  author_photo_uri: string | null;
  anonymous: boolean;
  text: string | null;
  created_at: string | null;
  updated_at: string | null;
  reply_text: string | null;
  replied_at: string | null;
}

export interface GbpReviewsPage {
  reviews: GbpReview[];
  average_rating: number | null;
  total_count: number | null;
  next_page_token: string | null;
}

export function parseAccounts(json: unknown): { accounts: GbpAccount[]; next: string | null } {
  const o = recordOrNull(json);
  const list = Array.isArray(o?.accounts) ? o.accounts : [];
  const accounts = list
    .map((a) => recordOrNull(a))
    .filter((a): a is Obj => !!a)
    .map((a) => ({
      name: nonBlankOrNull(a.name) ?? "",
      title:
        nonBlankOrNull(a.accountName) ??
        nonBlankOrNull(recordOrNull(a.organizationInfo)?.registeredDomain) ??
        nonBlankOrNull(a.name) ??
        "",
      type: nonBlankOrNull(a.type),
    }))
    .filter((a) => a.name.startsWith("accounts/"));
  return { accounts, next: nonBlankOrNull(o?.nextPageToken) };
}

function oneLineAddress(a: unknown): string | null {
  const o = recordOrNull(a);
  if (!o) return null;
  const lines = Array.isArray(o.addressLines)
    ? o.addressLines.filter((l): l is string => typeof l === "string" && !!l.trim())
    : [];
  const parts = [
    ...lines,
    nonBlankOrNull(o.locality),
    [nonBlankOrNull(o.administrativeArea), nonBlankOrNull(o.postalCode)].filter(Boolean).join(" "),
  ].filter((p): p is string => !!p);
  return parts.length ? parts.join(", ") : null;
}

export function parseLocations(json: unknown): { locations: GbpLocation[]; next: string | null } {
  const o = recordOrNull(json);
  const list = Array.isArray(o?.locations) ? o.locations : [];
  const locations = list
    .map((l) => recordOrNull(l))
    .filter((l): l is Obj => !!l)
    .map((l) => {
      const meta = recordOrNull(l.metadata);
      return {
        name: nonBlankOrNull(l.name) ?? "",
        title: nonBlankOrNull(l.title) ?? "",
        address: oneLineAddress(l.storefrontAddress),
        place_id: nonBlankOrNull(meta?.placeId),
        maps_uri: nonBlankOrNull(meta?.mapsUri),
        new_review_uri: nonBlankOrNull(meta?.newReviewUri),
      };
    })
    .filter((l) => l.name.startsWith("locations/"));
  return { locations, next: nonBlankOrNull(o?.nextPageToken) };
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** "FIVE" → 5; anything else → null. */
export function starRatingNumber(v: unknown): number | null {
  return typeof v === "string" && Object.hasOwn(STARS, v) ? (STARS[v] ?? null) : null;
}

export function parseReviewsPage(json: unknown): GbpReviewsPage {
  const o = recordOrNull(json);
  const list = Array.isArray(o?.reviews) ? o.reviews : [];
  const reviews = list
    .map((r) => recordOrNull(r))
    .filter((r): r is Obj => !!r)
    .map((r): GbpReview | null => {
      const name = nonBlankOrNull(r.name);
      const id = nonBlankOrNull(r.reviewId) ?? (name ? (name.split("/").pop() ?? null) : null);
      if (!name || !id) return null;
      const who = recordOrNull(r.reviewer);
      const reply = recordOrNull(r.reviewReply);
      return {
        name,
        review_id: id,
        rating: starRatingNumber(r.starRating),
        author: who?.isAnonymous === true ? null : nonBlankOrNull(who?.displayName),
        author_photo_uri: nonBlankOrNull(who?.profilePhotoUrl),
        anonymous: who?.isAnonymous === true,
        text: nonBlankOrNull(r.comment),
        created_at: nonBlankOrNull(r.createTime),
        updated_at: nonBlankOrNull(r.updateTime),
        reply_text: nonBlankOrNull(reply?.comment),
        replied_at: nonBlankOrNull(reply?.updateTime),
      };
    })
    .filter((r): r is GbpReview => r !== null);
  const avg = typeof o?.averageRating === "number" ? o.averageRating : null;
  const total = typeof o?.totalReviewCount === "number" ? o.totalReviewCount : null;
  return { reviews, average_rating: avg, total_count: total, next_page_token: nonBlankOrNull(o?.nextPageToken) };
}

async function callProfileApi(http: PlacesHttp, req: PlacesRequest): Promise<unknown> {
  const r = await http(req);
  if (r.status < 200 || r.status >= 300) throw refusal(r.status, r.body);
  if (!r.body.trim()) return {};
  try {
    return JSON.parse(r.body);
  } catch {
    throw new PlacesError(502, "Google answered with something other than JSON");
  }
}

export async function listAccounts(http: PlacesHttp, token: string): Promise<GbpAccount[]> {
  const out: GbpAccount[] = [];
  let page: string | null = null;
  for (let i = 0; i < 5; i++) {
    const r = parseAccounts(await callProfileApi(http, accountsRequest(token, page)));
    out.push(...r.accounts);
    page = r.next;
    if (!page) break;
  }
  return out;
}

export async function listLocations(http: PlacesHttp, token: string, accountName: string): Promise<GbpLocation[]> {
  const out: GbpLocation[] = [];
  let page: string | null = null;
  for (let i = 0; i < 5; i++) {
    const r = parseLocations(await callProfileApi(http, locationsRequest(token, accountName, page)));
    out.push(...r.locations);
    page = r.next;
    if (!page) break;
  }
  return out;
}

/** The newest pages of reviews, up to `maxPages`; the rating and the count as Google reports them beside. */
export async function listReviews(
  http: PlacesHttp,
  token: string,
  parent: string,
  maxPages = GBP_REVIEWS_MAX_PAGES,
): Promise<GbpReviewsPage> {
  const all: GbpReview[] = [];
  let page: string | null = null;
  let avg: number | null = null;
  let total: number | null = null;
  for (let i = 0; i < Math.max(1, maxPages); i++) {
    const r = parseReviewsPage(await callProfileApi(http, reviewsRequest(token, parent, page)));
    all.push(...r.reviews);
    if (i === 0) {
      avg = r.average_rating;
      total = r.total_count;
    }
    page = r.next_page_token;
    if (!page) break;
  }
  return { reviews: all, average_rating: avg, total_count: total, next_page_token: page };
}

export async function replyToReview(
  http: PlacesHttp,
  token: string,
  reviewName: string,
  comment: string,
): Promise<{ reply_text: string | null; replied_at: string | null }> {
  const o = recordOrNull(await callProfileApi(http, replyRequest(token, reviewName, comment)));
  return {
    reply_text: nonBlankOrNull(o?.comment) ?? comment,
    replied_at: nonBlankOrNull(o?.updateTime) ?? new Date().toISOString(),
  };
}

/** A reply as Google accepts it: words, at most this many characters. */
export const GBP_REPLY_MAX = 4096;

export function cleanReply(text: unknown): string {
  return typeof text === "string"
    ? text
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .trim()
        .slice(0, GBP_REPLY_MAX)
    : "";
}
