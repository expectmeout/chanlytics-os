/** Profile: profile. */

import { PlacesError, type PlacesHttp, type PlacesRequest, refusal } from "../places";
import { nonBlankOrNull, recordOrNull } from "@chanlytics/contracts";
import {
  GBP_PHOTO_SIDE,
  GBP_REVIEWS_MAX_PAGES,
  GBP_V4_BASE,
  accountsRequest,
  bearer,
  locationRequest,
  locationsRequest,
  mediaRequest,
  replyRequest,
  reviewsRequest,
  type Obj,
} from "./requests";

/** A post as a person asked for it. `call` puts Google's own Call button under it, which rings the number on the profile. */
export interface GbpPostAsked {
  summary: string;
  photoUrl: string;
  languageCode: string;
  call: boolean;
}

function localPostRequest(token: string, parent: string, post: GbpPostAsked): PlacesRequest {
  return {
    url: `${GBP_V4_BASE}/${parent}/localPosts`,
    method: "POST",
    headers: { ...bearer(token, true), "Content-Type": "application/json" },
    body: JSON.stringify({
      languageCode: post.languageCode,
      summary: post.summary,
      topicType: "STANDARD",
      media: [{ mediaFormat: "PHOTO", sourceUrl: post.photoUrl }],
      ...(post.call ? { callToAction: { actionType: "CALL" } } : {}),
    }),
  };
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
  const record = recordOrNull(json);
  const list = Array.isArray(record?.accounts) ? record.accounts : [];
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
  return { accounts, next: nonBlankOrNull(record?.nextPageToken) };
}

function oneLineAddress(first: unknown): string | null {
  const record = recordOrNull(first);
  if (!record) return null;
  const lines = Array.isArray(record.addressLines)
    ? record.addressLines.filter((l): l is string => typeof l === "string" && !!l.trim())
    : [];
  const parts = [
    ...lines,
    nonBlankOrNull(record.locality),
    [nonBlankOrNull(record.administrativeArea), nonBlankOrNull(record.postalCode)].filter(Boolean).join(" "),
  ].filter((p): p is string => !!p);
  return parts.length ? parts.join(", ") : null;
}

/**
 * One location as Business Information gives it, an element of an account's list or locations.get's whole answer: its
 * name, title and address, and the metadata that names its place on Maps. Null for one that names no location.
 */
function parseLocation(json: unknown): GbpLocation | null {
  const record = recordOrNull(json);
  const name = nonBlankOrNull(record?.name);
  if (!record || !name?.startsWith("locations/")) return null;
  const meta = recordOrNull(record.metadata);
  return {
    name,
    title: nonBlankOrNull(record.title) ?? "",
    address: oneLineAddress(record.storefrontAddress),
    place_id: nonBlankOrNull(meta?.placeId),
    maps_uri: nonBlankOrNull(meta?.mapsUri),
    new_review_uri: nonBlankOrNull(meta?.newReviewUri),
  };
}

export function parseLocations(json: unknown): { locations: GbpLocation[]; next: string | null } {
  const o = recordOrNull(json);
  const list = Array.isArray(o?.locations) ? o.locations : [];
  const locations = list.map(parseLocation).filter((l): l is GbpLocation => l !== null);
  return { locations, next: nonBlankOrNull(o?.nextPageToken) };
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** "FIVE" → 5; anything else → null. */
export function starRatingNumber(value: unknown): number | null {
  return typeof value === "string" && Object.hasOwn(STARS, value) ? (STARS[value] ?? null) : null;
}

export function parseReviewsPage(json: unknown): GbpReviewsPage {
  const record = recordOrNull(json);
  const list = Array.isArray(record?.reviews) ? record.reviews : [];
  const reviews = list
    .map((r) => recordOrNull(r))
    .filter((r): r is Obj => !!r)
    .map((item): GbpReview | null => {
      const name = nonBlankOrNull(item.name);
      const id = nonBlankOrNull(item.reviewId) ?? (name ? (name.split("/").pop() ?? null) : null);
      if (!name || !id) return null;
      const reviewer = recordOrNull(item.reviewer);
      const reply = recordOrNull(item.reviewReply);
      return {
        name,
        review_id: id,
        rating: starRatingNumber(item.starRating),
        author: reviewer?.isAnonymous === true ? null : nonBlankOrNull(reviewer?.displayName),
        author_photo_uri: nonBlankOrNull(reviewer?.profilePhotoUrl),
        anonymous: reviewer?.isAnonymous === true,
        text: nonBlankOrNull(item.comment),
        created_at: nonBlankOrNull(item.createTime),
        updated_at: nonBlankOrNull(item.updateTime),
        reply_text: nonBlankOrNull(reply?.comment),
        replied_at: nonBlankOrNull(reply?.updateTime),
      };
    })
    .filter((r): r is GbpReview => r !== null);
  const avg = typeof record?.averageRating === "number" ? record.averageRating : null;
  const total = typeof record?.totalReviewCount === "number" ? record.totalReviewCount : null;
  return { reviews, average_rating: avg, total_count: total, next_page_token: nonBlankOrNull(record?.nextPageToken) };
}

export async function callProfileApi(http: PlacesHttp, req: PlacesRequest): Promise<unknown> {
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

/**
 * One location read alone by its name (locations/{id}): one call whatever the size of the account, read in the fields
 * each of an account's list is (parseLocations). A refusal is named, as every call's is; an answer that names no
 * location is Google's fault (502).
 */
export async function readLocation(http: PlacesHttp, token: string, locationName: string): Promise<GbpLocation> {
  const loc = parseLocation(await callProfileApi(http, locationRequest(token, locationName)));
  if (!loc) throw new PlacesError(502, `Google's answer for ${locationName} named no location`);
  return loc;
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

/** One photo a profile holds: Google's name for it, where to read it now, and what Google files it under. */
export interface GbpPhoto {
  name: string;
  url: string;
  category: string | null;
}

/** A photo's address at the size asked for, in place of whatever size it came with. */
function photoAtSize(url: string): string {
  const at = url.lastIndexOf("=");
  const base = at > url.lastIndexOf("/") ? url.slice(0, at) : url;
  return `${base}=s${GBP_PHOTO_SIDE}`;
}

function parseMediaPage(json: unknown): { photos: GbpPhoto[]; next_page_token: string | null } {
  const record = recordOrNull(json);
  const items = Array.isArray(record?.mediaItems) ? record.mediaItems : [];
  const photos = items.flatMap((raw): GbpPhoto[] => {
    const m = recordOrNull(raw);
    const name = nonBlankOrNull(m?.name);
    const url = nonBlankOrNull(m?.googleUrl);
    if (!name || !url || m?.mediaFormat !== "PHOTO") return [];
    return [{ name, url: photoAtSize(url), category: nonBlankOrNull(recordOrNull(m.locationAssociation)?.category) }];
  });
  return { photos, next_page_token: nonBlankOrNull(record?.nextPageToken) };
}

export async function listMedia(
  http: PlacesHttp,
  token: string,
  parent: string,
  pageToken: string | null,
): Promise<{ photos: GbpPhoto[]; next_page_token: string | null }> {
  return parseMediaPage(await callProfileApi(http, mediaRequest(token, parent, pageToken)));
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

/**
 * A post on the location's profile. Google takes it and looks at it first, so `state` starts PROCESSING and `search_url` may not be
 * there yet; `name` is what it comes down by. Google fetches the photo from `photoUrl` by itself, so that has to be a direct address.
 */
export async function createLocalPost(
  http: PlacesHttp,
  token: string,
  parent: string,
  post: GbpPostAsked,
): Promise<{ name: string; search_url: string | null; state: string | null }> {
  const o = recordOrNull(await callProfileApi(http, localPostRequest(token, parent, post)));
  const name = nonBlankOrNull(o?.name);
  if (!name) throw new PlacesError(502, "Google answered a post with no name");
  return { name, search_url: nonBlankOrNull(o?.searchUrl), state: nonBlankOrNull(o?.state) };
}

/** A post off the profile, by Google's name for it. One already gone is what was asked for. */
export async function deleteLocalPost(http: PlacesHttp, token: string, name: string): Promise<void> {
  const r = await http({ url: `${GBP_V4_BASE}/${name}`, method: "DELETE", headers: bearer(token, true) });
  if (r.status === 404 || (r.status >= 200 && r.status < 300)) return;
  throw refusal(r.status, r.body);
}
