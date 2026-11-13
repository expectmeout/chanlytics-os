/**
 * Where a made post stands, said once (Ruben, 12 Nov 2026: one status, where the canvas drew a chip per place, a row for a
 * post that waits and a greyed button, all saying one fact): the one sentence the open piece's status row says, and, for the
 * list that row and Post both open (post-both.tsx), each place with where the piece stands there, whether it can take a post
 * now, why not where the place itself is not ready, and the post Don't post would stop. Pure: the records, the clock and now
 * are handed in.
 */
import {
  CONTENT_WORDS,
  POST_ON_ITS_WAY,
  POST_PLACES,
  POST_PULLABLE,
  contentMarkOf,
  contentMarkSaid,
  contentMarkToneOf,
  newestAtEachPlace,
  postWaitsForItsTime,
  type ContentMarkTone,
  type PostDto,
  type PostKind,
  type PostPlace,
} from "@chanlytics/contracts";
import { pieceStandsAt, pieceTimedOf, type PieceNext, type PieceStandsAt, type PieceTakes } from "./piece-open";
import type { ViewerClock } from "./viewer-line";

/** Why a place can take no post at all, in words (not connected, posting not allowed); null where it can. */
export type PieceWont = Record<PostPlace, string | null>;

/**
 * Whether a place is offered to this workspace at all, as the piece's record says (GET files/[id]): Instagram only where the
 * Meta link is switched on for it (`instagram` is null where it is not); Google always, connected or not.
 */
export type PieceOffers = Record<PostPlace, boolean>;

/** The status row: its tone (the tile's own), its sentence, and the post Don't post would stop while it still can be. */
interface PieceStatus {
  tone: ContentMarkTone;
  said: string;
  pull: string | null;
}

/**
 * Where it stands, in one sentence, what needs the owner first as the one act that leads is chosen (pieceNextOf): a post that
 * stopped ("Didn't post · Try again", as its tile says it), then one going up now ("Posting to Instagram"), then one that
 * waits for its time ("Story goes up Sat, 9:00 AM"), else what its tile says (contracts contentMarkSaid: "Ready to post", "On
 * Instagram · Monday"), so the open piece and its tile never say one fact two ways. A post that waits at one place while
 * another stopped is said, with its Don't post, in the list of places.
 */
export function pieceStatusOf(
  posts: readonly PostDto[],
  next: PieceNext,
  clock: ViewerClock,
  nowMs: number,
): PieceStatus {
  // The tile's own words for a post going up (contracts CONTENT_WORDS.mark), at the place the next step names.
  if (next.is === "going") return { tone: "going", said: CONTENT_WORDS.mark.going(next.place), pull: next.pull };
  const mark = contentMarkOf(posts, nowMs);
  // The tile says the day; the open piece says what goes up, and the hour: of the same post, the soonest, as the tile chose it.
  const timed =
    mark.is === "timed"
      ? (posts.find((p) => p.place === mark.place && p.scheduled_for === mark.at) ?? pieceTimedOf(posts, nowMs))
      : null;
  if (timed)
    return {
      tone: "timed",
      said: CONTENT_WORDS.piece.step.timed(CONTENT_WORDS.viewer.kinds[timed.kind], clock.ahead(timed.scheduled_for)),
      pull: POST_PULLABLE.includes(timed.status) ? timed.id : null,
    };
  return { tone: contentMarkToneOf(mark), said: contentMarkSaid(mark, clock.day), pull: null };
}

/**
 * A post on its way at a place beside the newest one there (00620: on Instagram a picture post and a story wait apart): what it
 * is, when it goes, and its own Don't post and Change time.
 */
export interface PlaceWaitsToo {
  kind: PostKind;
  stands: Extract<PieceStandsAt, { is: "going" | "timed" }>;
  pull: string | null;
  movable: string | null;
  making: boolean;
}

/** What can be done to a post on its way: stopped while it still can be, moved while no run has taken it, its words held. */
const waitOf = (post: PostDto | null): Pick<PlaceWaitsToo, "pull" | "movable" | "making"> => ({
  pull: post && POST_PULLABLE.includes(post.status) ? post.id : null,
  movable: post?.status === "queued" ? post.id : null,
  making: post?.status === "preparing" && post.kind !== "story",
});

/** A post on its way beside the newest there, as its own line reads it. */
const waitsTooOf = (post: PostDto, nowMs: number): PlaceWaitsToo => ({
  kind: post.kind,
  stands: postWaitsForItsTime(post, nowMs) ? { is: "timed", at: post.scheduled_for } : { is: "going" },
  ...waitOf(post),
});

/** One place in the list: where the piece stands there, and what can be done there now. */
export interface PlaceStanding {
  place: PostPlace;
  stands: PieceStandsAt;
  /** A post can go there now. */
  takes: boolean;
  /** Why none can, where the place itself is not ready. */
  wont: string | null;
  /** The newest post there, where it is on its way and Don't post would stop it, while it still can be. */
  pull: string | null;
  /** The post that stopped there, which Dismiss lets go: not tried again, and no longer waiting for the owner (00619). */
  letGo: string | null;
  /** What the newest post there is (a picture, a story), where there is one. */
  kind: PostKind | null;
  /** The post set for its time there that Change time can move: one still queued, which no run has taken (00621). */
  movable: string | null;
  /** Instagram is making the post there ready, and holds its words (a picture's; a story has none). */
  making: boolean;
  /**
   * A post up there before the newest, which waits, goes up or stopped (a story set for tomorrow over a post up since Monday):
   * said with its door beside the newer one, so neither hides the other. Null where the newest is the one up, or none is.
   */
  upToo: { at: string | null } | null;
  /** A post on its way there beside the newest (a story set for Sunday beside a post set for Saturday); null where none is. */
  waitsToo: PlaceWaitsToo | null;
}

/**
 * The places a post can go, in their order, each with where the piece stands there and what it can take now. A place this
 * workspace is not offered is left out, unless the piece already stands somewhere there (a post that went up while it was):
 * a row saying "Not yet" of a place that cannot be connected from here would be a promise nobody can keep.
 */
export function placesOf(
  posts: readonly PostDto[],
  can: { takes: PieceTakes; wont: PieceWont; offers: PieceOffers },
  nowMs: number,
): PlaceStanding[] {
  const newest = newestAtEachPlace(posts);
  // The one rule for the newest at a place, read over the posts that are up: the post up under a newer one.
  const newestUp = newestAtEachPlace(posts.filter((p) => p.status === "published"));
  return POST_PLACES.map((place) => {
    const last = newest.find((p) => p.place === place);
    // Each post on its way there has its own line: the newest is the row's, and one beside it (of the other kind) its own.
    const onItsWay = posts.filter((p) => p.place === place && POST_ON_ITS_WAY.includes(p.status));
    const beside = onItsWay.find((p) => p.id !== last?.id) ?? null;
    const stands = pieceStandsAt(posts, place, nowMs);
    const up = stands.is === "up" ? null : newestUp.find((p) => p.place === place);
    return {
      place,
      stands,
      takes: can.takes[place],
      wont: can.wont[place],
      ...waitOf(onItsWay.find((p) => p.id === last?.id) ?? null),
      letGo: last && (last.status === "held" || last.status === "failed") ? last.id : null,
      kind: last?.kind ?? null,
      upToo: up ? { at: up.published_at } : null,
      waitsToo: beside ? waitsTooOf(beside, nowMs) : null,
    };
  }).filter((at) => can.offers[at.place] || at.stands.is !== "none" || at.upToo !== null || at.waitsToo !== null);
}
