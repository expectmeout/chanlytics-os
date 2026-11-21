/**
 * Meta's own preview of an ad not yet made (the Ads plan's 4.6, "The ad as Meta draws it", and section 10): the ad
 * account's `generatepreviews`, handed the creative Turn on makes for one version (meta-make.ts metaCreativeSpec, every
 * one of Meta's own changes switched off) and one place it shows, answers a frame of Meta's own drawing of it.
 *
 * A read. It makes nothing at Meta, leaves no post on the Page and spends nothing: the picture is given by its address,
 * which Meta fetches to draw it, so nothing is placed in the account's library either. It costs one read of the
 * account's allowance, as every read does (meta-call.ts).
 *
 * What Meta's pages say (read 21 November 2026, `marketing-api/generatepreview`, `.../ad-account/generatepreviews` and
 * the ad preview object): a user's sign-in, not a Page's; one place a call, named by `ad_format`; the answer is a list
 * of previews, each one field, `body`, the HTML of a frame on facebook.com, which "is only valid for 24 hours". Nothing
 * of that HTML is ever drawn as it came: its frame's address is read out of it, held to Meta's own preview page, and the
 * page draws a frame of its own at that address.
 */
import { metaErrorOf, metaGraphUrl, metaObject, metaProofQuery, metaText } from "../meta/client";
import type { MetaRequest } from "../meta/client";
import { valueAt } from "@chanlytics/contracts";
import { metaAccountPath } from "./meta-account";
import { metaCreativeSpec } from "./meta-make";

/** Where an ad made here shows, as New ad names each: Facebook's feed, stories and Reels (meta-make.ts). */
export type MetaPreviewPlace = "feed" | "story" | "reel";

/** The places, in the order New ad offers them. */
export const META_PREVIEW_PLACES: readonly MetaPreviewPlace[] = ["feed", "story", "reel"];

/** Each place as Meta names its preview: on a phone, where most people see an ad. */
const FORMAT: Record<MetaPreviewPlace, string> = {
  feed: "MOBILE_FEED_STANDARD",
  story: "FACEBOOK_STORY_MOBILE",
  reel: "FACEBOOK_REELS_MOBILE",
};

/** One version in one place: what Turn on would make of it, with its picture given by its address. */
export interface MetaPreviewAsk {
  accountId: string;
  pageId: string;
  text: string;
  headline: string;
  /** The picture's address over https, which Meta fetches to draw it. */
  pictureUrl: string;
  place: MetaPreviewPlace;
}

/** The preview of one version in one place: a read of the ad account, with the token and its proof. */
export function metaPreviewRequest(token: string, appSecret: string, ask: MetaPreviewAsk): MetaRequest {
  const creative = metaCreativeSpec({
    name: "Chanlytics preview",
    pageId: ask.pageId,
    // The ad shows on Facebook alone, as Turn on makes it: no Instagram account of the Page's is named.
    instagramUserId: null,
    text: ask.text,
    headline: ask.headline,
    picture: { kind: "link", url: ask.pictureUrl },
  });
  return {
    url: metaGraphUrl(`${metaAccountPath(ask.accountId)}/generatepreviews`, {
      ad_format: FORMAT[ask.place],
      creative: JSON.stringify(creative),
      ...metaProofQuery(token, appSecret),
    }),
    method: "GET",
  };
}

/** Meta's frame: the address of its own preview page, and the size Meta drew it at, where it said one. */
export interface MetaPreviewFrame {
  src: string;
  width: number | null;
  height: number | null;
}

/** Meta's own preview page, the one address a frame may open. */
const FRAME_ORIGIN = "https://www.facebook.com";
const FRAME_PATH = "/ads/api/preview_iframe.php";

/** The characters HTML escapes inside an attribute, read back. */
const ENTITIES: Record<string, string> = { amp: "&", quot: '"', "#039": "'", "#39": "'", lt: "<", gt: ">" };
const unescaped = (value: string): string =>
  value.replace(/&(amp|quot|#039|#39|lt|gt);/g, (_, name: string) => ENTITIES[name] ?? "");

/** An attribute of the frame's tag, read as it came. */
const attributeOf = (html: string, name: string): string | null =>
  new RegExp(`\\s${name}="([^"]*)"`, "i").exec(html)?.[1] ?? null;

/** A size Meta wrote on its frame, in pixels; null where it wrote none that is one. */
function frameSizeOf(html: string, name: "width" | "height"): number | null {
  const pixels = Number(attributeOf(html, name));
  return Number.isInteger(pixels) && pixels >= 50 && pixels <= 4000 ? pixels : null;
}

/** The frame's address, held to Meta's own preview page over https; null for anything else. */
export function metaPreviewFrameSrc(src: string): string | null {
  const url = URL.canParse(src) ? new URL(src) : null;
  if (!url || url.origin !== FRAME_ORIGIN || url.pathname !== FRAME_PATH || !url.searchParams.has("d")) return null;
  return url.toString();
}

/**
 * Meta's answer, read: the frame of its first preview. Throws, with Meta's words where it gave some, where the answer
 * holds no preview, or a frame whose address is not Meta's own preview page.
 */
export function parseMetaPreview(json: unknown): MetaPreviewFrame {
  const rows: unknown = valueAt(metaObject(json), "data");
  const first: unknown = Array.isArray(rows) ? rows[0] : null;
  const html = metaText(valueAt(metaObject(first), "body"));
  if (!html) throw new Error(metaErrorOf(json)?.message ?? "Meta did not answer a preview");
  const written = attributeOf(html, "src");
  const src = written === null ? null : metaPreviewFrameSrc(unescaped(written));
  if (!src) throw new Error("Meta's preview is not a frame of its own preview page");
  return { src, width: frameSizeOf(html, "width"), height: frameSizeOf(html, "height") };
}
