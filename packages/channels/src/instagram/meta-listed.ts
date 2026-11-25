/**
 * What an account holds, asked through the Meta link: its own posts since a time, by id, a page at a time. The daily read
 * (the edge's content/posts-read.ts) holds them against the posts Chanlytics calls up there.
 *
 * Read against Meta's IG User Media reference on 24 November 2026 (v27.0). The list holds no story ("Story IG Media not
 * supported"), at most the 10,000 newest, and takes a time range (`since`, a Unix time). The page names neither its order
 * nor a page's size, so nothing here leans on either: a page says where the next begins (Graph's own `paging`), and the
 * reader decides what a list that stopped short covers. Built by a pure function and read by a pure parser, as every call
 * here is.
 */
import { SECOND_MS, recordOrEmpty, valueAt } from "@chanlytics/contracts";
import { metaNextPageOf, metaObject, metaText, type MetaNextPage } from "../meta/client";
import type { InstagramRequest } from "./graph";
import { readFrom, type MetaPoster } from "./meta-publish";

/** The most posts one page is asked for. */
const META_LISTED_PAGE = 100;

/** One page of the account's posts made since `since`: each post's id and its time, nothing else. */
export function metaMediaSinceRequest(
  poster: MetaPoster,
  at: { since: Date; next?: MetaNextPage | null },
): InstagramRequest {
  return readFrom(
    `${encodeURIComponent(poster.accountId)}/media`,
    {
      fields: "id,timestamp",
      limit: String(META_LISTED_PAGE),
      since: String(Math.floor(at.since.getTime() / SECOND_MS)),
      ...(at.next?.after ? { after: at.next.after } : {}),
      ...(at.next?.until ? { until: at.next.until } : {}),
    },
    poster,
  );
}

/** A post as a list names it: its id at the place, and when it was made where the place said. */
export interface MetaListedPost {
  id: string;
  atMs: number | null;
}

/** One page of a list: the posts it names, and where the next page begins (null: the list ended here). */
export interface MetaListedPage {
  posts: MetaListedPost[];
  next: MetaNextPage | null;
}

/** One page of the account's posts as Meta listed it; null where the answer is no list at all. */
export function parseMetaListedPage(json: unknown): MetaListedPage | null {
  const data = valueAt(metaObject(json), "data");
  if (!Array.isArray(data)) return null;
  const posts = data.flatMap((item): MetaListedPost[] => {
    const media = item && typeof item === "object" ? recordOrEmpty(item) : null;
    const id = metaText(valueAt(media, "id"));
    if (!/^\d{5,32}$/.test(id)) return [];
    const at = Date.parse(metaText(valueAt(media, "timestamp")));
    return [{ id, atMs: Number.isFinite(at) ? at : null }];
  });
  return { posts, next: metaNextPageOf(json) };
}
