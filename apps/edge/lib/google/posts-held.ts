/**
 * Google as the daily read asks it (content/posts-read.ts): the location the workspace's connection keeps, its own list of
 * posts a page at a time, and the adapter a post the list no longer names is asked of by Google's name for it. So a post
 * removed on Google itself is noticed, which no read of numbers ever did: Google gives a post none.
 *
 * A post's name says whose it is (accounts/…/locations/…/localPosts/…): only one of the location connected now is this
 * list's. A post Google holds as rejected is left out of the list read here, so it is asked about by its name and said
 * to be down, as Google shows it. Built from Google's reference; no real listing has shown any of it yet.
 */
import { PlacesError, listLocalPosts, reviewParent } from "@chanlytics/channels/google";
import { FILE_WORDS } from "@chanlytics/contracts";
import { readListing, type ListedPage } from "../content/place-listing.js";
import type { HeldPlace, HeldPlaceOf } from "../content/posts-read.js";
import { tokenFor } from "../shared/google/credentials.js";
import { http } from "../shared/google/places.js";
import { connectionOf } from "../shared/google/rows.js";
import { GOOGLE_POST_REJECTED } from "./local-posts.js";
import { googlePlaceAsked } from "./place.js";

/** Google turned the ask away for now (too many, or not able this minute): no answer, never a refusal of the account. */
const GOOGLE_BUSY: readonly number[] = [429, 500, 502, 503, 504];

/** A page that could not be read: Google's status for the log, and whether it was a no or only not now. */
function unreadPage(e: unknown): ListedPage<string> {
  if (!(e instanceof PlacesError)) throw e;
  return { is: GOOGLE_BUSY.includes(e.status) ? "unknown" : "refused", said: String(e.status) };
}

/** The workspace's Google location as the daily read asks it, or why it cannot be asked now. */
export const findGoogleHeld: HeldPlaceOf = async (db, tenantId): Promise<HeldPlace | { cant: string }> => {
  const connection = await connectionOf(db, tenantId);
  if (!connection?.location_name) return { cant: FILE_WORDS.google.heldNoConnection };
  const parent = reviewParent(connection.account_name, connection.location_name);
  const page = async (pageToken: string | null): Promise<ListedPage<string>> => {
    const token = await tokenFor(db, tenantId);
    if (!token.ok) return { is: "refused", said: token.error };
    const listed = await listLocalPosts(http, token.token, parent, pageToken).catch(unreadPage);
    if ("is" in listed) return listed;
    const posts = listed.posts
      .filter((post) => post.state !== GOOGLE_POST_REJECTED)
      .map((post) => ({ id: post.name, atMs: post.created_at ? Date.parse(post.created_at) : null }));
    return { is: "page", posts, next: listed.next_page_token };
  };
  return {
    holds: (post) => !!post.external_id?.startsWith(`${parent}/localPosts/`),
    placeOf: (post) => googlePlaceAsked(db, { tenantId, fileId: post.file_id, by: post.approved_by }),
    list: (since, deadline) => readListing(page, since.getTime(), deadline),
  };
};
