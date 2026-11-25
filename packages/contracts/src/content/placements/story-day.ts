/**
 * A story's day, said once (the content status review of 24 Nov 2026, C3): Instagram ends a story a day after it went up
 * and says nothing when it does, so its record says "published" for good and every reader has to know the day itself.
 * This is the one place it is written: how long, when a story ends, and whether it has. A leaf, so the page, the take-down,
 * the numbers' clock and the edge all read it and carry nothing else.
 *
 * The database keeps the same day in two functions (00699 post_observations_due, 00682 posts_take_down_start): a day, as
 * here.
 */
import { DAY_MS } from "../../shared/time";

/** How long a story stands at its place once it is up. */
export const STORY_DAY_MS = DAY_MS;

/** What the rule reads of a post: what it is, when it went up, and when it was set to. */
interface StoryRead {
  kind: string;
  published_at: string | null;
  scheduled_for: string;
}

/**
 * When a story ends by itself, as a moment; null for a post that is no story. A day after it went up; where no time it
 * went up is kept, a day after the time it was set for, so a story is never up for good for want of a date.
 */
export function storyEndsAt(post: StoryRead): number | null {
  if (post.kind !== "story") return null;
  return Date.parse(post.published_at ?? post.scheduled_for) + STORY_DAY_MS;
}

/** Whether a story that went up has run its day: at the last moment of its day it has. Never true of a post or a reel. */
export function storyRanItsDay(post: StoryRead, nowMs: number): boolean {
  const ends = storyEndsAt(post);
  return ends !== null && nowMs >= ends;
}
