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
  /** A voice conversation's row, from the day its token expired: a sealed token nobody can open, and its minutes (sweep_voice_sessions, 00288). */
  ask_voice_sessions: 1,
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
  /** How fast a page load was, with no person or workspace on it (purge-page-vitals, 00255). */
  page_vitals: 30,
  /** The ledger of model calls: each call's tokens, model and dollars (ai_usage_purge, 00273, run by the health sweep). */
  ai_usage: 400,
  /** A provider's delivery as it came, kept for a local replay after a fix (purge_provider_events, 00336; decision 0032). */
  provider_events: 7,
  /** What a write answered, under the key its page sent, so the same write sent twice is made once (purge_idempotency_keys, 00340; decision 0035). */
  idempotency_keys: 1,
} as const;

/** Rate-limit counters (00059): two hours, in hours. */
export const RATE_HITS_RETENTION_HOURS = 2;

/**
 * The event kinds that are evidence rather than the record: receipts,
 * delivery logs, unplaced messages, and the model-usage rows the two budgets
 * read over a rolling day. Purged after RETENTION_DAYS.events_evidence; the
 * activity log hides the same families unless asked by name
 * (ACTIVITY_NOISE_PREFIXES), and the kinds named in ACTIVITY_NOISE_KINDS beside them:
 * a record, kept, that no owner reads as activity.
 * usage.voice_seconds and usage.wa_conversation
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
  // A door's own record of a match (resolve_person, 00342): the record is the person and their contact.added.
  "person.resolved",
] as const;

/** "the day" after for one day, "N days" after for more: the words follow the number. */
const daysAfter = (n: number): string => (n === 1 ? "the day" : `${n} days`);
/** "a day" for one, "N days" for more. */
const forDays = (n: number): string => (n === 1 ? "a day" : `${n} days`);

/** The retention, as the privacy page states it: one paragraph, from the numbers above. */
export function retentionWords(): string {
  const d = RETENTION_DAYS;
  return `Call audio is kept for ${d.call_recordings} days and then removed; transcripts stay with the conversation. Webhook receipts, delivery logs, unplaced messages and model-usage rows are kept for ${d.events_evidence} days. Assistant threads untouched for ${d.ask_threads} days, and notifications after ${d.notifications} days, are removed; the sweeps' run history is kept for ${d.cron_history} days and rate-limit counters for ${RATE_HITS_RETENTION_HOURS} hours. Leads nobody has worked are set aside after ${d.leads_untouched} days and their details removed after ${d.leads_untouched_blanked}; places a search left out lose their details after ${d.leads_excluded_blanked} days. Background jobs, which carry a message while it is sent, are removed ${d.jobs_finished} days after they finish, or ${d.jobs_failed} days after they fail. Messages, call reports, delivery receipts and billing notices, as each provider sent them to us, are kept for ${d.provider_events} days so they can be replayed after a fault. What a change made in the dashboard answered is kept for ${forDays(d.idempotency_keys)}, so the same change sent twice is made once. How fast each page loaded, with no person or workspace attached, is kept for ${d.page_vitals} days, and what each model call cost for ${d.ai_usage} days. A voice conversation's session, which holds nothing of what was said, is removed ${daysAfter(d.ask_voice_sessions)} after it expires. Everything else stays while the workspace exists.`;
}

export const RECORDING_RETENTION_DAYS: number = RETENTION_DAYS.call_recordings;

/** What a call says once its audio has been removed on schedule. */
export const RECORDING_PURGED_WORDS = `Recording removed after ${RECORDING_RETENTION_DAYS} days; the transcript is kept`;
