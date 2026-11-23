/**
 * The closed sets pass 3's records hold (the content loop PRD's 5.3 and 5.4): what a business's posts are for, where a
 * week's plan stands, where each of its slots stands, what kind of thing an owner claims and where it was said, and the
 * reasons to post now that the planner reads. A leaf: the schema's pins (shared/schema-sets.ts) read them here, so
 * holding a set to the database draws no module of words or rules into what the pins reach.
 */

/**
 * What a business's posts are for (content_goals.goal). What the database holds, never rows a screen offers (PRD 21.1):
 * an owner says it to AI, or edits the line in Settings › Content in their own words.
 */
export const CONTENT_GOALS = ["fill_slow_days", "introduce_service", "repeat_visits", "awareness", "reviews"] as const;
export type ContentGoal = (typeof CONTENT_GOALS)[number];

/** Where a week's plan stands (content_plans.status, PRD 8.4): drafting, ready for the owner, approved, the week passed. */
export const PLAN_STATUSES = ["drafting", "ready", "approved", "done"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/**
 * Where one slot of a plan stands (plan_slots.state): proposed by the plan; blocked by a check, with its one fix; asking
 * for footage that no clip can tell yet; approved with the week (or by itself once mended); left out by the owner; up.
 */
export const SLOT_STATES = ["proposed", "blocked", "needs_footage", "approved", "removed", "posted"] as const;
export type SlotState = (typeof SLOT_STATES)[number];

/**
 * The places a week is planned for (00706 plan_slots.place): Instagram and Google. A Facebook Page (the content loop's
 * pass 5) is posted to by the owner's own press until a real Page has shown it works; the plan takes it then.
 */
export const PLAN_PLACES = ["instagram", "google"] as const;
export type PlanPlace = (typeof PLAN_PLACES)[number];

/** What an owner claims (owner_claims.kind): a price, an offer, a guarantee, or a fact they state ("Thursday still has openings"). */
export const CLAIM_KINDS = ["price", "offer", "guarantee", "fact"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

/** Where a claim was said (owner_claims.source): to AI, in Settings, or read from the business's own website. */
export const CLAIM_SOURCES = ["said", "settings", "website"] as const;
export type ClaimSource = (typeof CLAIM_SOURCES)[number];

/**
 * A reason to post now, as `opportunitiesOf` reads it (PRD 10.1): open time on a day, a new review of four or five stars,
 * fresh footage, an offer that runs, a service the business added. The PRD's `season` and `slow_season` wait for a
 * calendar of each country's days and a year of visits; nothing reads them yet, so they are not in the set.
 */
export type OpportunityKind = "open_capacity" | "new_review" | "fresh_footage" | "offer" | "new_service";

/** How a plan was asked for (content_plans.asked_by): the weekly clock on Sunday evening, or the owner (PRD 10.2). */
export const PLAN_ASKED_BY = ["clock", "owner"] as const;
export type PlanAskedBy = (typeof PLAN_ASKED_BY)[number];
