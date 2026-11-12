/**
 * Content's address (`campaigns/content`), a view of Campaigns beside Sequences, Messages and Ads: everything Ask made for the
 * business and where each piece stands, in every workspace (decision 0125). And the switch that offers Connect Meta.
 *
 * A module of its own and small: the frame's route chunk reads the address, so nothing of the page (its words, its marks) may
 * ride in here. Those are page.ts's.
 */
import { isUuid } from "../shared/identity";
import { isOneOf, recordOrNull } from "../shared/unknown";

/** The route the Content view is spelled as. */
export const CONTENT_ROUTE = "campaigns/content";

/** Whether a param of `campaigns` is the Content view's: `content`, or `content:` and more. A word it does not know is the page. */
export const isContentParam = (param: string | null | undefined): boolean => !!param && /^content(:|$)/.test(param);

/** Made's views: all of it, what needs the owner, what is being made, what waits for its time, what is out. */
export const CONTENT_VIEWS = ["all", "needs", "making", "scheduled", "posted"] as const;
export type ContentView = (typeof CONTENT_VIEWS)[number];

/** Content's two lists: what Ask made, and what it makes them from (the library, once Settings › Files). */
export type ContentList = "made" | "library";

/** Where Content stands: which list, the view of Made, and the piece that is open, by its file. */
export interface ContentPlace {
  list: ContentList;
  view: ContentView;
  open: string | null;
}

/** The library's address: Content's second list, where Settings › Files now lands. */
export const CONTENT_LIBRARY_ROUTE = "campaigns/content:library";

/**
 * A param of `campaigns` read as Content's place: `content`, then any of `library`, a view of Made, a file's id, in any order.
 * Null for another view's. A word it does not know is the page as it opens.
 */
export function contentPlaceOf(param: string | null | undefined): ContentPlace | null {
  if (!param || !isContentParam(param)) return null;
  const place: ContentPlace = { list: "made", view: "all", open: null };
  for (const part of param.split(":").slice(1)) {
    if (isUuid(part)) place.open = part;
    else if (part === "library") place.list = "library";
    else if (isOneOf(CONTENT_VIEWS, part)) place.view = part;
  }
  return place;
}

/** A place, as its address. A view is Made's alone: the library says none. */
export const contentRouteOf = (place: ContentPlace): string =>
  [
    CONTENT_ROUTE,
    place.list === "library" ? "library" : null,
    place.list === "made" && place.view !== "all" ? place.view : null,
    place.open,
  ]
    .filter((part) => !!part)
    .join(":");

/**
 * Whether a workspace's config offers Connect Meta (`features.content_preview`, the flag registry's `content_preview`;
 * decision 0117), and so posting to Instagram. Read off the config as stored, so anything but `true` is off. The one reader of
 * the switch: the edge and the dashboard both ask it. The Content view is every workspace's and reads no switch (decision 0125).
 */
export function contentPreviewOf(config: unknown): boolean {
  const features = recordOrNull(recordOrNull(config)?.features);
  return features?.content_preview === true;
}
