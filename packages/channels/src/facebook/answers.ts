/**
 * What a Page answers, read (page.ts builds what is asked): an id Meta made, a delete or a publish it confirmed, where a reel
 * stands, a post and the Page's lists of posts and stories, and a refusal said as which of the owner's sentences it is
 * (contracts ON_FACEBOOK.refused). Read against Meta's Pages guide and Reels guide on 23 November 2026; the codes Meta names
 * there are the ones read here, and anything else is the plain "did not take the post".
 */
import { MIN_MS, recordOrEmpty, valueAt, type FacebookRefusal, type PostKind } from "@chanlytics/contracts";
import { metaErrorOf, metaNextPageOf, metaText, type MetaNextPage } from "../meta/client";

const objectOf = (json: unknown): Record<string, unknown> | null =>
  json && typeof json === "object" && !Array.isArray(json) ? recordOrEmpty(json) : null;
const listOf = (json: unknown): Record<string, unknown>[] => {
  const data = valueAt(objectOf(json), "data");
  if (!Array.isArray(data)) return [];
  return data.flatMap((d): Record<string, unknown>[] => {
    const o = objectOf(d);
    return o ? [o] : [];
  });
};
/** An id Meta names: digits, a post's `<page>_<post>` among them. */
const idOf = (value: unknown): string | null => {
  const text = metaText(value);
  return /^\d{3,40}(?:_\d{3,40})?$/.test(text) ? text : null;
};
/** A Page's address as Meta gives it: whole, or a path on facebook.com (a reel's may be). */
const addressOf = (value: unknown): string | null => {
  const text = metaText(value).trim();
  if (/^https:\/\//.test(text)) return text;
  return text.startsWith("/") ? `https://www.facebook.com${text}` : null;
};

/** The Page's own token, where Meta gave one; null where it did not. Never kept, never logged. */
export const parsePageToken = (json: unknown): string | null =>
  metaText(valueAt(objectOf(json), "access_token")) || null;

/** The id Meta made, under the key its answer names it by (a photo's `id`, a story's `post_id`, a reel's `video_id`). */
export const parsePageMade = (json: unknown, key: "id" | "post_id" | "video_id"): string | null =>
  idOf(valueAt(objectOf(json), key));

/** Whether Meta confirmed the call (a reel's fetch and finish, a delete: `{"success": true}`). */
export const parsePageSuccess = (json: unknown): boolean => valueAt(objectOf(json), "success") === true;

/** A post of the Page as Meta keeps it: its id, its address, its time, and its words where they were asked. */
export interface PagePost {
  id: string;
  permalink: string | null;
  createdTime: string | null;
  message: string | null;
}

const pagePostOf = (o: Record<string, unknown>): PagePost | null => {
  const id = idOf(valueAt(o, "id"));
  if (!id) return null;
  return {
    id,
    permalink: addressOf(valueAt(o, "permalink_url")),
    createdTime: metaText(valueAt(o, "created_time")) || null,
    message: metaText(valueAt(o, "message")) || null,
  };
};

/** One post, read by its id; null where the answer names none, or Meta says it is not yet published. */
export function parsePagePost(json: unknown): PagePost | null {
  const o = objectOf(json);
  if (!o || valueAt(o, "is_published") === false) return null;
  return pagePostOf(o);
}

/** The Page's newest posts. */
export const parsePagePosts = (json: unknown): PagePost[] => listOf(json).flatMap((o) => pagePostOf(o) ?? []);

/** One page of the Page's own list: the posts it names, and where the next page begins (null: the list ended here). */
export interface PageListedPage {
  posts: { id: string; atMs: number | null }[];
  next: MetaNextPage | null;
}

/** One page of the Page's posts as Meta listed it; null where the answer is no list at all. */
export function parsePageListedPage(json: unknown): PageListedPage | null {
  if (!Array.isArray(valueAt(objectOf(json), "data"))) return null;
  const posts = parsePagePosts(json).map((post) => {
    const at = post.createdTime ? Date.parse(post.createdTime) : Number.NaN;
    return { id: post.id, atMs: Number.isFinite(at) ? at : null };
  });
  return { posts, next: metaNextPageOf(json) };
}

/** Of the Page's newest posts, the one a send made: since the send, with the words it was sent with; null when not one. */
export function pagePostSentBy(
  posts: readonly PagePost[],
  sent: { at: string; caption: string | null },
): PagePost | null {
  const after = Date.parse(sent.at) - MIN_MS;
  const fitting = posts.filter((p) => {
    const at = p.createdTime ? Date.parse(p.createdTime) : Number.NaN;
    if (!(at >= after)) return false;
    return sent.caption ? (p.message ?? "").trim() === sent.caption.trim() : true;
  });
  return fitting.length === 1 ? (fitting[0] ?? null) : null;
}

/** A story of the Page (Page Stories): its post's id, the photo it shows, whether it is up, its time and its address. */
export interface PageStory {
  postId: string;
  mediaId: string | null;
  up: boolean;
  createdTime: string | null;
  url: string | null;
}

/** The Page's stories; `up` where Meta says PUBLISHED (an ended one is ARCHIVED). */
export const parsePageStories = (json: unknown): PageStory[] =>
  listOf(json).flatMap((o) => {
    const postId = idOf(valueAt(o, "post_id"));
    if (!postId) return [];
    const at = valueAt(o, "creation_time");
    return [
      {
        postId,
        mediaId: idOf(valueAt(o, "media_id")),
        up: metaText(valueAt(o, "status")).toUpperCase() === "PUBLISHED",
        // Meta gives a story's time as seconds since 1970, or as a date: either is kept as a date.
        createdTime: typeof at === "number" ? new Date(at * 1000).toISOString() : metaText(at) || null,
        url: addressOf(valueAt(o, "url")),
      },
    ];
  });

/** The ids a list names (the Page's reels). */
export const parsePageIds = (json: unknown): string[] => listOf(json).flatMap((o) => idOf(valueAt(o, "id")) ?? []);

/**
 * Where a reel stands, from its three phases (Reels guide): its file still being fetched; fetched and not yet asked to go
 * up (its publishing phase not started); asked to go up and not yet up; up; failed; or lapsed.
 */
export type ReelState = "fetching" | "fetched" | "publishing" | "published" | "failed" | "expired";

/** A reel's state as Meta says it, its address once it has one, and the words of a fault where Meta gave them. */
export interface PageReel {
  state: ReelState;
  permalink: string | null;
  createdTime: string | null;
  fault: string | null;
}

const PHASES = ["uploading_phase", "processing_phase", "publishing_phase"] as const;
const phaseOf = (status: Record<string, unknown> | null, phase: string): Record<string, unknown> | null =>
  objectOf(valueAt(status, phase));
const phaseSaid = (status: Record<string, unknown> | null, phase: string): string =>
  metaText(valueAt(phaseOf(status, phase), "status")).toLowerCase();
const faultOf = (status: Record<string, unknown> | null): string | null => {
  for (const phase of PHASES) {
    const errors = valueAt(phaseOf(status, phase), "errors");
    const one =
      objectOf(valueAt(phaseOf(status, phase), "error")) ?? objectOf(Array.isArray(errors) ? errors[0] : null);
    const words = metaText(valueAt(one, "message"));
    if (words) return words.slice(0, 300);
  }
  return null;
};

/** Meta writes a phase done as `complete` or `completed` (its guide shows both): either is read. */
const isDone = (said: string): boolean => said === "complete" || said === "completed";

function reelStateOf(status: Record<string, unknown> | null): ReelState {
  const video = metaText(valueAt(status, "video_status")).toLowerCase();
  if (video === "error" || video === "upload_failed" || PHASES.some((p) => phaseSaid(status, p) === "error"))
    return "failed";
  if (video === "expired") return "expired";
  const publishing = phaseSaid(status, "publishing_phase");
  const said = metaText(valueAt(phaseOf(status, "publishing_phase"), "publish_status")).toLowerCase();
  if (said === "published" && isDone(publishing)) return "published";
  if (publishing && publishing !== "not_started") return "publishing";
  return isDone(phaseSaid(status, "uploading_phase")) ? "fetched" : "fetching";
}

/** Where a reel stands, as Meta's `status` field says it, with its address once it has one. */
export function parsePageReel(json: unknown): PageReel {
  const o = objectOf(json);
  const status = objectOf(valueAt(o, "status"));
  const state = reelStateOf(status);
  return {
    state,
    permalink: addressOf(valueAt(o, "permalink_url")),
    createdTime: metaText(valueAt(o, "created_time")) || null,
    fault: state === "failed" ? faultOf(status) : null,
  };
}

/* -------------------------------------------------------------- refusals */

/** The codes that say the media is at fault (Page Photos, Page Videos, the Reels guide): its file, its fetch, its shape. */
const MEDIA_CODES: readonly number[] = [324, 352, 382, 389, 6000, 6001, 1363040, 1363127, 1363128, 1363129];
/** Too many, too fast: Graph's throttles and a Page's own (80001). Nothing was taken. */
const BUSY_CODES: readonly number[] = [4, 17, 32, 613, 80001];
/** The connection may not do this to the Page: no permission, or none for this Page (283 names the missing ones). */
const PERMISSION_CODES: readonly number[] = [10, 200, 210, 283];

/** Which of the owner's sentences a refusal is, from Meta's answer: its code, the HTTP status, and what was sent. */
export function pageRefusalOf(
  answer: { status: number; json: unknown },
  kind: PostKind,
): { refusal: FacebookRefusal; code: number | null; subcode: number | null } {
  const error = metaErrorOf(answer.json, "Facebook refused the request");
  const code = error?.code ?? null;
  const subcode = error?.subcode ?? null;
  const of = (refusal: FacebookRefusal) => ({ refusal, code, subcode });
  if (code === 190) return of("token");
  if (answer.status === 429 || (code !== null && BUSY_CODES.includes(code))) return of("busy");
  if (code !== null && (PERMISSION_CODES.includes(code) || (code >= 200 && code < 300))) return of("permission");
  if (code !== null && MEDIA_CODES.includes(code)) return of(kind === "reel" ? "video" : "picture");
  return of("other");
}

/** Whether a refusal means the connection itself cannot act on the Page now: nothing was sent, and the owner must act. */
export const pageRefusalLosesConnection = (refusal: FacebookRefusal): boolean =>
  refusal === "token" || refusal === "permission";
