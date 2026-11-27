/** The closed sets of the queue's: every job kind, every subscriber a delivery can name, and a job's states. Held to their columns as every set is (shared/enums.ts). */
/**
 * What the queue carries: each kind has a handler in packages/jobs and a
 * caller that schedules it. Kinds declared ahead of their slice (veto_fire,
 * media_fetch, rollup_daily, deadman, report_weekly) are gone — a vetoed reply
 * is an outbound_send with a delay, the deadman is a pg_cron sweep, media is
 * fetched inline — and so are the two timers (snooze_wake, pause_expire): a
 * snooze or a pause wakes from its own timestamp on the conversation (00098).
 * `blob_thread_erase` is gone too (00151): it erased the Vercel Blob copy of
 * a conversation, and there is no such copy — Postgres is the receptionist's
 * only memory, and an erasure deletes rows.
 * A new kind arrives with its handler, its caller, its job_kinds row (00526) and its KIND_POLICY (decision 0089), and
 * jobs/job-kinds.test.mjs holds them equal.
 */
export const JOB_KINDS = [
  "outbound_send",
  "broadcast_send",
  /**
   * A line's provisioning saga, run under the ledger's lease and resumed by
   * the heartbeat if a worker dies (00109). The saga itself stays on the
   * edge with the provider's credentials and is injected into the tick.
   */
  "line_provision",
  /**
   * One received email, fetched from the provider and taken in (00127). The
   * webhook that announces it is a pointer, and a fetch can fail, so intake is
   * a job: once per mailbox however often the webhook is replayed, and resumed
   * where an interrupted run stopped. The fetch stays on the edge with the
   * provider's key and is injected into the tick.
   */
  "email_ingest",
  /**
   * The lead finder (00140, PRD v3 §12.5). lead_round_start starts one round:
   * a run per term, each claimed before the provider is called. lead_collect
   * reads one page of one run, judges it and commits it in one transaction;
   * seq is p<offset> for a page, final from the webhook, s<minute> from the
   * sweep, stop from the stop door. lead_check checks one batch of emails. A
   * provider's 429 or 5xx throws and is tried again by RETRY_WAITS_MS.
   */
  "lead_round_start",
  "lead_collect",
  "lead_check",
  /**
   * One kept notification (00057) to every phone of the people it is for
   * (00162). Scheduled by the edge's notify when the row's kind is one of
   * contracts PUSH_KINDS; a transport failure throws and is tried again by
   * RETRY_WAITS_MS. Internal work: a second claim runs it again.
   */
  "push_send",
  /**
   * The receipts of one push_send, read a quarter of an hour on (00189):
   * Expo's ticket says the service took a message, its receipt says whether
   * the phone did, and a phone answered gone is forgotten here. Carries the
   * tickets in its payload; a transport failure throws and is tried again.
   */
  "push_receipts",
  /**
   * One reply to a reach-out, read for what it means (Reach out Part 5, 00222): the model's reading, applied through
   * reach_out_reply_apply, and the workspace told once. Scheduled by the email intake once per message
   * (jobs_reply_read_once, scheduleJobOnce), and by itself for a re-read of a reply it could not read ({ stage:
   * "reread-<n>" }). Internal work written to be run again: a second claim finds the reading and pays nothing.
   */
  "reply_read",
  /**
   * One booking tool's notice read into an appointment: the
   * email_ingest that recognised it schedules one per delivery (payload { received_id, mailbox_id }, keyed on the
   * delivery), the handler fetches the email again, asks the model and writes the row. Internal work written to be run
   * again: a second claim finds the row by the delivery's id and pays nothing.
   */
  "booking_read",
  /**
   * One event's delivery to one subscriber (00334, decision 0032): the relay writes it beside the event_deliveries row,
   * keyed 'deliver:<event>:<subscriber>' (jobs.dedupe_key), in the subscription's lane (payload.lane). The handler runs
   * the subscriber (core SUBSCRIBERS) and settles the delivery; a subscriber this build does not know is kept, as an
   * unknown kind is. Internal work written to be run again: every subscriber assumes a second delivery.
   */
  "event_deliver",
  /**
   * One text answered after its acknowledgement (00347, decision 0031 Phase 2): the SMS door records the text and answers
   * Twilio, and this job takes it up again through the whole inbound phase (core answerInbound with `resume`), keyed
   * 'inbound_answer:<message>' (jobs.dedupe_key), in the reply lane. A runner killed mid-turn leaves it to be claimed
   * again: the message is answered while it is unprocessed and no reply names it, so a second claim never texts twice.
   */
  "inbound_answer",
  /**
   * One part of a connection's history brought in (00478, decision 0073, R19 to R21): the mailbox's six months of mail
   * from people, its contacts, a calendar read through its grant, WhatsApp's contacts and chats asked of Meta. payload
   * { source (contracts IMPORT_SOURCES), seq, connection_id? }, keyed 'history_import:<workspace>:<source>:<seq>'
   * (jobs.dedupe_key), in the bulk lane. A part reads from the imports ledger's cursor, notes the ledger and schedules
   * the next while there is more; a provider that cannot be asked throws and the part is tried again. Written to be run
   * again: every write is once by the provider's id.
   */
  "history_import",
  /**
   * The business's website read for the first run's Check (00479, decision 0073, R10): its home page and up to two pages
   * it links to, through the public fetcher's address rule, its services, prices, booking rules and answers drawn out by
   * the model into business_reads. payload { url }, keyed 'website_read:<workspace>' (jobs.dedupe_key) while one waits,
   * in the lane of someone waiting. Written to be run again: the read is kept whole, the newest standing.
   */
  "website_read",
  /**
   * A lead's own receptionist built before they sign up (00497, decision 0079): written from the lead's listing, its
   * website read and worn, in the lane of someone waiting (a send held for it, or the member who pressed). payload
   * { preview_id }, keyed 'preview_build:<preview>' while one waits. Written to be run again: a built preview moves no
   * more, and the config write is the settings' compare-and-swap.
   */
  "preview_build",
  /**
   * An erasure a press left to the ledger (00501, decision 0036): put there beside the block by every press, due once
   * it has had time to end, or now by a press of many, payload { contact_id, by? }, keyed 'erasure_finish:<contact>'
   * while one waits. erase_contact withdraws it when a press ends well; otherwise it runs the erasure, on the service
   * role, in the lane of someone waiting. Internal work written to be run again: every leg is keyed on the person.
   */
  "erasure_finish",
  /**
   * One thread's reply written ahead for a person (00538, decision 0093): scheduled by the hold's subscriber and the
   * drafts' sweep, payload { conversation_id, draft_kind, message_id?, rules }, keyed on all four while one waits, in the
   * reply lane: someone is about to read it. The receptionist's brain writes it and it is kept on the thread. Internal
   * work written to be run again: a second run finds the draft and pays nothing.
   */
  "reply_draft",
  /**
   * One file read by the small model (00551, decision 0099): payload { file_id, edition }, once a file and an edition
   * while one waits, in the bulk lane, since 200 from an import must not hold a customer's send, and paced when an import
   * brought it. A lone upload still starts at once, a workspace with nothing running going first. Written to be run again.
   */
  "file_look",
  /**
   * Pictures an import found on the business's website or its public listing, fetched and kept (00551): payload
   * { source, batch, items }, each kept once ever by its fingerprint, so a second run keeps nothing twice.
   */
  "file_fetch",
  /**
   * An Instagram account's posts and reels brought in (00626, Content's empty state): payload { handle, step, try,
   * run_id?, dataset_id? }, one step a run: start asks the scraping platform for the account's newest posts, collect asks
   * after the run until its posts are read, then hands them to file_fetch, since their addresses expire within hours.
   */
  "instagram_read",
  /** A removed file's bytes and Anthropic's copy of it let go (00551): payload { file_id }. */
  "file_purge",
  // A video made ready one step a run, each run again safely (00556, decision 0099 B): payload { file_id, step, edition }.
  "video_digest",
  // One photo or clip of a watched folder taken into the Library (00643): payload { item_id, try }, once an item and a try.
  "source_take",
  // A watched clip's copy brought back to the video platform from its folder (00654): payload { file_id }, once a file
  // while one waits or runs, so two askers join one job.
  "copy_return",
  // A made video's own file put on Chanlytics' shelf and checked there (00695, the archive plan's B2): payload
  // { file_id }, once a file while one waits or runs. Written by the shelf's own doors, with the copy's row.
  "file_shelve",
  /**
   * A post on its way to Instagram (00611, decision 0121), payload { post_id, attempt }, once a post and an attempt while one
   * waits, in the bulk lane: a post never holds a reply. Prepare makes it ready there (a container) and is run again safely;
   * publish sends it, once, after the recheck; reconcile asks Instagram what it has when a send had no answer.
   */
  "post_prepare",
  "post_publish",
  "post_reconcile",
  /**
   * A post on its way to Google at its time (00616, the content redesign's stage 3), payload { post_id, attempt }, in the bulk
   * lane beside Instagram's: the picture was drawn at the press, and this asks Google to fetch it, once, after the recheck.
   */
  "post_google",
  /**
   * A post asked down at its place (00682; the content loop PRD's 8.3), payload { action_id, attempt, by_hand? }, in the bulk
   * lane: one remediation action asked of the place, or, once the owner said they deleted it there, the place asked whether
   * it is gone. The post is taken down only when the place said so.
   */
  "post_take_down",
  /**
   * A week of posts planned (00706; the content loop PRD's 10.2), payload { plan_id }, in the bulk lane: the reasons to
   * post now read, the candidates scored, the week picked within the cadence, worded by AI in one call (post_words) and
   * written ready, with nothing made. Begun by the weekly clock on Sunday evening in the business's zone, or by the
   * owner's ask.
   */
  "content_plan",
  /**
   * A week AI may approve goes up (00714; the content loop PRD's 12.4), payload { plan_id }, in the bulk lane: at a held
   * week's time (8:00 in the business's zone), or as soon as it is ready under a rung that sends it, the plan, the rung and
   * the stop read again, the week approved as the owner's press would under the rung, and made by the dashboard as AI.
   * Scheduled by the plan job, never by a clock.
   */
  "content_week_go",
  /**
   * A week AI approved, made in its turn (00714), payload { plan_id }, in the bulk lane: begun by the making queue
   * (content_weeks_start), never more at once than its cap, the earliest first post first; it asks the dashboard to make
   * the week as AI, and the dashboard says when it is made, which begins the next.
   */
  "content_week_make",
  /**
   * A post's numbers read back from its place (00699; the content loop PRD's 9.1), payload { post_id, step }, in the bulk
   * lane: one read at an hour, a day, 3, 7 or 28 days after it went up, every number at once, a missing one said and never
   * a zero. The health sweep asks one for each read that is due and not kept.
   */
  "post_observe",
  /**
   * A public answer to a comment on a post (00699; the content loop PRD's 12.4), payload { touch_id, step, attempt? }, in
   * the lane of someone waiting who is not a customer: step draft has AI write it (or say why it cannot, safely), step send
   * posts the owner's words under the comment as the business.
   */
  "comment_reply",
  /**
   * A video made from a business's clips (00613, decision 0122), payload { piece_id, step, tick }, one step a run, in the
   * lane of someone waiting who is not a customer: start reads the clips and starts the machine that draws it, wait asks
   * after the drawing and sends the video into the video platform. A wait that runs out of its run is the next tick.
   */
  "piece_make",
  /**
   * A workspace's recurring work, handed out by its clock and run here (00569, decision 0115), one a workspace while
   * one waits or runs: its due moments read and run together, its reach-out steps, its calendar read, its Google
   * listings and profile read, its lines' unheard texts taken in (00605). Payload {}: each asks what is due as it runs.
   */
  "campaign_moments",
  "reach_out_steps",
  "calendar_read",
  "google_read",
  "texts_read",
  /**
   * A workspace's occasions whose time has come (00598, decision 0119), handed out by the sequences' clock each minute,
   * one job a workspace while one waits or runs: each due person's step is run or left. Payload {}: it asks what is due.
   */
  "sequence_occasions",
  /**
   * A watched folder kept current (00641, the footage sources plan): `source_walk` is one step of a walk of its tree (a
   * first listing, a re-walk, a new folder's contents), payload { source_id, run, step, walk }, once a folder, run and
   * step; `source_read` is one read of its provider's changes from the place its row keeps, payload { source_id }, once
   * a folder while one waits or runs. Both in the bulk lane and written to be run again: every write is once an item.
   */
  "source_walk",
  "source_read",
  /**
   * A connected ad account read at its platform (00650, decision 0049): its ads with the budget each sits under, and
   * the platform's days for them. Payload { account_id }, once an account while one waits or runs, in the bulk lane,
   * and written to be run again: every write is once an ad and once a day.
   */
  "ad_read",
  /**
   * A workspace's places asked which of its posts they still hold, handed out by the health sweep once a day
   * (posts_read_due), one a workspace while one waits or runs, in the bulk lane. Payload {}, or { dry: "yes" }.
   */
  "posts_read",
  "booking_lapse", // a time asked for that ran out: AI tells the customer and it closes (0061 as amended, 00679)
  "canary", // the ledger's own proof that it runs, every minute, judged by its newest done row (00526)
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/**
 * Every subscriber a delivery can name (event_subscriptions.subscriber, 00334, decision 0032): each is a verb in core's
 * SUBSCRIBERS that may run twice on one delivery and leave the same rows (`audit`, the relay's probe on real traffic, went in
 * 00456): `reach_out_booked` hands a booking on the appointments record to the booking door (00389), the first that acts; `owner_notice` tells the workspace of a hold from its event (decision 0043);
 * `consent_notice` tells it once on the bell when a customer asked to stop, from the consent event whichever door wrote
 * it (decision 0048, 00409); `visit_notice` tells it once on the bell when a booking arrived, from the appointment's
 * event whichever door wrote it (00410, S1-01); `team_notice` tells it once on the bell when a teammate joined, from
 * the seat's event (00410, S1-19); `freed_time_offer` offers a freed time to who asked and never booked (decision 0082);
 * `reply_draft` writes a held thread's reply ahead (0093, 00538); `visit_reminder` reminds a late booking (0118);
 * `occasion_enrol` enrols a person in the sequences an occasion starts (0119, 00599); `visit_arrival` stamps a visit
 * with the moment its booking arrived, so a day's bookings are counted from the record (0141, 00647); the form_entry_*
 * three do what a website's form entry owes, each on its own (00675). */
export const EVENT_SUBSCRIBERS = [
  "reach_out_booked",
  "owner_notice",
  "consent_notice",
  "visit_notice",
  "team_notice",
  "freed_time_offer",
  "reply_draft",
  "visit_reminder",
  "occasion_enrol",
  "visit_arrival",
  "form_entry_note",
  "form_entry_notice",
  "form_entry_confirm",
] as const;
export type EventSubscriber = (typeof EVENT_SUBSCRIBERS)[number];

/**
 * `fired` means CLAIMED, not finished: claim_due_jobs() sets it with a lease,
 * and the tick moves the job to `done` or `failed` when its handler returns or
 * throws. A job still `fired` past its lease is one whose run never reported
 * back, and the next claim takes it again (packages/jobs/src/ledger.ts).
 */
export const JOB_STATES = ["scheduled", "fired", "done", "canceled", "failed"] as const;
export type JobState = (typeof JOB_STATES)[number];
