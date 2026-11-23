/**
 * What Instagram says back about a post that is up (the content loop PRD's pass 2): its numbers, and a public answer to
 * a comment on it. The numbers are Meta's insights edge read with the Meta link's own token, proved on @chanlytics on
 * 21 and 22 November 2026 (the first-post sitting's answers 4.2, pass 1b's first test): reach, views, likes, comments,
 * saved and shares for a picture and a reel, each a running total since it went up (`period: lifetime`); a story's
 * reach, views and shares, which Meta keeps back while fewer than five people saw it ("(#10) Not enough viewers").
 *
 * Only what was proved for the kind is asked: Meta refuses the whole read when one metric does not fit the media, so an
 * unproved one would cost the proved ones. Every other number is `unsupported`, never a zero.
 */
import {
  POST_METRICS,
  recordOrEmpty,
  type InstagramPostKind,
  type MetricAvailability,
  type Observation,
  type PostMetric,
} from "@chanlytics/contracts";
import type { InstagramAnswer, InstagramRequest } from "./graph";
import { instagramErrorOf } from "./graph";
import { readFrom, writeTo, type MetaPoster } from "./meta-publish";

/** Our name for a number, by Meta's: Meta calls a save `saved`. */
const META_NAME: Readonly<Partial<Record<PostMetric, string>>> = {
  reach: "reach",
  views: "views",
  likes: "likes",
  comments: "comments",
  saves: "saved",
  shares: "shares",
};

/** The numbers each kind was proved to give through the Meta link (a story's under five viewers: none at all). */
const INSIGHTS_ASKED: Readonly<Record<InstagramPostKind, readonly PostMetric[]>> = {
  picture: ["reach", "views", "likes", "comments", "saves", "shares"],
  reel: ["reach", "views", "likes", "comments", "saves", "shares"],
  story: ["reach", "views", "shares"],
};

/** Meta's code for a story too few people saw: its numbers are kept back, not missing. */
const NOT_ENOUGH_VIEWERS = 10;

/** A post's numbers asked of Meta, only those the kind was proved to give. */
export function metaInsightsRequest(poster: MetaPoster, mediaId: string, kind: InstagramPostKind): InstagramRequest {
  const metric = INSIGHTS_ASKED[kind].map((name) => META_NAME[name] ?? name).join(",");
  return readFrom(`${encodeURIComponent(mediaId)}/insights`, { metric }, poster);
}

/** Each named number in an insights answer, by Meta's name: its first value, where it is a number. */
function insightValuesOf(json: InstagramAnswer["json"]): Map<string, number | null> {
  const values = new Map<string, number | null>();
  const data = json && Array.isArray(json.data) ? json.data : [];
  for (const item of data) {
    const row = recordOrEmpty(item);
    if (typeof row.name !== "string") continue;
    const first = recordOrEmpty(Array.isArray(row.values) ? row.values[0] : null);
    values.set(row.name, typeof first.value === "number" && Number.isFinite(first.value) ? first.value : null);
  }
  return values;
}

/** How the numbers that were asked stood, when Meta gave none: kept back for a small story, or a read that failed. */
function refusedAs(answer: Pick<InstagramAnswer, "outcome" | "json">): MetricAvailability {
  if (answer.outcome !== "refused") return "failed";
  return instagramErrorOf(answer.json)?.code === NOT_ENOUGH_VIEWERS ? "withheld" : "failed";
}

/** A read of a post's numbers, as one row for every number Chanlytics names: given, kept back, failed or not given. */
export function instagramObservationsOf(
  answer: Pick<InstagramAnswer, "outcome" | "json">,
  kind: InstagramPostKind,
): Observation[] {
  const metrics = INSIGHTS_ASKED[kind];
  const values = answer.outcome === "ok" ? insightValuesOf(answer.json) : null;
  const without = values ? null : refusedAs(answer);
  return POST_METRICS.map((metric): Observation => {
    if (!metrics.includes(metric)) return { metric, value: null, availability: "unsupported" };
    if (without) return { metric, value: null, availability: without };
    const value = values?.get(META_NAME[metric] ?? metric) ?? null;
    return value === null
      ? { metric, value: null, availability: "delayed" }
      : { metric, value, availability: "available" };
  });
}

/** A public answer to a comment, posted under it as the business (instagram_manage_comments). Its words in the body. */
export function metaCommentReplyRequest(poster: MetaPoster, commentId: string, words: string): InstagramRequest {
  return writeTo(`${encodeURIComponent(commentId)}/replies`, { message: words }, poster);
}
