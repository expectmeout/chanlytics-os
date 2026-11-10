/**
 * Posting through the Meta link (decision 0121): a picture or a story put on a business's Instagram account, with the token
 * the Meta link keeps (meta.ts). Instagram takes a post in two calls. The first makes a container from a public picture
 * Instagram fetches itself; the second publishes the container, and only that one puts anything in front of anyone. Between
 * them the container's status is asked, since a container is ready only once Instagram has fetched and checked the picture.
 * A send that got no answer is settled by reading what the account has, never by sending again.
 *
 * Read against Meta's content publishing guide and its IG User media, media_publish, content_publishing_limit and IG
 * Container references on 10 November 2026. Every request is built by a pure function and read by a pure parser; the calls
 * leave through callInstagram, so the tests run them without a network.
 */
import { MIN_MS, recordOrEmpty, valueAt, type InstagramPostKind } from "@chanlytics/contracts";
import type { InstagramRequest } from "./graph";
import { instagramErrorOf } from "./graph";
import { META_GRAPH_VERSION, metaAppSecretProof } from "./meta";

const META_GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** What every posting call carries: the business's token, the app's secret its proof is made with, and the account. */
export interface MetaPoster {
  token: string;
  appSecret: string;
  accountId: string;
}

const proofOf = (poster: Pick<MetaPoster, "token" | "appSecret">): Record<string, string> => ({
  access_token: poster.token,
  appsecret_proof: metaAppSecretProof(poster.token, poster.appSecret),
});

const readFrom = (path: string, params: Record<string, string>, poster: MetaPoster): InstagramRequest => ({
  url: `${META_GRAPH}/${path}?${new URLSearchParams({ ...params, ...proofOf(poster) }).toString()}`,
  method: "GET",
});

/** A write's fields go in its body, so a caption never rides in an address a log may keep. */
const writeTo = (path: string, fields: Record<string, string>, poster: MetaPoster): InstagramRequest => ({
  url: `${META_GRAPH}/${path}`,
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ ...fields, ...proofOf(poster) }).toString(),
});

/** How many posts the account has made in the last 24 hours, and how many it may (stories count). */
export function metaPostLimitRequest(poster: MetaPoster): InstagramRequest {
  return readFrom(
    `${encodeURIComponent(poster.accountId)}/content_publishing_limit`,
    { fields: "quota_usage,config" },
    poster,
  );
}

/** The longest description of a picture Instagram keeps (IG User media, `alt_text`). */
const META_ALT_MAX = 1000;

/**
 * The fields a container is made with, as the attempt keeps them: the picture's host alone, never its signed address, and
 * never a token. A story shows no caption and takes no description, so neither is sent. A post's description (`says`, the
 * words drawn on the picture) is what Instagram reads out to someone who cannot see it.
 */
export function metaContainerFields(
  kind: InstagramPostKind,
  imageUrl: string,
  words: { caption: string | null; says: string | null },
): Record<string, string> {
  if (kind === "story") return { image_url: imageUrl, media_type: "STORIES" };
  return {
    image_url: imageUrl,
    ...(words.caption ? { caption: words.caption } : {}),
    ...(words.says ? { alt_text: words.says.slice(0, META_ALT_MAX) } : {}),
  };
}

/** A container made from a public picture (a JPEG Instagram fetches itself): a post, or a story. */
export function metaContainerRequest(poster: MetaPoster, fields: Record<string, string>): InstagramRequest {
  return writeTo(`${encodeURIComponent(poster.accountId)}/media`, fields, poster);
}

/** Where a container stands: IN_PROGRESS, FINISHED, PUBLISHED, ERROR or EXPIRED. */
export function metaContainerStatusRequest(poster: MetaPoster, containerId: string): InstagramRequest {
  return readFrom(encodeURIComponent(containerId), { fields: "status_code,status" }, poster);
}

/** The container published: the only call that puts the post in front of anyone. */
export function metaPublishRequest(poster: MetaPoster, containerId: string): InstagramRequest {
  return writeTo(`${encodeURIComponent(poster.accountId)}/media_publish`, { creation_id: containerId }, poster);
}

/** A published post's address and time. */
export function metaMediaReadRequest(poster: MetaPoster, mediaId: string): InstagramRequest {
  return readFrom(encodeURIComponent(mediaId), { fields: "id,permalink,timestamp" }, poster);
}

/** The account's newest posts, or its live stories, to find one a send with no answer may have made. */
export function metaNewestMediaRequest(poster: MetaPoster, kind: InstagramPostKind): InstagramRequest {
  const edge = kind === "story" ? "stories" : "media";
  return readFrom(
    `${encodeURIComponent(poster.accountId)}/${edge}`,
    { fields: "id,caption,timestamp,permalink", limit: "10" },
    poster,
  );
}

/* -------------------------------------------------------------- answers */

const metaValue = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const objectOf = (json: unknown): Record<string, unknown> | null =>
  json && typeof json === "object" ? recordOrEmpty(json) : null;

/** The account's posts in the last 24 hours and its limit; null when Instagram said neither. */
export function parseMetaPostLimit(json: unknown): { used: number; total: number } | null {
  const first = valueAt(objectOf(json), "data");
  const row = objectOf(Array.isArray(first) ? first[0] : null);
  const used = valueAt(row, "quota_usage");
  const total = valueAt(objectOf(valueAt(row, "config")), "quota_total");
  return typeof used === "number" && typeof total === "number" ? { used, total } : null;
}

/** The id Instagram gave a container or a published post. Throws with Instagram's words when it gave none. */
export function parseMetaCreatedId(json: unknown): string {
  const id = metaValue(valueAt(objectOf(json), "id"));
  if (!/^\d{5,32}$/.test(id)) throw new Error(instagramErrorOf(json)?.message ?? "Instagram answered without an id");
  return id;
}

/** Where a container stands, as Instagram says it; "" when it said nothing it could read. */
export type MetaContainerStatus = "IN_PROGRESS" | "FINISHED" | "PUBLISHED" | "ERROR" | "EXPIRED" | "";

export function parseMetaContainerStatus(json: unknown): { code: MetaContainerStatus; detail: string } {
  const answer = objectOf(json);
  const code = metaValue(valueAt(answer, "status_code"));
  const known: readonly MetaContainerStatus[] = ["IN_PROGRESS", "FINISHED", "PUBLISHED", "ERROR", "EXPIRED"];
  return {
    code: known.find((k) => k === code) ?? "",
    detail: metaValue(valueAt(answer, "status")).slice(0, 200),
  };
}

/** A post on the account: its id, its caption, when and where. */
export interface MetaMedia {
  id: string;
  caption: string | null;
  timestamp: string | null;
  permalink: string | null;
}

const mediaOf = (value: unknown): MetaMedia | null => {
  const media = objectOf(value);
  const id = metaValue(valueAt(media, "id"));
  if (!/^\d{5,32}$/.test(id)) return null;
  return {
    id,
    caption: metaValue(valueAt(media, "caption")) || null,
    timestamp: metaValue(valueAt(media, "timestamp")) || null,
    permalink: metaValue(valueAt(media, "permalink")) || null,
  };
};

/** One post as Instagram describes it; null when the answer names none. */
export function parseMetaMedia(json: unknown): MetaMedia | null {
  return mediaOf(json);
}

/** The account's newest posts, or its live stories. Throws when Instagram listed nothing it could read. */
export function parseMetaMediaList(json: unknown): MetaMedia[] {
  const data = valueAt(objectOf(json), "data");
  if (!Array.isArray(data)) throw new Error(instagramErrorOf(json)?.message ?? "Instagram did not list the posts");
  return data.flatMap((item) => {
    const media = mediaOf(item);
    return media ? [media] : [];
  });
}

/**
 * Of the account's newest, the one a send at `sent.at` made: posted after it (a minute's grace for two clocks), with the
 * caption it was sent with where it had one. Only when exactly one fits: two that fit are two posts, and nothing here says
 * which is this one. A story carries no caption, so one found by its time alone is where the post is, never proof that it
 * went up: the owner may have put one up by hand in the same minute (the container's status is the proof).
 */
export function metaMediaSentBy(
  media: readonly MetaMedia[],
  sent: { at: string; caption: string | null },
): MetaMedia | null {
  const after = Date.parse(sent.at) - MIN_MS;
  const fitting = media.filter((item) => {
    const at = item.timestamp ? Date.parse(item.timestamp) : Number.NaN;
    if (!(at >= after)) return false;
    return sent.caption ? (item.caption ?? "").trim() === sent.caption.trim() : true;
  });
  return fitting.length === 1 ? (fitting[0] ?? null) : null;
}

/** What a refusal comes to for the owner (contracts ON_INSTAGRAM.refused): which sentence the sheet and the bell say. */
export type MetaPostRefusal = "limit" | "picture" | "token" | "busy" | "other";

/** The publishing errors that are the picture's (Meta's error codes page): its size, its format, its shape, its fetch. */
const PICTURE_SUBCODES: readonly number[] = [2207003, 2207004, 2207005, 2207009, 2207052, 36000, 36001, 36003, 36004];
/** Too many, too fast: Graph's throttles and the account's own (80002). Nothing was taken. */
const BUSY_CODES: readonly number[] = [4, 17, 32, 613, 80002];

/** Which sentence a refusal is, from Instagram's answer: its code and subcode, and the HTTP status. */
export function metaPostRefusalOf(answer: { status: number; json: unknown }): {
  refusal: MetaPostRefusal;
  code: number | null;
  subcode: number | null;
} {
  const error = instagramErrorOf(answer.json);
  const code = error?.code ?? null;
  const subcode = error?.subcode ?? null;
  const of = (refusal: MetaPostRefusal) => ({ refusal, code, subcode });
  if (subcode === 2207042) return of("limit");
  if (code === 190) return of("token");
  if (answer.status === 429 || (code !== null && BUSY_CODES.includes(code))) return of("busy");
  if (subcode !== null && PICTURE_SUBCODES.includes(subcode)) return of("picture");
  return of("other");
}
