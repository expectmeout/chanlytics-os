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
  ads: {
    kind: "due",
    why: "hands each connected ad account the read whose time its row holds, written there by its last read (00650); a read its platform holds back waits for the moment the row names",
    times: ["ad_accounts.next_read_at", "ad_accounts.read_after"],
    fn: "ads_hand_out",
  },
  calendar: {
    kind: "event-shaped",
    why: "hands each workspace with a feed a job hourly, which parses it to add people and stamp booked leads (0115); appointment events from push sync replace it, the iCal read a fallback (0002)",
  },
  calls: { kind: "reconcile", why: "re-reads calls, recordings and notes from Retell" },
  sources: {
    kind: "due",
    why: "hands each watched folder the read or the re-walk whose time its row holds, written there by its last read and walk (00641); a walk whose steps stopped is taken up from its rows. The same turn hands each waiting file its take once its own times have come (00643 source_takes_hand_out: source_items.take_after and length_until), the floor under the hand-outs a take's end, the video platform's word and a read ask for",
    times: ["media_sources.next_read_at", "media_sources.next_walk_at"],
    fn: "sources_hand_out",
  },
  text_canary: {
    kind: "judge",
    why: "judges the real wires once a day: a text to the platform's own line, taken in and answered, or a page (00595)",
  },
  channel_quality: { kind: "reconcile", why: "reads each connected WhatsApp number's quality rating from Meta" },
  deadman: {
    kind: "reconcile",
    why: "reconciles what a crash left, which no row's time says: a message no turn finished, a reply no job was left to send, a run no job started; and tells of a hold still open two hours after its own time, once",
  },
  drafts: {
    kind: "reconcile",
    why: "writes the reply a hold is owed where its event was dropped, its run died or the rules changed; the hold's own events write the rest (00538, decision 0093)",
  },
  google: {
    kind: "reconcile",
    why: "hands each workspace with a listing or a profile due a job, which reads them from Google (0115)",
  },
  health: { kind: "judge", why: "judges every clock, and mails and pages when one falls silent" },
  instagram_tokens: {
    kind: "reconcile",
    why: "keeps each connected Instagram account's sixty-day token alive with Instagram, refreshing it once it is a week old",
  },
  jobs: {
    kind: "reconcile",
    why: "the ledger's backstop: a written job wakes the runner (00333), and the tick claims what a wake missed",
  },
  jobs_canary: {
    kind: "judge",
    why: "puts the ledger's own job on it every minute, and is judged by the newest one done: the whole loop proved from outside (00526, decision 0089)",
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
    why: "hands each workspace with a step due a job that runs it, once a day, at its hour in its workspace's zone, judged from the hour and the day it last ran on its row (00245; sequence_steps_due, 00441; 0115); skips a playbook's run still waiting for approval once the day it was made for has passed (its row's run_for, the approve verb's own rule: contracts runTooLate); and writes the day's reach-out line at six",
    times: ["sequence_steps.run_hour", "sequence_steps.last_run_for"],
    fn: "sequence_steps_due",
  },
  previews: {
    kind: "due",
    why: "ends each lead's preview at the end of its thirty days, kept on its row (00497, decision 0079): its agent deleted at the provider, its words cleared and its workspace erased",
    times: ["lead_previews.ends_at"],
    fn: "trigger_previews_sweep",
  },
  purge_ask: { kind: "keep", why: "retention: Ask threads untouched for ninety days" },
  purge_client_errors: { kind: "keep", why: "retention: the errors pages hit, after thirty days (00469)" },
  purge_ad_days: { kind: "keep", why: "retention: an ad platform's day for an ad, 760 days on" },
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
    kind: "due",
    why: "hands each checked send its moment, the time its row holds (sequence_sends.send_at), claimed under a lock per domain; the clock calls the edge only when a send's time has come or a claim, a draft or a run's end was left behind, and otherwise records that it looked (decision 0098). Reclassified 26 Nov 2026, when it was read: its condition had become the row's time",
    times: ["sequence_sends.send_at"],
    fn: "trigger_reach_out_sweep",
  },
  reach_out_check: {
    kind: "due",
    why: "checks each planned send's address once the time its row holds has come (sequence_sends.check_after, which a gate that waits or a retry writes; none is at once), and an hour after the checker was down; the clock calls the edge only then, and otherwise records that it looked (decision 0098)",
    times: ["sequence_sends.check_after"],
    fn: "trigger_reach_out_check_sweep",
  },
  registration: { kind: "reconcile", why: "reads carrier registration status from Twilio" },
  snoozes: {
    kind: "due",
    why: "wakes a snoozed thread at the time the snooze kept on the row (00098)",
    times: ["conversations.snooze_until"],
    fn: "wake_stale_snoozes",
  },
  sweep_voice_sessions: { kind: "keep", why: "retention: voice sessions a day past their token" },
  texts: {
    kind: "reconcile",
    why: "hands each workspace with a line that texts a job, which reads its lines' record of received texts from the provider and takes in every one the door could not (00594, 0115)",
  },
};
