/**
 * The closed sets pass 2's records hold (the content loop PRD's 5.3, 5.4 and Appendix A): what a place's number names,
 * how it stood when it was read, when a post is read, what a person's touch was and what it was of, what a booking is
 * put down to, where a post's link lands, and where a public answer to a comment stands. A leaf: the schema's pins
 * (shared/schema-sets.ts) read them here, so holding a set to the database draws no module of words or rules in.
 */

/** A post's numbers as a place reports them (post_observations.metric). Each is a running total since it went up. */
export const POST_METRICS = [
  "reach",
  "views",
  "likes",
  "comments",
  "saves",
  "shares",
  "link_opens",
  "profile_visits",
  "follows",
] as const;
export type PostMetric = (typeof POST_METRICS)[number];

/**
 * How a number stood when it was read: there; a number the place does not give for this kind; not there yet; a read
 * that failed; or one the place keeps back because too few people saw the post (Meta's "(#10) Not enough viewers" for a
 * story under five). Only `available` carries a value: a missing number is never zero.
 */
export const METRIC_AVAILABILITY = ["available", "unsupported", "delayed", "failed", "withheld"] as const;
export type MetricAvailability = (typeof METRIC_AVAILABILITY)[number];

/** When the clock reads a post's numbers after it went up (PRD 9.1): an hour, a day, 3, 7 and 28 days. */
export const TIMED_OBSERVE_STEPS = ["1h", "1d", "3d", "7d", "28d"] as const;
export type TimedObserveStep = (typeof TIMED_OBSERVE_STEPS)[number];

/**
 * Every step a read is kept at (post_observations.step): the clock's, and `last`, read just before a take-down asks the
 * place (PRD 8.3). A post's numbers end with the post, so what is not read then never can be.
 */
export const OBSERVE_STEPS = [...TIMED_OBSERVE_STEPS, "last"] as const;
export type ObserveStep = (typeof OBSERVE_STEPS)[number];

/** What a known person's touch was (touches.kind). */
export const TOUCH_KINDS = ["reply", "comment", "dm", "story_reply", "mention", "coded_message"] as const;
export type TouchKind = (typeof TOUCH_KINDS)[number];

/** What a touch is of, read through one shape: a post, an ad, a link, a form. Only `post` and `link` are kept in touches. */
export const TOUCH_SUBJECTS = ["post", "ad", "link", "form"] as const;
export type TouchSubjectType = (typeof TOUCH_SUBJECTS)[number];

/** What a touches row may be of: the rest live in their own homes (an ad's entry, a form's entry). */
export const TOUCH_KEPT_SUBJECTS = ["post", "link"] as const;

/** What a booking is put down to (PRD 9.3): from this, it helped, or nothing defensible. */
export type CreditClass = "direct" | "assisted" | "none";

/** What a visit answered, as it records it when asked for (appointments.through_type). */
export const VISIT_THROUGH_TYPES = ["post", "ad", "link", "form"] as const;
export type VisitThroughType = (typeof VISIT_THROUGH_TYPES)[number];

/** Where a post's link lands (links.lands): a chat with the business carrying the post's code, or its booking page. */
export const LINK_LANDS = ["chat", "booking"] as const;
export type LinkLands = (typeof LINK_LANDS)[number];

/** What a link is of (links.subject_type): a form, and a post since pass 2. */
export const LINK_SUBJECTS = ["form", "post"] as const;
export type LinkSubject = (typeof LINK_SUBJECTS)[number];

/**
 * Where a public answer to a comment stands (comment_answers.state): AI drafted it, AI could not answer it safely, the
 * owner pressed Send and it is on its way, Instagram took it, it did not go, or the owner left it unanswered.
 */
export const COMMENT_ANSWER_STATES = ["drafted", "cannot", "sending", "sent", "failed", "left"] as const;
export type CommentAnswerState = (typeof COMMENT_ANSWER_STATES)[number];
