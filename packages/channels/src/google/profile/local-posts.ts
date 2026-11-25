/**
 * What a business's profile holds, asked of Google: its own posts a page at a time, and one post by its name. The daily
 * read (the edge's content/posts-read.ts) holds them against the posts Chanlytics calls up there.
 *
 * Read against Google's accounts.locations.localPosts reference (list, get, and the LocalPost resource) on 24 November
 * 2026. A page holds at most 100 posts and names the next by a token; the reference states no order, so nothing here
 * leans on one. A post says where it stands: LIVE, PROCESSING (taken, not showing yet) or REJECTED ("rejected due to
 * content policy violation"). One Google no longer has answers NOT_FOUND. No real listing has shown any of it yet.
 */
import { nonBlankOrNull, recordOrNull } from "@chanlytics/contracts";
import { type PlacesHttp, type PlacesRequest, refusal } from "../places";
import { callProfileApi } from "./profile";
import { GBP_V4_BASE, bearer } from "./requests";

/** The most posts Google gives in one page (its reference: "maximum page size is 100"). */
const GBP_POSTS_PAGE = 100;

/** A post as the profile holds it: Google's name for it, where it stands, when it was made and where it shows. */
export interface GbpLocalPost {
  /** accounts/{id}/locations/{id}/localPosts/{id} */
  name: string;
  /** LIVE, PROCESSING or REJECTED, as Google says it; null where it said none. */
  state: string | null;
  created_at: string | null;
  search_url: string | null;
}

function localPostOf(raw: unknown): GbpLocalPost | null {
  const o = recordOrNull(raw);
  const name = nonBlankOrNull(o?.name);
  if (!name) return null;
  return {
    name,
    state: nonBlankOrNull(o?.state),
    created_at: nonBlankOrNull(o?.createTime),
    search_url: nonBlankOrNull(o?.searchUrl),
  };
}

function localPostsRequest(token: string, parent: string, pageToken: string | null): PlacesRequest {
  const asked = new URLSearchParams({ pageSize: String(GBP_POSTS_PAGE), ...(pageToken ? { pageToken } : {}) });
  return {
    url: `${GBP_V4_BASE}/${parent}/localPosts?${asked.toString()}`,
    method: "GET",
    headers: bearer(token, true),
  };
}

/** One page of the location's posts, and the token of the next (null: the list ended here). A refusal throws, named. */
export async function listLocalPosts(
  http: PlacesHttp,
  token: string,
  parent: string,
  pageToken: string | null,
): Promise<{ posts: GbpLocalPost[]; next_page_token: string | null }> {
  const o = recordOrNull(await callProfileApi(http, localPostsRequest(token, parent, pageToken)));
  const listed = Array.isArray(o?.localPosts) ? o.localPosts : [];
  return {
    posts: listed.flatMap((raw) => localPostOf(raw) ?? []),
    next_page_token: nonBlankOrNull(o?.nextPageToken),
  };
}

/** One post by Google's name for it; null where Google no longer has it (NOT_FOUND). Any other refusal throws, named. */
export async function readLocalPost(http: PlacesHttp, token: string, name: string): Promise<GbpLocalPost | null> {
  const r = await http({ url: `${GBP_V4_BASE}/${name}`, method: "GET", headers: bearer(token, true) });
  if (r.status === 404) return null;
  if (r.status < 200 || r.status >= 300) throw refusal(r.status, r.body);
  let json: unknown = null;
  try {
    json = JSON.parse(r.body);
  } catch {
    // Not JSON: read below as an answer that names no post.
  }
  // A 2xx that names no post proves nothing either way: said as Google's fault, never as a post that is gone.
  const post = localPostOf(json);
  if (!post) throw refusal(502, "");
  return post;
}
