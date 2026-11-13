/**
 * A post already set for its time, asked for at another (Ruben, 12 Nov 2026: "move Saturday's post to Sunday" had no road
 * through Ask, whose card could only set a second post and be refused as busy). Where a place asked already holds this post
 * waiting for its time, as what it is asked as, the card moves that post to the time named (00621 post_move, the page's own
 * Change time) in place of setting another there. Pure: the file's posts and now are handed in.
 */
import "server-only";
import {
  MIN_MS,
  POST_PLACE_SAID,
  type InstagramPostKind,
  type PostPlace,
  type PostPublish,
} from "@chanlytics/contracts";
import type { MemberPostRow } from "@chanlytics/db/files";

/** Later than this, a post waits for its time; sooner, it is going up now (00616 post_begin's own line). */
const WAITS_PAST_MS = 2 * MIN_MS;

/** What a move reads of a post. */
type PostSet = Pick<MemberPostRow, "id" | "place" | "kind" | "status" | "scheduled_for">;

/** The post of this kind waiting for its time at a place, where one is: still queued, or being made ready on Instagram. */
function setAt(posts: readonly PostSet[], place: PostPlace, as: InstagramPostKind, nowMs: number): PostSet | null {
  const kind = place === "instagram" ? as : "picture";
  return (
    posts.find(
      (p) =>
        p.place === place &&
        p.kind === kind &&
        (p.status === "queued" || p.status === "preparing") &&
        Date.parse(p.scheduled_for) - nowMs > WAITS_PAST_MS,
    ) ?? null
  );
}

/**
 * Which of the places asked are a move, where a time was named: the post waiting there goes to that time. None where no time
 * was named (the door says what it says of a second post now). One Instagram is already making ready keeps its time, as the
 * page's Change time says: refused in a sentence for the model.
 */
export function movesOf(
  posts: readonly PostSet[],
  request: { places: readonly PostPlace[]; as: InstagramPostKind; at: number | null },
  nowMs: number,
): { moves: PostPublish["moves"] } | { refused: string } {
  if (request.at === null) return { moves: [] };
  const moves: PostPublish["moves"] = [];
  for (const place of request.places) {
    const set = setAt(posts, place, request.as, nowMs);
    if (!set) continue;
    if (set.status !== "queued")
      return {
        refused: `${POST_PLACE_SAID[place]} is already making this post ready for its time, so its time can't change now. Say so`,
      };
    moves.push({ place, post_id: set.id });
  }
  return { moves };
}
