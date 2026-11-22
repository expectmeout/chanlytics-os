/**
 * The closed sets pass 1b's records hold (00680 to 00682, and 00676's remediations): a rendition's shape, what an
 * approval is of and why it stopped standing, who made a version, who a person in a file is and how that is known, and
 * what a remediation does, reaches and came to. A leaf: the schema's pins (shared/schema-sets.ts) read them here, so
 * holding a set to the database draws no module of words or rules into what the pins reach.
 */

/** The shapes a piece is drawn in for its places (PRD 5.3): a story or a reel, a portrait post, a square, a wide, Google's. */
export const RENDITION_SHAPES = ["9x16", "4x5", "1x1", "16x9", "google"] as const;
export type RenditionShape = (typeof RENDITION_SHAPES)[number];

/** What an approval can be of: a version of a piece and its placements, a week's plan (pass 3), an ad's Turn on. */
export const APPROVAL_SUBJECTS = ["piece_revision", "plan", "ad"] as const;

/** Why an approval stopped standing: the thing changed, a yes was taken back, a claim, the place, or the owner withdrew it. */
export const APPROVAL_VOID_WHYS = ["changed", "rights", "claim", "place", "owner"] as const;
export type ApprovalVoidWhy = (typeof APPROVAL_VOID_WHYS)[number];

/** Who made a version of a piece. */
export const REVISION_MADE_BY = ["ai", "owner", "operator"] as const;
export type RevisionMadeBy = (typeof REVISION_MADE_BY)[number];

/** Who a person in a file is to the business (00681 file_subjects.label). */
export const SUBJECT_LABELS = ["client", "staff", "other"] as const;
export type SubjectLabel = (typeof SUBJECT_LABELS)[number];

/** How it is known a person is in a file: the owner or an operator named them, or the person said so. Never a face. */
export const SUBJECT_HOWS = ["owner_named", "person_said"] as const;

/** Whether the people in a file are known (00681 files.subjects_state). */
export const SUBJECTS_STATES = ["not_asked", "none", "named", "unsure"] as const;
export type SubjectsState = (typeof SUBJECTS_STATES)[number];

/** What a remediation's action came to (00676 remediation_actions.outcome). */
export const REMEDIATION_OUTCOMES = ["done", "pending", "blocked", "not_possible", "needs_person"] as const;
export type RemediationOutcome = (typeof REMEDIATION_OUTCOMES)[number];

/** What a remediation does to what it reached (00676 remediation_actions.act). */
export const REMEDIATION_ACTS = ["cancel", "pause", "take_down"] as const;
export type RemediationAct = (typeof REMEDIATION_ACTS)[number];

/** What a remediation reaches (00676 remediation_actions.target_type). */
export const REMEDIATION_TARGETS = ["post", "ad", "scheduled_post"] as const;
export type RemediationTarget = (typeof REMEDIATION_TARGETS)[number];
