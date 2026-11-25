/**
 * What Take down's confirm says the press will do (00682; the journey canvas, cell 36), a line a post, read from where
 * each post stands (standing.ts): the same answer its line and its tile give, so the confirm never offers to take down
 * a story the piece says has ended. Apart from the take-down's records and words (take-down.ts), which a standing reads.
 */
import { POST_PLACE_SAID, type PostPlace } from "../posts";
import { placementStandingOf, standingIsOut, type StandingPost } from "./standing";
import { TAKE_DOWN_WORDS, placementSaid } from "./take-down";

/** One line of the confirm: a placement, or the ad that shows the piece, and what the press does to it. */
export interface TakeDownWill {
  key: string;
  glyph: "reel" | "story" | "post" | "google" | "ad";
  name: string;
  will: string;
}

/** Whether a place takes a delete from here: it does, it does not, or nobody has seen it do so yet (`unproved`). */
type PlaceTakesDown = (place: PostPlace) => "yes" | "no" | "unproved";

/** The order the piece lists its placements in: a reel, a post, a story, then Google. */
const downRankOf = (post: StandingPost): number =>
  post.place === "google" ? 3 : ["reel", "picture", "story"].indexOf(post.kind);

/** What the press does to one post, in words; null where it does nothing to it (it came down, stopped, or was let go). */
function downWordsOf(post: StandingPost, can: PlaceTakesDown, nowMs: number): string | null {
  const words = TAKE_DOWN_WORDS.will;
  const standing = placementStandingOf(post, null, nowMs);
  if (standing.is === "waiting" || (standing.is === "going_up" && !standing.sent)) return words.cancel;
  if (standing.is === "ended") return words.storyGone;
  if (!standingIsOut(standing)) return null;
  // Still being sent, or checked with its place: asked down as it lands.
  if (post.status !== "published") return words.takeDown;
  const takes = can(post.place);
  if (takes === "yes") return words.takeDown;
  const placeName = POST_PLACE_SAID[post.place];
  return takes === "no" ? words.byHand(placeName) : words.asks(placeName);
}

/**
 * What the confirm says the press will do, a line a placement (the canvas's cell 36): a post up is asked down where the
 * place takes that from here, is asked where that is not proved yet, or is the owner's to delete there; a story that
 * ran its day is gone already; one still waiting will not go up. A post the owner put up by hand is theirs, and is no
 * post of these.
 */
export function takeDownWillOf(posts: readonly StandingPost[], can: PlaceTakesDown, nowMs: number): TakeDownWill[] {
  return [...posts]
    .sort((a, b) => downRankOf(a) - downRankOf(b))
    .flatMap((post): TakeDownWill[] => {
      const will = downWordsOf(post, can, nowMs);
      if (will === null) return [];
      const glyph = post.place === "google" ? "google" : post.kind === "picture" ? "post" : post.kind;
      return [{ key: post.id, glyph, name: placementSaid(post.place, post.kind), will }];
    });
}
