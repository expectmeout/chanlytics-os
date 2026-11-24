/**
 * What a business's own posts have shown, and how sure that is (the content loop PRD's 9.4; call 17): a cohort of
 * comparable posts against the rest, by one thing about them at a time, at one of three levels. Below 12 comparable
 * posts on either side it is too little to say anything; from 12 to 30 it is an early sign, tried once and said as a
 * try; past 30, with the difference holding in both halves of the window, it is a pattern, and the plan's weights move.
 * Paid reach is kept apart from organic, and a difference that came with a change in a second thing at once is credited
 * to neither. core's `contentPatternsOf` works them out; the plan and AI read them.
 */
import type { PlanPlace } from "./sets";
import type { PostKind } from "../posts";

/** How sure a difference is: too few posts, an early sign, a pattern. */
export type PatternLevel = "too_little" | "early" | "pattern";

/**
 * The one thing about a post a cohort is told apart by: the hour it went up, a weekday or the weekend, a clip's length,
 * what its footage shows. A post's opening seconds (the PRD's "hook") are not read by anything yet, so they are not here.
 */
export const PATTERN_DIMENSIONS = ["hour", "day", "length", "shows"] as const;
export type PatternDimension = (typeof PATTERN_DIMENSIONS)[number];

/** Comparable posts on each side, at least, for an early sign (call 17). */
export const PATTERN_EARLY_AT = 12;
/** Comparable posts on each side, more than this, for a pattern (call 17). */
export const PATTERN_AT = 30;
/** How far back posts are compared (PRD 9.4). */
export const PATTERN_DAYS = 90;

/** A post as it is compared: where and what it went up as, when, from what, and what it reached at seven days. */
export interface PostOutcome {
  postId: string;
  place: PlanPlace;
  kind: PostKind;
  /** When it went up. */
  at: string;
  /** A clip's length; null for a picture. */
  seconds: number | null;
  /** What its footage shows, in the look's own words. */
  shows: readonly string[];
  /** Whether any of its numbers came while it also ran as an ad: then it is never compared with organic posts. */
  paid: boolean;
  /** Its reach as the place counted it seven days after it went up; null where none was given. */
  reach: number | null;
}

/** One difference a business's posts showed: a cohort against the rest of its place and kind. */
export interface ContentPattern {
  place: PlanPlace;
  kind: PostKind;
  dimension: PatternDimension;
  /** The cohort that did better: `evening`, `weekend`, `short`, or what the footage shows. */
  better: string;
  /** Comparable posts in the cohort, and in the rest. */
  n: { better: number; rest: number };
  /** How many times the rest's middle reach the cohort's middle reach was, to two places. */
  lift: number;
  level: PatternLevel;
  /** The other thing that changed with it, where one did: then it is credited to neither, whatever its level. */
  movedWith: PatternDimension | null;
  /** The sentence it is said in: "Evening reels reached 1.6 times more than your other reels (14 and 20 reels)". */
  says: string;
}
