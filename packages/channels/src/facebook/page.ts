/**
 * Facebook's wire: a post put on a business's Page (the content loop PRD's pass 5), through the Page's own token, which the
 * Meta link's token is asked for (Meta's Pages guide: "Most endpoints require Page access tokens"). Read against Meta's
 * Pages API posts guide, its Page Photos, Page Feed, Post and Page Stories references and its Reels publishing guide on
 * 23 November 2026 (v27.0); nothing here has been seen on a real Page yet.
 *
 * Each kind goes in two steps, as Instagram's does, so the media is fetched and checked well before its time:
 * - a picture: the photo kept unpublished (Meta keeps one about a day), then a post of the Page made with it and its words;
 * - a story: the same unpublished photo, then put up as the Page's story;
 * - a reel: a reel started, Meta asked to fetch the video from its address (`file_url`, no bytes through us), then
 *   finished as published with its words.
 *
 * Every request is built by a pure function and read by a pure parser (answers.ts), so the tests run them without a
 * network; the calls leave through callFacebook, Facebook's own breaker. A token travels where Meta's guide puts it, with
 * its `appsecret_proof` beside it on the Graph; a write's fields go in its body, so words never ride in an address a log
 * may keep.
 */
import { META_GRAPH, metaAppSecretProof, type MetaRequest } from "../meta/client";
import { answerObject, fetchFromProvider, type SendOutcome } from "../shared/provider-fetch";

/** What asks for the Page's token: the Meta link's token, the app's secret its proof is made with, and the Page. */
export interface PagePoster {
  token: string;
  appSecret: string;
  pageId: string;
}

/** What every call to the Page carries: the Page's own token, the app's secret, and the Page. */
export interface PageHand {
  pageToken: string;
  appSecret: string;
  pageId: string;
}

/** Meta's video upload host, at the Graph's own version. */
const RUPLOAD = `https://rupload.facebook.com/video-upload/${META_GRAPH.slice(META_GRAPH.lastIndexOf("/") + 1)}`;

const page = (hand: Pick<PageHand, "pageId">): string => encodeURIComponent(hand.pageId);
const proofOf = (token: string, appSecret: string): Record<string, string> => ({
  access_token: token,
  appsecret_proof: metaAppSecretProof(token, appSecret),
});

/** A read of the Graph with the Page's token. */
const readFrom = (path: string, params: Record<string, string>, hand: PageHand): MetaRequest => ({
  url: `${META_GRAPH}/${path}?${new URLSearchParams({ ...params, ...proofOf(hand.pageToken, hand.appSecret) }).toString()}`,
  method: "GET",
});

/** A write to the Graph with the Page's token, its fields in the body. */
const writeTo = (path: string, fields: Record<string, string>, hand: PageHand): MetaRequest => ({
  url: `${META_GRAPH}/${path}`,
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ ...fields, ...proofOf(hand.pageToken, hand.appSecret) }).toString(),
});

/** The Page's own token, asked with the Meta link's (its answer is never kept: it holds the token). */
export function pageTokenRequest(poster: PagePoster): MetaRequest {
  return {
    url: `${META_GRAPH}/${page(poster)}?${new URLSearchParams({
      fields: "access_token",
      ...proofOf(poster.token, poster.appSecret),
    }).toString()}`,
    method: "GET",
  };
}

/** A photo Meta fetches from its address and keeps unpublished (Page Photos, `published=false`): a post's or a story's. */
export function pagePhotoRequest(hand: PageHand, mediaUrl: string): MetaRequest {
  return writeTo(`${page(hand)}/photos`, { url: mediaUrl, published: "false" }, hand);
}

/** Whether Meta still holds an unpublished photo. */
export function pagePhotoReadRequest(hand: PageHand, photoId: string): MetaRequest {
  return readFrom(encodeURIComponent(photoId), { fields: "id" }, hand);
}

/** A post of the Page made with a kept photo and its words: the only call that puts a picture in front of anyone. */
export function pagePostRequest(hand: PageHand, at: { photoId: string; caption: string | null }): MetaRequest {
  return writeTo(
    `${page(hand)}/feed`,
    {
      "attached_media[0]": JSON.stringify({ media_fbid: at.photoId }),
      published: "true",
      ...(at.caption ? { message: at.caption } : {}),
    },
    hand,
  );
}

/** A kept photo put up as the Page's story (Page Stories, photo_stories): it shows no words. */
export function pageStoryRequest(hand: PageHand, photoId: string): MetaRequest {
  return writeTo(`${page(hand)}/photo_stories`, { photo_id: photoId }, hand);
}

/** A reel begun: Meta answers the video's id it will take the file under. */
export function pageReelStartRequest(hand: PageHand): MetaRequest {
  return writeTo(`${page(hand)}/video_reels`, { upload_phase: "start" }, hand);
}

/**
 * Meta asked to fetch a reel's video from its address itself (the Reels guide's `file_url` header): no bytes pass through
 * Chanlytics. The address must open without signing in, which a link signed for a day does.
 */
export function pageReelFetchRequest(hand: PageHand, videoId: string, mediaUrl: string): MetaRequest {
  return {
    url: `${RUPLOAD}/${encodeURIComponent(videoId)}`,
    method: "POST",
    headers: { Authorization: `OAuth ${hand.pageToken}`, file_url: mediaUrl },
  };
}

/** A fetched reel published with its words: the only call that puts a reel in front of anyone. */
export function pageReelFinishRequest(hand: PageHand, at: { videoId: string; caption: string | null }): MetaRequest {
  return writeTo(
    `${page(hand)}/video_reels`,
    {
      upload_phase: "finish",
      video_id: at.videoId,
      video_state: "PUBLISHED",
      ...(at.caption ? { description: at.caption } : {}),
    },
    hand,
  );
}

/** Where a reel stands: its upload, its processing and its publishing, and its address once it has one. */
export function pageVideoStatusRequest(hand: PageHand, videoId: string): MetaRequest {
  return readFrom(encodeURIComponent(videoId), { fields: "id,status,permalink_url,created_time" }, hand);
}

/** A post of the Page, by its id: its address and its time. */
export function pagePostReadRequest(hand: PageHand, postId: string): MetaRequest {
  return readFrom(encodeURIComponent(postId), { fields: "id,permalink_url,created_time,is_published" }, hand);
}

/** The Page's own newest posts, with their words, to find one a send with no answer may have made. */
export function pagePostsRequest(hand: PageHand): MetaRequest {
  return readFrom(
    `${page(hand)}/published_posts`,
    { fields: "id,message,created_time,permalink_url", limit: "10" },
    hand,
  );
}

/** The Page's stories (Page Stories: each with its post id, its photo, its state and its time). */
export function pageStoriesRequest(hand: PageHand): MetaRequest {
  return readFrom(`${page(hand)}/stories`, {}, hand);
}

/** The Page's reels, by id, to tell one that is gone from one this connection may not read. */
export function pageReelsRequest(hand: PageHand): MetaRequest {
  return readFrom(`${page(hand)}/video_reels`, { fields: "id", limit: "25" }, hand);
}

/** A post, a story or a reel taken off the Page (Meta's Pages guide: a DELETE of the node). */
export function pageDeleteRequest(hand: PageHand, id: string): MetaRequest {
  return {
    url: `${META_GRAPH}/${encodeURIComponent(id)}?${new URLSearchParams(proofOf(hand.pageToken, hand.appSecret)).toString()}`,
    method: "DELETE",
  };
}

/* -------------------------------------------------------------- the call */

/** What one call to Facebook came to: the outcome a caller acts on, the status, and the answer as it came. */
export interface FacebookAnswer {
  outcome: SendOutcome;
  status: number;
  json: Record<string, unknown> | null;
  error: string | null;
}

/** The test's network, or the real one. */
export interface FacebookDeps {
  fetch?: typeof fetch;
}

/**
 * One request to a Page, bounded and never thrown, through Facebook's own breaker: a fault there never holds an Instagram
 * call or a WhatsApp one. A read may be asked twice; a write once.
 */
export async function callFacebook(
  req: MetaRequest,
  opts: { timeoutMs: number },
  deps: FacebookDeps = {},
): Promise<FacebookAnswer> {
  const reply = await fetchFromProvider(
    "facebook",
    req.url,
    {
      method: req.method,
      ...(req.headers ? { headers: req.headers } : {}),
      ...(req.body !== undefined ? { body: req.body } : {}),
      timeoutMs: opts.timeoutMs,
      ...(req.method === "GET" ? { idempotent: true, tries: 2 } : {}),
    },
    deps.fetch ? { fetch: deps.fetch } : {},
  );
  return { outcome: reply.outcome, status: reply.status, json: answerObject(reply), error: reply.error };
}
