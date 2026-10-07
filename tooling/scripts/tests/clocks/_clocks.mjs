/**
 * What kind of clock each registered sweep is (decision 0031, invariant 6: time is a row). A clock may reconcile (bring
 * the database in line with a provider, or with what a wake missed), judge (watch the rest and raise the alarm), keep
 * (retention and housekeeping: a purge, a partition made ahead), or roll (count a day). A clock that runs a timer or a
 * reaction on a schedule is event-shaped: its work belongs on a due row (a job's due_at) or after the event that starts
 * it, and the count of them may only fall (clocks/clock-kinds.test.mjs, docs/debt.md).
 *
 * Keyed by the register's own name (sweep_status.sweep): ops/sweep-registry.db.test.mjs holds the register's every row
 * to a kind here, on a real database, as it holds it to its cron job. Each entry says why, and an event-shaped one says
 * what takes its place. Classified on 6 October 2026 from the wiring map's table of clocks; the job runner's tick moved
 * from event-shaped to reconcile when a written job began to wake the ledger (00333), the first fall.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */

/** The kinds a clock may be, the last of them the one that may only fall. */
export const CLOCK_KINDS = ["reconcile", "judge", "keep", "roll", "event-shaped"];

/** Every registered clock: its kind, and why (for an event-shaped one, what replaces it). */
export const CLOCKS = {
  calendar: {
    kind: "event-shaped",
    why: "parses each feed hourly to add people and stamp booked leads; appointment events from push sync replace it, the iCal read a fallback (0002)",
  },
  calls: { kind: "reconcile", why: "re-reads calls, recordings and notes from Retell" },
  channel_quality: { kind: "reconcile", why: "reads each connected WhatsApp number's quality rating from Meta" },
  deadman: {
    kind: "event-shaped",
    why: "finds threads waiting over two hours; an SLA timer on each escalation, a due row, replaces it (0003)",
  },
  domains: { kind: "reconcile", why: "checks each sending domain's verification, bounces and holds with the provider" },
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
  notes: {
    kind: "event-shaped",
    why: "asks for note suggestions every half hour; a step started when a conversation goes quiet replaces it",
  },
  partitions: { kind: "keep", why: "makes the events partition two months ahead" },
  partners: { kind: "roll", why: "a daily batch: a partner's matured earnings, and the letters that say so" },
  pauses: {
    kind: "event-shaped",
    why: "scans for pauses past their time every ten seconds; a timer set by the write that pauses replaces it",
  },
  platform_metrics_roll: { kind: "roll", why: "counts each workspace's day" },
  playbooks: {
    kind: "event-shaped",
    why: "runs due moments and reach-out steps hourly; journeys started by events and timers replace it",
  },
  purge_ask: { kind: "keep", why: "retention: Ask threads untouched for ninety days" },
  purge_cron_history: { kind: "keep", why: "retention: the clocks' own run history" },
  purge_events: { kind: "keep", why: "retention: evidence events after thirty days" },
  purge_idempotency_keys: { kind: "keep", why: "retention: the keys writes were answered under, after a day" },
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
  sending_domain_days: { kind: "roll", why: "files each sending domain's day of counters" },
  snoozes: {
    kind: "event-shaped",
    why: "scans for snoozes past their time every ten seconds; a timer set by the snooze replaces it",
  },
  sweep_voice_sessions: { kind: "keep", why: "retention: voice sessions a day past their token" },
};
