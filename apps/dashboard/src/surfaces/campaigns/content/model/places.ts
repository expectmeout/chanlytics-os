/**
 * Where a made post stands, said once (Ruben, 12 Nov 2026: one status, where the canvas drew a chip per place, a row for a
 * post that waits and a greyed button, all saying one fact): the one sentence the open piece's status row says, and, for the
 * list that row and Post both open (post-both.tsx), each place with where the piece stands there, whether it can take a post
 * now, why not where the place itself is not ready, and the post Don't post would stop. Pure: the records, the clock and now
 * are handed in.
 */
import {
  POST_PLACES,
  POST_PULLABLE,
  STANDING_WORDS,
  contentMarkOf,
  contentMarkSaid,
  contentMarkToneOf,
  leadOf,
  pieceStandingOf,
  standingOnItsWay,
  type ContentMarkTone,
  type PlacementStands,
  type PostDto,
  type PostKind,
  type PostPlace,
} from "@chanlytics/contracts";
import { standsAtOf, type PieceStandsAt, type PieceTakes } from "./piece-open";
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

/** The post Don't post would stop, while it still can be. */
const pullOf = (post: PostDto): string | null => (POST_PULLABLE.includes(post.status) ? post.id : null);

/**
 * Where it stands, in one sentence, from the piece's one standing (contracts pieceStandingOf), what needs the owner first:
 * a post that stopped ("Didn't post", as its tile says it), then one going up now ("Posting to Instagram"), then one that
 * waits for its time ("Story goes up Sat, 9:00 AM"), else what its tile says (contracts contentMarkSaid: "Ready to post", "On
 * Instagram · Monday", "Story ended · Sunday"), so the open piece and its tile never say one fact two ways. A post that waits
 * at one place while another stopped is said, with its Don't post, in the list of places.
 */
export function pieceStatusOf(posts: readonly PostDto[], clock: ViewerClock, nowMs: number): PieceStatus {
  const { lead } = pieceStandingOf(posts, null, nowMs);
  const mark = contentMarkOf(posts, nowMs);
  const sentence = contentMarkSaid(mark, clock.day);
  if (lead.is === "going_up") return { tone: "going", said: sentence, pull: pullOf(lead.at.post) };
  // The tile says the day; the open piece says what goes up, and the hour: of the same post, the soonest, as the tile chose it.
  if (lead.is === "waiting")
    return {
      tone: "timed",
      said: STANDING_WORDS.waiting.status(lead.at.kind, clock.ahead(lead.when)),
      pull: pullOf(lead.at.post),
    };
  return { tone: contentMarkToneOf(mark), said: sentence, pull: null };
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
const waitingActsOf = (post: PostDto | null): Pick<PlaceWaitsToo, "pull" | "movable" | "making"> => ({
  pull: post && POST_PULLABLE.includes(post.status) ? post.id : null,
  movable: post?.status === "queued" ? post.id : null,
  making: post?.status === "preparing" && post.kind !== "story",
});

/** A post on its way beside the one that leads there, as its own line reads it. */
const waitsTooOf = (at: PlacementStands): PlaceWaitsToo => ({
  kind: at.kind,
  stands: at.standing.is === "waiting" ? { is: "timed", at: at.standing.at } : { is: "going" },
  ...waitingActsOf(at.post),
});

/** One place in the list: where the piece stands there, and what can be done there now. */
export interface PlaceStanding {
  place: PostPlace;
  stands: PieceStandsAt;
  /** A post can go there now. */
  takes: boolean;
  /** Why none can, where the place itself is not ready. */
  wont: string | null;
  /** The post that leads there, where it is on its way and Don't post would stop it, while it still can be. */
  pull: string | null;
  /** The post that stopped there, which Dismiss lets go: not tried again, and no longer waiting for the owner (00619). */
  letGo: string | null;
  /** What the post that leads there is (a picture, a story), where there is one. */
  kind: PostKind | null;
  /** The post set for its time there that Change time can move: one still queued, which no run has taken (00621). */
  movable: string | null;
  /** Instagram is making the post there ready, and holds its words (a picture's; a story has none). */
  making: boolean;
  /**
   * A post up there beside the one that leads, which waits, goes up or stopped (a story set for tomorrow over a post up since
   * Monday): said with its door beside the other, so neither hides the other. Null where the one that leads is up, or none is.
   */
  upToo: { at: string | null } | null;
  /** A post on its way there beside the one that leads (a story set for Sunday beside a post set for Saturday); null where none is. */
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
  const { placements } = pieceStandingOf(posts, null, nowMs);
  return POST_PLACES.map((place) => {
    // The place's placements (a post, a story), and the one that leads there: the row is its, as the piece's status is
    // the piece's lead's.
    const here = placements.filter((at) => at.place === place);
    const lead = leadOf(here);
    const stands = standsAtOf(lead);
    const last = lead.is === "never" ? null : lead.at;
    // Each post on its way there has its own line: the one that leads is the row's, and one beside it (of the other kind) its own.
    const beside = here.find((at) => standingOnItsWay(at.standing) && at !== last) ?? null;
    // A post still up there while another leads: under a newer one of its own placement, or of the other kind.
    const up = here.flatMap((at) => [at, ...(at.under ? [at.under] : [])]).find((at) => at.standing.is === "up");
    return {
      place,
      stands,
      takes: can.takes[place],
      wont: can.wont[place],
      ...waitingActsOf(last && standingOnItsWay(last.standing) ? last.post : null),
      letGo: last?.standing.is === "stopped" ? last.post.id : null,
      kind: last?.kind ?? null,
      upToo: stands.is !== "up" && up ? { at: up.post.published_at } : null,
      waitsToo: beside ? waitsTooOf(beside) : null,
    };
  }).filter((at) => can.offers[at.place] || at.stands.is !== "none" || at.upToo !== null || at.waitsToo !== null);
}
