export const LEAD_SEARCH_VIAS = ["people", "ask", "import", "chosen"];
export const LEAD_ROUND_PURPOSES = ["probe", "main", "topup", "renew"];
export const LEAD_ROUND_STATES = ["queued", "probing", "waiting_on_owner", "running", "checking", "ended"];
export const LEAD_ROUND_ENDINGS = [
  "target_reached",
  "searched_everything",
  "month_leads_used",
  "budget_used",
  "few_new_matches",
  "stopped",
  "source_failed",
  "question_unanswered",
  "paused"
];
export const LEAD_ROUND_ANSWERS = ["keep", "include", "stop"];
export const LEAD_RUN_PURPOSES = ["discover", "check"];
export const LEAD_RUN_STATES = [
  "claimed",
  "starting",
  "running",
  "succeeded",
  "failed",
  "aborted",
  "timed_out",
  "unknown"
];
export const LEAD_EMAIL_STATES = ["none", "checking", "ok", "catch_all", "unknown", "invalid"];
export const LEAD_STAGES = ["ready", "nurture", "converted", "archived"];
export const LEAD_CLOSED_REASONS = ["said_no", "not_a_fit", "customer", "stale", "search_removed"];
export const LEAD_MEMBER_CLASSES = ["qualified", "review", "excluded"];
export const LEAD_FITS = ["strong", "look", "long"];
export const LEAD_COUNTER_KINDS = ["allowance", "budget", "day"];
export const LEAD_OPERATION_KINDS = [
  "undo_search",
  "keep",
  "exclude",
  "put_back",
  "include",
  "stop",
  "stage",
  "bulk",
  "add",
  "later",
  "leave"
];
export const LEAD_PREFERENCE_KINDS = ["chain", "wrong_kind", "too_far"];
export const LEAD_SUPPRESSION_KINDS = ["email", "place", "phone", "domain"];
export const LEAD_SUPPRESSION_WHATS = ["email_opt_out", "customer", "erased", "said_no"];
