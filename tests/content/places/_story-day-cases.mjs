/**
 * The story-day rule's cases, each with the answer it is owed, written by hand apart from either implementation. The
 * code's rule (contracts storyRanItsDay) and the database's (post_story_ended, 00716) are both held to this one table,
 * so neither can move without the other: a-story-s-day-is-one-rule.test.mjs runs the code on every change, and
 * a-story-s-day-is-one-rule.db.test.mjs runs the database, and the two against each other, on a real one.
 */

/** The moment every case is asked at: a fixed one, so the last moment of a day can be named exactly. */
export const ASKED_AT = "2026-11-10T23:00:00.000Z";

const HOUR = 3_600_000;
const before = (ms) => new Date(Date.parse(ASKED_AT) - ms).toISOString();

/** `{ name, post: { kind, published_at, scheduled_for }, ended }`: what the rule reads of a post, and what it answers. */
export const STORY_DAY_CASES = [
  {
    name: "a story one millisecond short of a day is up",
    post: { kind: "story", published_at: before(24 * HOUR - 1), scheduled_for: before(30 * HOUR) },
    ended: false,
  },
  {
    name: "a story exactly a day old has ended: the last moment of its day is its end",
    post: { kind: "story", published_at: before(24 * HOUR), scheduled_for: before(30 * HOUR) },
    ended: true,
  },
  {
    name: "a story over a day old has ended",
    post: { kind: "story", published_at: before(25 * HOUR), scheduled_for: before(25 * HOUR) },
    ended: true,
  },
  {
    name: "a story with no time it went up counts from the time it was set for: over a day ago, ended",
    post: { kind: "story", published_at: null, scheduled_for: before(24 * HOUR) },
    ended: true,
  },
  {
    name: "a story with no time it went up, set for under a day ago, is up",
    post: { kind: "story", published_at: null, scheduled_for: before(24 * HOUR - 1) },
    ended: false,
  },
  {
    name: "a story that went up late counts from when it went up, not from when it was set for",
    post: { kind: "story", published_at: before(HOUR), scheduled_for: before(48 * HOUR) },
    ended: false,
  },
  {
    name: "a picture has no day",
    post: { kind: "picture", published_at: before(30 * 24 * HOUR), scheduled_for: before(30 * 24 * HOUR) },
    ended: false,
  },
  {
    name: "a reel has no day",
    post: { kind: "reel", published_at: before(30 * 24 * HOUR), scheduled_for: before(30 * 24 * HOUR) },
    ended: false,
  },
];
