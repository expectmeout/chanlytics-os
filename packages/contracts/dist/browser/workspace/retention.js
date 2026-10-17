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
  /** The finder's judgment of a batch of places, with its reason for each (purge_leads, 00140; decision 0036). */
  lead_judgments: 180,
  /** A Google review the mirror has not seen for this long; a complete read drops one Google no longer lists at once (purge_google_reviews, 00392; decision 0036). */
  google_reviews: 90,
  /** A team invitation accepted or taken back, with the address it was sent to (purge_invitations, 00392; decision 0036). */
  invitations_closed: 30,
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
  /** A receptionist's turn as the model read it, and what it answered (purge_model_turns, 00401; decision 0039). */
  model_turns: 30,
  /** The text of a prompt the receptionist was given, from the last turn that read it: the usage ledger's own keep, so a kept turn's row there opens its prompt for as long as the row stands (purge_model_prompts, 00401). */
  model_prompts: 400,
  /** A workspace's settings as they stood at a version, from the day the next replaced it; the version in force is kept (purge_config_versions, 00402; decision 0039, step 3). */
  tenant_config_versions: 400
};
export const RATE_HITS_RETENTION_HOURS = 2;
export const EVENT_EVIDENCE_KINDS = [
  "webhook.auth",
  "webhook.delivery",
  "ingest.allowlist_skip",
  "ingest.unreachable_sender",
  "ingest.unroutable",
  "usage.llm_tokens",
  "usage.ask_tokens",
  // A door's own record of a match (resolve_person, 00342): the record is the person and their contact.added.
  "person.resolved"
];
const daysAfter = (n) => n === 1 ? "the day" : `${n} days`;
const forDays = (n) => n === 1 ? "a day" : `${n} days`;
export function retentionWords() {
  const d = RETENTION_DAYS;
  return `Call audio is kept for ${d.call_recordings} days and then removed; transcripts stay with the conversation. Webhook receipts, delivery logs, unplaced messages and model-usage rows are kept for ${d.events_evidence} days. Assistant threads untouched for ${d.ask_threads} days, and notifications after ${d.notifications} days, are removed; the sweeps' run history is kept for ${d.cron_history} days and rate-limit counters for ${RATE_HITS_RETENTION_HOURS} hours. Leads nobody has worked are set aside after ${d.leads_untouched} days and their details removed after ${d.leads_untouched_blanked}; places a search left out lose their details after ${d.leads_excluded_blanked} days, and the finder's reasons for a batch of places are removed after ${d.lead_judgments}. A Google review is kept while Google shows it: one it no longer lists is removed at the next full read, and any review is removed ${d.google_reviews} days after we last saw it. A team invitation that was accepted or taken back is removed ${d.invitations_closed} days later, with the address on it, and the address a workspace was handed over to is cleared once its new owner accepts. Background jobs, which carry a message while it is sent, are removed ${d.jobs_finished} days after they finish, or ${d.jobs_failed} days after they fail. Messages, call reports, delivery receipts and billing notices, as each provider sent them to us, are kept for ${d.provider_events} days so they can be replayed after a fault. What a change made in the dashboard answered is kept for ${forDays(d.idempotency_keys)}, so the same change sent twice is made once. How fast each page loaded, with no person or workspace attached, is kept for ${d.page_vitals} days, and what each model call cost for ${d.ai_usage} days. What the receptionist was shown when it wrote a reply, and what it answered, is kept for ${d.model_turns} days, and the instructions it was given for ${d.model_prompts} days after they were last used. A workspace's settings as they stood before a change are kept for ${d.tenant_config_versions} days after the change. A voice conversation's session, which holds nothing of what was said, is removed ${daysAfter(d.ask_voice_sessions)} after it expires. Everything else stays while the workspace exists.`;
}
export const RECORDING_RETENTION_DAYS = RETENTION_DAYS.call_recordings;
export const RECORDING_PURGED_WORDS = `Recording removed after ${RECORDING_RETENTION_DAYS} days; the transcript is kept`;
