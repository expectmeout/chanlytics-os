/**
 * How long the product keeps what, in one place.
 *
 * The privacy page says it and a sweep enforces it, and both read this file, so
 * the two cannot drift. A table is listed here only once something actually
 * removes it on that schedule: a number on this list is a promise the product
 * keeps, not one it would like to. Until 12 Sep 2026 the page said "call
 * recordings are kept for 90 days" and nothing in the repo deleted one.
 */
export const RETENTION_DAYS = {
  /** Call audio in the private media bucket. The transcript and the summary stay with the call (api/cron/calls). */
  call_recordings: 90,
  /** The evidence kinds on the events ledger (EVENT_EVIDENCE_KINDS); every other kind is the record and is kept (purge_events, 00115). */
  events_evidence: 30,
  /** Assistant threads untouched for this long, with their messages (purge_ask, 00040). */
  ask_threads: 90,
  /** The bell's rows and their marks (purge_notifications, 00057). */
  notifications: 90,
  /** The sweeps' run history; a clock that fires every few minutes keeps a day (purge_cron_history, 00099). */
  cron_history: 14,
  /** A found lead nobody worked (no contact, no export, no person): set aside, then its details removed (purge_leads, 00140). */
  leads_untouched: 90,
  leads_untouched_blanked: 180,
  /** A place a search left out: its details removed, while the count of what was left out stays (purge_leads, 00140). */
  leads_excluded_blanked: 30,
  /** A background job done or canceled, which carried a message's number and words while it was sent (purge_jobs, 00215). */
  jobs_finished: 7,
  /** A failed one lives as long as the alert that cites it (purge_jobs, 00215; notifications). */
  jobs_failed: 90,
  /** How fast a page load was, with no person or workspace on it (purge-page-vitals, 00225). */
  page_vitals: 30,
} as const;

/** Rate-limit counters (00059): two hours, in hours. */
export const RATE_HITS_RETENTION_HOURS = 2;

/**
 * The event kinds that are evidence rather than the record: receipts,
 * delivery logs, unplaced messages, and the model-usage rows the two budgets
 * read over a rolling day. Purged after RETENTION_DAYS.events_evidence; the
 * activity log hides the same families unless asked by name
 * (ACTIVITY_NOISE_PREFIXES). usage.voice_seconds and usage.wa_conversation
 * are NOT here: a call's cost and a WhatsApp conversation's opening are the
 * record, and the reports read them.
 */
export const EVENT_EVIDENCE_KINDS = [
  "webhook.auth",
  "webhook.delivery",
  "ingest.allowlist_skip",
  "ingest.unreachable_sender",
  "ingest.unroutable",
  "usage.llm_tokens",
  "usage.ask_tokens",
] as const;

/** The retention, as the privacy page states it: one paragraph, from the numbers above. */
export function retentionWords(): string {
  const d = RETENTION_DAYS;
  return `Call audio is kept for ${d.call_recordings} days and then removed; transcripts stay with the conversation. Webhook receipts, delivery logs, unplaced messages and model-usage rows are kept for ${d.events_evidence} days. Assistant threads untouched for ${d.ask_threads} days, and notifications after ${d.notifications} days, are removed; the sweeps' run history is kept for ${d.cron_history} days and rate-limit counters for ${RATE_HITS_RETENTION_HOURS} hours. Leads nobody has worked are set aside after ${d.leads_untouched} days and their details removed after ${d.leads_untouched_blanked}; places a search left out lose their details after ${d.leads_excluded_blanked} days. Background jobs, which carry a message while it is sent, are removed ${d.jobs_finished} days after they finish, or ${d.jobs_failed} days after they fail. How fast each page loaded, with no person or workspace attached, is kept for ${d.page_vitals} days. Everything else stays while the workspace exists.`;
}

export const RECORDING_RETENTION_DAYS: number = RETENTION_DAYS.call_recordings;

/** What a call says once its audio has been removed on schedule. */
export const RECORDING_PURGED_WORDS = `Recording removed after ${RECORDING_RETENTION_DAYS} days; the transcript is kept`;
