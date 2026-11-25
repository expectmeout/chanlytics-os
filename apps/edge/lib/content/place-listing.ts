/**
 * A place's own list of the posts an account holds, read a page at a time into one answer (the daily read's first step,
 * posts-read.ts). Each place hands in how one page is asked; this decides when the list is whole, and what a list that
 * stopped short covers. A page that fails makes the whole list say nothing: a failed read never says a post is gone.
 *
 * No place states the order of its list (Meta's and Google's references, read 24 November 2026). Each gives its newest
 * first when asked, and that is leaned on only to stop early, never to judge: a post the list does not name is asked
 * about by its own id before anything moves, so a list in another order costs calls and never a wrong answer.
 */
import { metaErrorOf } from "@chanlytics/channels/meta";
import type { SendOutcome } from "@chanlytics/channels/shared";

/** A post as a place's list names it: its id there, and when it was made where the place said. */
interface ListedPost {
  id: string;
  atMs: number | null;
}

/** One page as its place's wire read it; `short`: the list went on, and the place named no way to follow it. */
export type ListedPage<Next> =
  | { is: "page"; posts: readonly ListedPost[]; next: Next | null; short?: boolean }
  | { is: "refused" | "unknown"; said: string };

/**
 * What reading a place's list came to. `read`: every id it named, and how far back it reaches: `backToMs` null where it
 * is whole since the time asked, else the time of the oldest post it named before it stopped. `refused` and `unknown`
 * say nothing of any post; `said` is the place's own code for the log, never words.
 */
export type PlaceListing =
  | { is: "read"; ids: ReadonlySet<string>; backToMs: number | null; calls: number }
  | { is: "refused" | "unknown"; calls: number; said: string };

/** The most pages of a list one read takes: at a hundred a page, an account's newest thousand posts. */
export const LISTED_PAGES_MAX = 10;

/** A list that stopped before its end reaches back to the oldest post it named; one that named no time, to nothing. */
const reachOf = (oldestMs: number | null): number => oldestMs ?? Number.POSITIVE_INFINITY;

/**
 * The list since `sinceMs`, page after page until it ends, reaches back past the time asked, or has taken its pages.
 * No page is asked for after `deadline`: a read out of time says nothing, and tomorrow's asks again.
 */
export async function readListing<Next>(
  pageOf: (next: Next | null) => Promise<ListedPage<Next>>,
  sinceMs: number,
  deadline: number,
): Promise<PlaceListing> {
  const ids = new Set<string>();
  let oldestMs: number | null = null;
  let next: Next | null = null;
  for (let calls = 1; calls <= LISTED_PAGES_MAX; calls += 1) {
    if (Date.now() > deadline) return { is: "unknown", calls: calls - 1, said: "out_of_time" };
    const page = await pageOf(next);
    if (page.is !== "page") return { is: page.is, calls, said: page.said };
    for (const post of page.posts) {
      ids.add(post.id);
      if (post.atMs !== null && (oldestMs === null || post.atMs < oldestMs)) oldestMs = post.atMs;
    }
    if (page.short) return { is: "read", ids, backToMs: reachOf(oldestMs), calls };
    if (page.next === null || (oldestMs !== null && oldestMs < sinceMs))
      return { is: "read", ids, backToMs: null, calls };
    next = page.next;
  }
  return { is: "read", ids, backToMs: reachOf(oldestMs), calls: LISTED_PAGES_MAX };
}

/** What one call to Meta came to, as the Instagram and the Page wires both answer it. */
interface MetaAnswered {
  outcome: SendOutcome;
  status: number;
  json: unknown;
  error: string | null;
}

/** Graph's code and subcode of a refusal, for the log: "100/33", or the status where it gave none. Never its words. */
function metaSaid(answer: MetaAnswered): string {
  const error = metaErrorOf(answer.json);
  if (error?.code === null || error?.code === undefined) return answer.error ?? String(answer.status);
  return error.subcode === null ? String(error.code) : `${error.code}/${error.subcode}`;
}

/**
 * One page of a list Graph answered (an Instagram account's posts, a Page's), through the list's own parser. Graph says
 * "too many calls" as a refusal with its own code (4, 17, 32, 613, 80001, 80002): it is kept as one, and says nothing
 * of any post, as every refusal does.
 */
export function listedPageOfMeta<Next extends object>(
  answer: MetaAnswered,
  parse: (json: unknown) => { posts: readonly ListedPost[]; next: Next | null } | null,
): ListedPage<Next> {
  if (answer.outcome === "refused") return { is: "refused", said: metaSaid(answer) };
  if (answer.outcome !== "ok") return { is: "unknown", said: metaSaid(answer) };
  const page = parse(answer.json);
  if (!page) return { is: "unknown", said: "no_list" };
  // A next page that names neither a cursor nor a time: the list went on, and nothing here can follow it.
  const short = page.next !== null && Object.keys(page.next).length === 0;
  return { is: "page", posts: page.posts, next: short ? null : page.next, ...(short ? { short } : {}) };
}
