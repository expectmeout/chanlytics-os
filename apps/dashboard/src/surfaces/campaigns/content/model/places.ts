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
  type ContentMarkTone,
  type PostDto,
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
  const mark = contentMarkOf(posts);
  const timed = mark.is === "stuck" ? null : pieceTimedOf(posts, nowMs);
  if (timed)
    return {
      tone: "going",
      said: CONTENT_WORDS.piece.step.timed(CONTENT_WORDS.viewer.kinds[timed.kind], clock.ahead(timed.scheduled_for)),
      pull: POST_PULLABLE.includes(timed.status) ? timed.id : null,
    };
  return { tone: contentMarkToneOf(mark), said: contentMarkSaid(mark, clock.day), pull: null };
}

/** One place in the list: where the piece stands there, and what can be done there now. */
export interface PlaceStanding {
  place: PostPlace;
  stands: PieceStandsAt;
  /** A post can go there now. */
  takes: boolean;
  /** Why none can, where the place itself is not ready. */
  wont: string | null;
  /** The post on its way there that Don't post would stop, while it still can be. */
  pull: string | null;
  /** The post that stopped there, which Don't post lets go: not tried again, and no longer waiting for the owner (00619). */
  letGo: string | null;
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
  return POST_PLACES.map((place) => {
    const last = newest.find((p) => p.place === place);
    const waiting = posts.find(
      (p) => p.place === place && POST_ON_ITS_WAY.includes(p.status) && POST_PULLABLE.includes(p.status),
    );
    return {
      place,
      stands: pieceStandsAt(posts, place, nowMs),
      takes: can.takes[place],
      wont: can.wont[place],
      pull: waiting?.id ?? null,
      letGo: last && (last.status === "held" || last.status === "failed") ? last.id : null,
    };
  }).filter((at) => can.offers[at.place] || at.stands.is !== "none");
}
