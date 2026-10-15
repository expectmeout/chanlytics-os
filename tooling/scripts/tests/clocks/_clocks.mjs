/**
 * What kind of clock each registered sweep is (decision 0031, invariant 6: time is a row). A clock may reconcile (bring
 * the database in line with a provider, or with what a wake missed), judge (watch the rest and raise the alarm), keep
 * (retention and housekeeping: a purge, a partition made ahead), roll (count a day), or carry out what is due: a time
 * its rows already hold, a deadline or a schedule and the day it last ran, each row acted on once (`times` names the
 * columns, and `fn` the database function that reads them, which clocks/clock-kinds.test.mjs holds to the schema). Time living in the row is 00098's rule, which retired
 * the jobs that once kept a second copy of a pause's and a snooze's time (decision 0044, amended 11 October 2026). A clock
 * that runs a timer or a reaction on a schedule, inferring from a condition what no row's time says, is event-shaped:
 * its work belongs on a due row or after the event that starts it, and the count of them may only fall
 * (clocks/clock-kinds.test.mjs, docs/debt.md).
 *
 * Keyed by the register's own name (sweep_status.sweep): ops/sweep-registry.db.test.mjs holds the register's every row
 * to a kind here, on a real database, as it holds it to its cron job. Each entry says why, and an event-shaped one says
 * what takes its place. Classified on 6 October 2026 from the wiring map's table of clocks; the job runner's tick moved
 * from event-shaped to reconcile when a written job began to wake the ledger (00333), the first fall.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */

/** The kinds a clock may be, the last of them the one that may only fall. */
export const CLOCK_KINDS = ["reconcile", "judge", "keep", "roll", "due", "event-shaped"];

/** Every registered clock: its kind, and why (for an event-shaped one, what replaces it). */
export const CLOCKS = {
  calendar: {
    kind: "event-shaped",
    why: "parses each feed hourly to add people and stamp booked leads; appointment events from push sync replace it, the iCal read a fallback (0002)",
  },
  calls: { kind: "reconcile", why: "re-reads calls, recordings and notes from Retell" },
  channel_quality: { kind: "reconcile", why: "reads each connected WhatsApp number's quality rating from Meta" },
  deadman: {
    kind: "reconcile",
    why: "reconciles what a crash left, which no row's time says: a message no turn finished, a reply no job was left to send, a run no job started; and tells of a hold still open two hours after its own time, once",
  },
  google: { kind: "reconcile", why: "reads each workspace's listings and profiles from Google" },
  health: { kind: "judge", why: "judges every clock, and mails and pages when one falls silent" },
  jobs: {
    kind: "reconcile",
    why: "the ledger's backstop: a written job wakes the runner (00333), and the tick claims what a wake missed",
  },
  leads: { kind: "reconcile", why: "takes up lead runs whose start or lease was lost" },
  lines: {
    kind: "event-shaped",
    why: "resumes stuck line sagas and releases ended lines; the workflow runtime resuming its own steps replaces it",
  },
  mailboxes: {
    kind: "reconcile",
    why: "keeps each connected mailbox's watch, reads back what a push may have missed, and judges its own mail hourly",
  },
  notes: {
    kind: "event-shaped",
    why: "asks for note suggestions every half hour; a step started when a conversation goes quiet replaces it",
  },
  partitions: { kind: "keep", why: "makes the events partition two months ahead" },
  partners: { kind: "roll", why: "a daily batch: a partner's matured earnings, and the letters that say so" },
  pauses: {
    kind: "due",
    why: "ends a thread's hold on who is speaking, and its pause once no request for a person still asks for one, at the time the write that paused it kept on the row (00098)",
    times: ["conversations.paused_until", "conversations.control_until"],
    fn: "expire_stale_pauses",
  },
  platform_metrics_roll: { kind: "roll", why: "counts each workspace's day" },
  playbooks: {
    kind: "due",
    why: "runs each step of every sequence once a day, at its hour in its workspace's zone, judged from the hour and the day it last ran on its row (00245; sequence_steps_due, 00441); skips a playbook's run still waiting for approval once the day it was made for has passed (its row's run_for, the approve verb's own rule: contracts runTooLate); and writes the day's reach-out line at six",
    times: ["sequence_steps.run_hour", "sequence_steps.last_run_for"],
    fn: "sequence_steps_due",
  },
  purge_ask: { kind: "keep", why: "retention: Ask threads untouched for ninety days" },
  purge_cron_history: { kind: "keep", why: "retention: the clocks' own run history" },
  purge_events: { kind: "keep", why: "retention: evidence events after thirty days" },
  purge_google_reviews: { kind: "keep", why: "retention: a Google review the mirror has not seen for ninety days" },
  purge_idempotency_keys: { kind: "keep", why: "retention: the keys writes were answered under, after a day" },
  purge_invitations: { kind: "keep", why: "retention: a team invitation a month after it was accepted or taken back" },
  purge_config_versions: {
    kind: "keep",
    why: "retention: a workspace's settings as they stood, 400 days after a version is replaced",
  },
  purge_model_turns: {
    kind: "keep",
    why: "retention: the receptionist's kept turns after thirty days, and the prompts no turn has read for 400",
  },
  purge_jobs: { kind: "keep", why: "retention: the ledger's finished and failed rows" },
  purge_leads: { kind: "keep", why: "retention: leads nobody worked, and places a search left out" },
  purge_notifications: { kind: "keep", why: "retention: notifications after ninety days" },
  purge_page_vitals: { kind: "keep", why: "retention: page timings after thirty days" },
  purge_provider_events: { kind: "keep", why: "retention: the intake ledger's kept deliveries after a week" },
  purge_rate_hits: { kind: "keep", why: "retention: rate-limit counters after two hours" },
  reach_out: {
    kind: "event-shaped",
    why: "claims due sends every minute under a lock per domain; workflow steps under a rate limit per domain replace it",
  },
  reach_out_check: {
    kind: "event-shaped",
    why: "checks each opening every minute; a step started when a send is planned replaces it",
  },
  registration: { kind: "reconcile", why: "reads carrier registration status from Twilio" },
  snoozes: {
    kind: "due",
    why: "wakes a snoozed thread at the time the snooze kept on the row (00098)",
    times: ["conversations.snooze_until"],
    fn: "wake_stale_snoozes",
  },
  sweep_voice_sessions: { kind: "keep", why: "retention: voice sessions a day past their token" },
};
