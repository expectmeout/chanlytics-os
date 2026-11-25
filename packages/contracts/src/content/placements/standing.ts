/**
 * Where a piece stands, said once (the content status review of 24 Nov 2026, C1 and C2). "Is this post up right now?" was
 * worked out by the list's tile, the open piece's status, its button, its list of places, the Take down offer, the Week,
 * Today and the counts, each for itself, and they disagreed. Here is the one answer every one of them reads:
 *
 * - a post's standing at its place (placementStandingOf), from the post, its piece's take-down and the time;
 * - a piece's placements, where a placement is a place and a kind (an Instagram post and an Instagram story are two), each
 *   with the post that speaks for it, and the one that leads the piece (pieceStandingOf).
 *
 * Pure: nothing is read, and no word is said here. A reader turns a standing into its own words and presses.
 */
import { MIN_MS } from "../../shared/time";
import {
  POST_PLACES,
  postStoppedWhyOf,
  postWaitsForItsTime,
  type PostDto,
  type PostKind,
  type PostPlace,
} from "../posts";
import { storyEndsAt, storyRanItsDay } from "./story-day";
import { postCameDownAt, type PieceTakeDownDto } from "./take-down";

/**
 * How long a post its place took may still be on its way to being seen there: the account is asked two minutes after
 * the send (00681 post_moved), and again a few times where it gives no answer. Past it, nobody can say it went up.
 */
const POST_SEEN_WAIT_MS = 10 * MIN_MS;

/** Where one post stands at its place. */
export type PlacementStanding =
  /** Set for its time, which has not come: when it goes. */
  | { is: "waiting"; at: string }
  /** Going up now. `sent` once its place was asked to post it: from then a take-down reaches it. */
  | { is: "going_up"; sent: boolean }
  /** Sent with no answer: its place is being asked what it has. */
  | { is: "checking" }
  /** Its place took it and was never seen holding it, past the time that takes: since when. */
  | { is: "unconfirmed"; since: string | null }
  /** Up at its place: when it went up, where that is kept. */
  | { is: "up"; at: string | null }
  /** A story that ran its day and ended by itself: when it ended. */
  | { is: "ended"; at: string }
  /** It came down, taken down from here or removed at its place: when, where its take-down kept that. */
  | { is: "came_down"; at: string | null }
  /** Held before its send, or refused by its place: it waits for its owner, with why where that was said. */
  | { is: "stopped"; why: string | null }
  /** Let go before it went: by its owner, or (`late`) because its day passed. */
  | { is: "let_go"; late: boolean };

/** What a standing reads of a post. */
export type StandingPost = Pick<
  PostDto,
  | "id"
  | "place"
  | "kind"
  | "status"
  | "scheduled_for"
  | "published_at"
  | "verified_at"
  | "held_reason"
  | "held_why"
  | "error"
>;

/** A post its place holds, or took: up, or sent and not yet seen there. */
function upStandingOf(post: StandingPost, nowMs: number): PlacementStanding {
  const ends = storyEndsAt(post);
  if (ends !== null && storyRanItsDay(post, nowMs)) return { is: "ended", at: new Date(ends).toISOString() };
  // Google says a post is up as it takes it. Instagram's, and a Page's, is up only once the account was read holding
  // it, and until then it is still going up: no word between the two (the content loop PRD's 8.2).
  if (post.place === "google" || post.verified_at) return { is: "up", at: post.published_at };
  const sentMs = Date.parse(post.published_at ?? post.scheduled_for);
  return nowMs - sentMs < POST_SEEN_WAIT_MS
    ? { is: "going_up", sent: true }
    : { is: "unconfirmed", since: post.published_at };
}

/**
 * Where a post stands at its place, from the post, its piece's newest take-down (null where there is none, or it was not
 * read) and the time. The one reading of it.
 */
export function placementStandingOf(
  post: StandingPost,
  takeDown: PieceTakeDownDto | null,
  nowMs: number,
): PlacementStanding {
  // Down is down, whatever a take-down still says: found gone at its place while one waited on its owner or the place.
  if (post.status === "taken_down") return { is: "came_down", at: postCameDownAt(post, takeDown) };
  if (post.status === "pulled") return { is: "let_go", late: post.held_why === "late" };
  if (post.status === "held" || post.status === "failed") return { is: "stopped", why: postStoppedWhyOf(post) };
  if (post.status === "published") return upStandingOf(post, nowMs);
  if (postWaitsForItsTime(post, nowMs)) return { is: "waiting", at: post.scheduled_for };
  if (post.status === "checking") return { is: "checking" };
  return { is: "going_up", sent: post.status === "publishing" };
}

/**
 * Whether a post is out, as a take-down asks it: at its place, or past holding on its way there. A story that ran its
 * day is gone already, and one still waiting was never sent.
 */
export const standingIsOut = (standing: PlacementStanding): boolean =>
  standing.is === "up" ||
  standing.is === "unconfirmed" ||
  standing.is === "checking" ||
  (standing.is === "going_up" && standing.sent);

/** Whether a post is on its way: set for its time, going up, or being checked with its place. */
export const standingOnItsWay = (standing: PlacementStanding): boolean =>
  standing.is === "waiting" || standing.is === "going_up" || standing.is === "checking";

/** A post with where it stands. */
export interface PostStands {
  post: PostDto;
  standing: PlacementStanding;
}

/** One placement of a piece: a place and a kind, the post that speaks for it, and where that post stands. */
export interface PlacementStands extends PostStands {
  place: PostPlace;
  kind: PostKind;
  /**
   * A post still up there under the one that speaks: under a newer one that waits, goes up, stopped, or was never
   * confirmed (a story set for tomorrow over one up since Monday), so neither hides the other. Null where the one that
   * speaks is the one up, or none is.
   */
  under: PostStands | null;
}

/**
 * The one thing a piece says of itself, what needs its owner first, then what moves, then what waits, then what is up,
 * then what last happened: the order its tile, its status, its button and its rows all lead with.
 */
export type PieceLead =
  /** A post held or refused, the newest of its placement. */
  | { is: "stopped"; at: PlacementStands }
  /** A post its place took and was never seen holding. */
  | { is: "unconfirmed"; at: PlacementStands }
  /** A post going up now, or being checked with its place. */
  | { is: "going_up"; at: PlacementStands }
  /** A post set for its time: the soonest, and when. */
  | { is: "waiting"; at: PlacementStands; when: string }
  /** Up: every placement that is, and when the newest of them went up. */
  | { is: "up"; at: PlacementStands; all: PlacementStands[]; when: string | null }
  /** Nothing of it is up any more: what last happened (a story ran its day, a post came down), and when. */
  | { is: "ended"; at: PlacementStands; when: string | null }
  | { is: "came_down"; at: PlacementStands; when: string | null }
  /** It never went out. `late`: a post of it that was let go because its day passed. */
  | { is: "never"; late: PlacementStands | null };

/** A piece's standing: its placements that have something to say, in the one order a piece lists them, and what leads. */
interface PieceStanding {
  placements: PlacementStands[];
  lead: PieceLead;
}

const standsAs =
  (...names: PlacementStanding["is"][]) =>
  (at: { standing: PlacementStanding }): boolean =>
    names.includes(at.standing.is);

/**
 * A placement from its posts, newest first, or null where none of them says anything (its owner let each go: the place
 * is free again). Who speaks: a stop only while it is the newest there (sent again, it is old news); else the post on
 * its way; else the post that is there, up or never confirmed; else what last happened. So a post that is still up is
 * never lost under a newer one that came down, and a story that ended never hides the post beside it.
 */
function placementOf(theirs: readonly PostStands[]): Pick<PlacementStands, "post" | "standing" | "under"> | null {
  const [newest] = theirs;
  const stop = newest && standsAs("stopped")(newest) ? newest : undefined;
  const moving = theirs.find((at) => standingOnItsWay(at.standing));
  const there = theirs.find(standsAs("up", "unconfirmed"));
  const past = theirs.find(
    (at) => standsAs("ended", "came_down")(at) || (at.standing.is === "let_go" && at.standing.late),
  );
  const speaks = stop ?? moving ?? there ?? past;
  if (!speaks) return null;
  const up = theirs.find(standsAs("up"));
  return { ...speaks, under: up && up !== speaks ? up : null };
}

/** When a placement's last news happened, as a moment: a time not kept counts as the latest, since it is the one unknown. */
const pastAtMs = (at: PlacementStands): number => {
  const when = at.standing.is === "ended" || at.standing.is === "came_down" ? at.standing.at : null;
  return when ? Date.parse(when) : Number.POSITIVE_INFINITY;
};

/** What leads among placements (PieceLead's order). The one choice a piece's tile and its open status both make. */
export function leadOf(placements: readonly PlacementStands[]): PieceLead {
  const [stopped] = placements.filter(standsAs("stopped"));
  if (stopped) return { is: "stopped", at: stopped };
  const [unconfirmed] = placements.filter(standsAs("unconfirmed"));
  if (unconfirmed) return { is: "unconfirmed", at: unconfirmed };
  const [going] = placements.filter(standsAs("going_up", "checking"));
  if (going) return { is: "going_up", at: going };
  const [soonest] = placements
    .flatMap((at) => (at.standing.is === "waiting" ? [{ at, when: at.standing.at }] : []))
    .sort((a, b) => a.when.localeCompare(b.when));
  if (soonest) return { is: "waiting", ...soonest };
  const up = placements.filter(standsAs("up"));
  const [first] = up;
  if (first) {
    const times = up.flatMap((at) => (at.standing.is === "up" && at.standing.at ? [at.standing.at] : [])).sort();
    return { is: "up", at: first, all: up, when: times.at(-1) ?? null };
  }
  const [last] = placements.filter(standsAs("ended", "came_down")).sort((a, b) => pastAtMs(b) - pastAtMs(a));
  if (last?.standing.is === "ended") return { is: "ended", at: last, when: last.standing.at };
  if (last?.standing.is === "came_down") return { is: "came_down", at: last, when: last.standing.at };
  return { is: "never", late: placements.find(standsAs("let_go")) ?? null };
}

/** The order a place's kinds are listed in: a reel, a post, then a story. */
const KIND_ORDER: readonly PostKind[] = ["reel", "picture", "story"];

/**
 * A piece's standing, from its posts at every place, its newest take-down (null where there is none, or a reader holds
 * none: a tile reads its posts alone) and the time. Its placements come in the one order a piece lists them: each place
 * in its order, a reel, a post, then a story.
 */
export function pieceStandingOf(
  posts: readonly PostDto[],
  takeDown: PieceTakeDownDto | null,
  nowMs: number,
): PieceStanding {
  const read = [...posts]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((post) => ({ post, standing: placementStandingOf(post, takeDown, nowMs) }));
  const placements = POST_PLACES.flatMap((place) =>
    KIND_ORDER.flatMap((kind): PlacementStands[] => {
      const speaks = placementOf(read.filter((at) => at.post.place === place && at.post.kind === kind));
      return speaks ? [{ place, kind, ...speaks }] : [];
    }),
  );
  return { placements, lead: leadOf(placements) };
}

/** Whether a placement holds its place: the post that speaks is out, or one is still up under it. */
export const placementIsOut = (at: PlacementStands): boolean => standingIsOut(at.standing) || at.under !== null;

/**
 * Whether a made video has no road from here: Instagram takes no reel from this workspace now (`reels`), and no post of
 * it is there. It is saved, and posted from the phone. Where Instagram takes a reel, a video is posted as a picture is,
 * and its tile and its open piece both say so.
 */
export const videoIsSavedOnly = (
  file: { kind: string },
  posts: readonly Pick<PostDto, "place">[],
  reels: boolean,
): boolean => file.kind === "video" && !reels && !posts.some((post) => post.place === "instagram");
