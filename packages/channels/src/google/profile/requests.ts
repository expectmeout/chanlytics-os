/** Profile: requests. */

import { type PlacesRequest } from "../places";

export const GBP_ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";

export const GBP_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";

export const GBP_V4_BASE = "https://mybusiness.googleapis.com/v4";

/** What a location is asked for: its name, its title, where it is, and the metadata that names its place on Maps. */
export const GBP_LOCATIONS_READ_MASK = "name,title,storefrontAddress,metadata";

export const GBP_REVIEWS_PAGE = 50;

/** Pages of fifty read on one sync: a history of two hundred and fifty, then the newest page each day. */
export const GBP_REVIEWS_MAX_PAGES = 5;

/**
 * Pages read on a location's first sync (decision 0073, R17): every review it has, as far as one sync can read in its
 * function's time, two thousand at most; reviews_complete says whether that was all of them.
 */
export const GBP_REVIEWS_FIRST_PAGES = 40;

export type Obj = Record<string, unknown>;

export function bearer(token: string, v4 = false): Record<string, string> {
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

/** One location by its name (locations/{id}), asked for the fields an account's list asks each one for (locations.get). */
export function locationRequest(token: string, locationName: string): PlacesRequest {
  const q = new URLSearchParams({ readMask: GBP_LOCATIONS_READ_MASK });
  return { url: `${GBP_INFO_BASE}/${locationName}?${q.toString()}`, method: "GET", headers: bearer(token) };
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

/** A profile's photos, a page at a time: few, since each is then read whole. Customers' are a list of their own. */
const GBP_MEDIA_PAGE = 12;

/** The long side a photo is asked for at: Google's address takes it after a last "=". */
export const GBP_PHOTO_SIDE = 2400;

export function mediaRequest(token: string, parent: string, pageToken?: string | null): PlacesRequest {
  const q = new URLSearchParams({ pageSize: String(GBP_MEDIA_PAGE) });
  if (pageToken) q.set("pageToken", pageToken);
  return { url: `${GBP_V4_BASE}/${parent}/media?${q.toString()}`, method: "GET", headers: bearer(token, true) };
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
