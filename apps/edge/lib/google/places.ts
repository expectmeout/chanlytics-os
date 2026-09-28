/**
 * The one transport to Google and the two Places reads over it. `http` is
 * bound when this module loads, and placesFetch() captures `fetch` as it is
 * then; the listing check, the credentials and the profile's routines ride
 * it unless their caller hands them a `net` of its own.
 */
import {
  getPlace,
  placesFetch,
  searchPlaces,
  type PlaceCandidate,
  type PlaceDetails,
  type PlacesHttp,
} from "../packages/channels.js";

const http: PlacesHttp = placesFetch();

export async function findPlaces(key: string, query: string): Promise<PlaceCandidate[]> {
  return searchPlaces(http, key, query);
}

export async function readPlace(key: string, placeId: string): Promise<PlaceDetails> {
  return getPlace(http, key, placeId);
}

export { http };
