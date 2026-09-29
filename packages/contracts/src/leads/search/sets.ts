/**
 * The lead finder's closed sets, as the database stores them: a search's via; a round's purpose, state, ending and
 * answer; a run's purpose and state; a lead's email state, stage and closing reason; a place's class and fit in a
 * search; the kinds of counter, operation, preference and suppression, and a suppression's reason. The rules that
 * read them are the modules beside this one.
 */

/* ------------------------------------------------------ the stored sets -- */
// Each mirrors a CHECK in 00140 and is held to it in schema-sets.ts.

/** How a search was made: the finder on the page or through Ask, or a list of the owner's own (00242: a file, or leads chosen on Leads). */
export const LEAD_SEARCH_VIAS = ["people", "ask", "import", "chosen"] as const;
export type LeadSearchVia = (typeof LEAD_SEARCH_VIAS)[number];
export const LEAD_ROUND_PURPOSES = ["probe", "main", "topup", "renew"] as const;
export type LeadRoundPurpose = (typeof LEAD_ROUND_PURPOSES)[number];
export const LEAD_ROUND_STATES = ["queued", "probing", "waiting_on_owner", "running", "checking", "ended"] as const;
export type LeadRoundState = (typeof LEAD_ROUND_STATES)[number];
/** The nine endings, one closed set (§0.5, S7). */
export const LEAD_ROUND_ENDINGS = [
  "target_reached",
  "searched_everything",
  "month_leads_used",
  "budget_used",
  "few_new_matches",
  "stopped",
  "source_failed",
  "question_unanswered",
  "paused",
] as const;
export type LeadRoundEnding = (typeof LEAD_ROUND_ENDINGS)[number];
export const LEAD_ROUND_ANSWERS = ["keep", "include", "stop"] as const;
export type LeadRoundAnswer = (typeof LEAD_ROUND_ANSWERS)[number];
export const LEAD_RUN_PURPOSES = ["discover", "check"] as const;
export const LEAD_RUN_STATES = [
  "claimed",
  "starting",
  "running",
  "succeeded",
  "failed",
  "aborted",
  "timed_out",
  "unknown",
] as const;
export type LeadRunState = (typeof LEAD_RUN_STATES)[number];
/** The five words of §10.4, plus `checking` while a batch is out. */
export const LEAD_EMAIL_STATES = ["none", "checking", "ok", "catch_all", "unknown", "invalid"] as const;
export type LeadEmailState = (typeof LEAD_EMAIL_STATES)[number];
export const LEAD_STAGES = ["ready", "nurture", "converted", "archived"] as const;
export const LEAD_CLOSED_REASONS = ["said_no", "not_a_fit", "customer", "stale", "search_removed"] as const;
export const LEAD_MEMBER_CLASSES = ["qualified", "review", "excluded"] as const;
export type LeadMemberClass = (typeof LEAD_MEMBER_CLASSES)[number];
export const LEAD_FITS = ["strong", "look", "long"] as const;
export type LeadFit = (typeof LEAD_FITS)[number];
export const LEAD_COUNTER_KINDS = ["allowance", "budget", "day"] as const;
/** A's six, and release B's two: a lead's stage, and many at once. */
export const LEAD_OPERATION_KINDS = [
  "undo_search",
  "keep",
  "exclude",
  "put_back",
  "include",
  "stop",
  "stage",
  "bulk",
] as const;
export const LEAD_PREFERENCE_KINDS = ["chain", "wrong_kind", "too_far"] as const;
export const LEAD_SUPPRESSION_KINDS = ["email", "place", "phone", "domain"] as const;
export const LEAD_SUPPRESSION_WHATS = ["email_opt_out", "customer", "erased", "said_no"] as const;
