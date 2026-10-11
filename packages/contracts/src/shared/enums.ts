/**
 * Closed sets shared with the database CHECK constraints. Each is held to its
 * column at compile time by schema-sets.ts, against sets generated from the
 * database itself (tooling/scripts/gen/schema-sets.mjs).
 */
export const TENANT_STATUSES = ["active", "paused", "test"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const MEMBERSHIP_ROLES = ["owner", "operator", "partner", "viewer"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/* ---- Slice 1: Conversations ---- */

export const CHANNEL_KINDS = ["whatsapp", "voice", "sms", "email", "instagram"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/**
 * How sure the door that kept an identity was of it (decision 0034, 00342): observed, they wrote to us on that wire;
 * asserted, a member typed it; found, the finder or a feed named it. A stronger word replaces a weaker one, never the
 * reverse, and resolution prefers them in that order.
 */
export const IDENTITY_ASSURANCES = ["observed", "asserted", "found"] as const;
export type IdentityAssurance = (typeof IDENTITY_ASSURANCES)[number];

export const CONVERSATION_STATES = ["open", "needs_human", "snoozed", "archived"] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

export const MESSAGE_CHANNELS = ["whatsapp", "voice", "sms", "email", "system"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_SENDERS = ["customer", "ai", "human", "system"] as const;
export type MessageSender = (typeof MESSAGE_SENDERS)[number];

export const MESSAGE_TYPES = ["text", "template", "media", "call_summary", "note"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_STATUSES = ["received", "queued", "sent", "delivered", "read", "failed", "canceled"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const CONSENT_STATES = ["unknown", "opted_in", "opted_out"] as const;
export type ConsentState = (typeof CONSENT_STATES)[number];

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
 * A new kind arrives with its handler, its caller, the jobs.kind CHECK and
 * its lane (jobs.lane, 00281: which work a claim takes first), together.
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
   * One booking tool's notice read into an appointment (docs/plans/2026-10-07-bookings-arrive-by-email.md): the
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
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

/**
 * Every subscriber a delivery can name (event_subscriptions.subscriber, 00334, decision 0032): each is a verb in core's
 * SUBSCRIBERS that may run twice on one delivery and leave the same rows. `audit` does nothing but settle, so the
 * relay's lag is measured on real traffic; `reach_out_booked` hands a booking on the appointments record to the
 * booking door (00389), the first that acts; `owner_notice` tells the workspace of a hold from its event (decision 0043).
 */
export const EVENT_SUBSCRIBERS = ["audit", "reach_out_booked", "owner_notice"] as const;
export type EventSubscriber = (typeof EVENT_SUBSCRIBERS)[number];

/**
 * `fired` means CLAIMED, not finished: claim_due_jobs() sets it with a lease,
 * and the tick moves the job to `done` or `failed` when its handler returns or
 * throws. A job still `fired` past its lease is one whose run never reported
 * back, and the next claim takes it again (packages/jobs/src/ledger.ts).
 */
export const JOB_STATES = ["scheduled", "fired", "done", "canceled", "failed"] as const;
export type JobState = (typeof JOB_STATES)[number];

/**
 * Meta's account-level webhook fields (WABA). Each arrives as an event of kind
 * `channel.<field>`, so this list is also the one computed family of event
 * kinds; the edge's WABA_FIELDS is a Set of it.
 */
export const WABA_FIELDS = [
  "phone_number_quality_update",
  "account_update",
  "message_template_status_update",
  "account_review_update",
  "message_template_quality_update",
  "template_category_update",
  "phone_number_name_update",
] as const;
export type WabaEventKind = `channel.${(typeof WABA_FIELDS)[number]}`;

/**
 * Every event kind the product writes, and nothing it does not.
 *
 * Held to the emitters by tooling/scripts/tests/event-kinds.test.mjs, a
 * repo-wide lint: a kind here that nothing emits is a dead declaration, a
 * kind emitted that is not here is a row nobody can name. Both were true for
 * months (three dead, fourteen undeclared) before the lint existed.
 */
export const EVENT_KINDS = [
  "message.received",
  "message.sent",
  "contact.consent_changed",
  "usage.llm_tokens",
  "usage.wa_conversation",
  "ingest.allowlist_skip",
  /** The sender cannot receive a reply — a short code. Recorded, never answered. */
  "ingest.unreachable_sender",
  "message.send_failed",
  "message.send_blocked",
  "message.send_raced_cancel",
  /** An outbound chat message carrying the workspace's booking link has left (00313): { channel, sender }. */
  "booking_link.sent",
  "conversation.reopened",
  "conversation.pause_expired",
  "contact.erased",
  /** Two records of one person became one (00326, decision 0028): on the kept record, with what moved. */
  "contact.merged",
  /**
   * A door resolved who a person is (resolve_person, 00342, decision 0034): the outcome (new, matched, filled), how it
   * matched, what it filled and the doubt it raised; never the number or the address. Evidence, purged with the other
   * evidence kinds, and hidden from the activity log unless asked for by name: the record is contact.added.
   */
  "person.resolved",
  "setup.requested",
  "voice.provisioned",
  "line.answering",
  "line.failed",
  "line.released",
  "line.forwarding_verified",
  /**
   * Somebody at Chanlytics acted on a workspace they are not a member of.
   *
   * The back office's write half. Recorded BEFORE the action, and the action is
   * refused if it cannot be recorded: a cross-tenant write that nobody can be
   * held to is worse than one that did not happen. What happened next is the
   * line's own event, written by the edge, immediately after this one.
   */
  "platform.acted",
  /** The carriers answered: texting is on, the business is through, or it came back. */
  "line.texting_on",
  "line.texting_approved",
  "line.texting_rejected",
  /** The business on record for the carriers, saved or changed. */
  "business.recorded",
  /** The workspace's listing on Google: linked, removed, and a read that found new reviews or ratings. */
  "google.linked",
  "google.unlinked",
  "google.reviews",
  /** The owner's Business Profile: connected, disconnected, and a review answered from here. */
  "google.connected",
  "google.disconnected",
  "google.replied",
  // An automatic review reply written and not posted: it named a price or money (contracts autoReplyHold).
  "google.reply_held",
  "workspace.created",
  /** The owner's controls changed: which config fields moved (never their values); a policy row's class, mode and the limit keys that moved. */
  "settings.changed",
  "policy.changed",
  "billing.updated",
  "billing.paused",
  "billing.resumed",
  /** A call: the row (00007) and the seconds it cost. */
  "call.recorded",
  /** A call ended in a transfer to a person (00312): { answered }, whether they picked up. */
  "call.transferred",
  "usage.voice_seconds",
  /** The assistant's model usage, per turn (ask-gateway). */
  "usage.ask_tokens",
  /** Retell's webhook: every delivery and every refused signature, kept thirty days (00038). */
  "webhook.auth",
  "webhook.delivery",
  /** A person who came from the calendar or a hand, not from a message (00053). */
  "contact.added",
  /** A person renamed or annotated at the desk (00054), or given an email address (00125). */
  "contact.named",
  "contact.noted",
  /** A note changed, taken away, or the receptionist's suggestion kept or dismissed (00157, 0007). Never the words. */
  "contact.note_changed",
  "contact.note_removed",
  "contact.note_suggested",
  "contact.note_kept",
  "contact.note_dismissed",
  "contact.note_done",
  "contact.note_undone",
  "contact.email_set",
  /** A person's proposal link set or cleared at the desk (00154). Never the address. */
  "contact.proposal_set",
  /** A person's address stopped being sent to: a permanent bounce, a complaint, or the provider's own list (00126). The reason, never the address. */
  "contact.email_suppressed",
  /** An inbound the router could not place on any workspace. */
  "ingest.unroutable",
  /** A reply skipped because its veto window had already been spent. */
  "policy.veto_window_skipped",
  /** The sweep woke a snooze whose time had passed (00082). */
  "conversation.snooze_expired",
  /** A handover's reason was replaced by another while it was open (00308): { from, to }, reasons only, never the words. */
  "escalation.changed",
  /** A broadcast finished, with its tally; a playbook made a run. */
  "broadcast.sent",
  /**
   * A broadcast stopped before it was done, or never went (state `failed`): its failure code and how many it reached
   * first (contracts BROADCAST_FAILURES), from every place a run is failed. A finished run was on the ledger and a
   * stopped one was not (the 4 Oct wiring review, P2 5).
   */
  "broadcast.stopped",
  "playbook.run",
  /** A WhatsApp number connected through Embedded Signup (admin/whatsapp/connect). */
  "channel.connected",
  /** A WhatsApp number's quality rating, read on a clock, changed (00315): { from?, to }. Meta's own news of it is channel.phone_number_quality_update. */
  "channel.quality_rating",
  /** What Meta holds about a WhatsApp number (may it send, and what stands in the way) changed: read at connection, on a clock or when an owner asks (00338): { from?, to }, the word of can_send only. */
  "channel.standing",
  /** An owner gave the workspace its email address, or changed the name beside it (00129). Who, never the address. */
  "mailbox.created",
  "mailbox.renamed",
  /** A gate paused the workspace's offers by email (complaints or bounces over their limits), and the back office turned them back on (00299). The reason, never an address. */
  "mailbox.offers_paused",
  "mailbox.offers_resumed",
  /** A workspace's own sending domain (Reach out, 00175): added, verified, held by the domains clock, sending again,
   * removed. The host and the reason, never the provider's id. */
  "sending_domain.added",
  "sending_domain.verified",
  "sending_domain.held",
  "sending_domain.released",
  /** The owner resumed a domain held for its bounces or a complaint (00176): 30 a day again. */
  "sending_domain.resumed",
  "sending_domain.removed",
  /** A lead search's round started, waited, or ended with one of the nine endings (00140). */
  "lead.round",
  /** An ask no source card fits, logged as demand (§0.3): the words asked, never a place. */
  "lead.no_card",
  /** A lead worked: its stage moved, the owner said they sent the email, a call happened, it became a person, or it was not a fit (release B). */
  "lead.stage",
  "lead.emailed",
  "lead.call",
  "lead.converted",
  "lead.not_a_fit",
  /**
   * A lead was set aside as stale (archived, closed stale), by the nightly purge or by hand (00309): { stage, reason, from },
   * written on the move into it, so a lead restored and set aside again writes a second. `from` is the stage the lead left to be
   * set aside, null when it was already archived and only its reason changed (nothing moved: not an exit). The purge writes only
   * this event; by hand (lead_set_stage to archived with the reason stale) the move also writes its lead.stage, so a count of
   * exits takes one per lead and moment, never both kinds. Its own kind, not lead.stage, so the Activity log is not filled with
   * one line per lead.
   */
  "lead.set_aside",
  // A deal (0004): written by deal_record, one kind per stage; record kinds, kept.
  "deal.proposed",
  "deal.won",
  "deal.lost",
  "deal.ended",
  // A partner (0012): the workspace was made through a partner's link and the partner joined its team, or the code
  // the link left named no partner who could be credited (unknown, paused, or the caller's own).
  "partner.attributed",
  "partner.code_ignored",
  // The ledger (0012, P3): a share written from a paid invoice, a refund's or a dispute's effect on it, and the
  // standing the sweep decided for a workspace once it had paid.
  "partner.earned",
  "partner.reversed",
  "partner.standing_set",
  // A payout sent by hand (0012, P5), on each workspace it came from, with that workspace's part.
  "partner.paid",
  // A workspace a partner set up for a business (0016): handed to its owner (again, on a resend), accepted, declined.
  "partner.handover_sent",
  "partner.handover_accepted",
  "partner.handover_declined",
  // An existing workspace asks a partner to join it (0020): asked (again, on a second ask), taken back, joined, declined.
  "partner.invited",
  "partner.invite_withdrawn",
  "partner.invite_accepted",
  "partner.invite_declined",
  // A reply to a reach-out, read (00222, Reach out Part 5): what it meant ({ intent, claim, reread, unread }), on the lead.
  "reach_out.replied",
  // A reply read as no, undone by a member within seven days (00222 reach_out_reply_undo).
  "reach_out.reply_undone",
  // A workspace reached an activation milestone for the first time (contracts ACTIVATION_MILESTONES): the funnel's rows.
  "workspace.activated",
  /**
   * An appointment of the record changed (decision 0002), never its title: the calendar's hourly read writes { change:
   * added | moved | vanished | back, source, starts_at } (appointments_feed_sync, 00348), and every other writer's row
   * { change: added | confirmed | cancelled | moved, ... } in its own transaction (appointments_note_change, 00389). On
   * the appointment; hidden from the activity log unless asked for by name, since a calendar read writes one per
   * appointment.
   */
  "appointment.changed",
  /**
   * What a member did, or the receptionist, that neither ledger kept (the activity log's review, 8 Oct 2026). Each
   * names the member in its data (`by`), as the settings' and the notes' kinds do, and none carries a customer's words.
   *
   * A thread handed to the team: a new open escalation ({ reason }), on the conversation. Every path that flags a
   * thread writes it through one door, with the hold, in one transaction (escalation_open, 00388), once per hold; a
   * reason that changes under an open hold is escalation.changed.
   */
  "escalation.opened",
  /** A person accepted an invitation and joined the workspace ({ by, role }), on the invitation. */
  "member.joined",
  /** A playbook, or a reach-out's chain, edited ({ name, by, fields }: which parts moved, never their words). */
  "playbook.changed",
  /** A message sent to WhatsApp for approval, and one deleted from the Library ({ name, language, by }). */
  "template.submitted",
  "template.removed",
  /** The owner switched what the workspace answers on or off ({ capability, by }: calls, WhatsApp or texts). */
  "capability.activated",
  "capability.deactivated",
  /** A person left the workspace by deleting their account ({ by, how }): the seat is gone, and so is its name. */
  "member.left",
  /** "Stop writing to them" on a reach-out's lead, and a held reach-out email decided ({ decision, by }), on its run. */
  "reach_out.lead_stopped",
  "reach_out.send_decided",
  /** A place in Needs review kept (it counts against the month), left out, or put back ({ by, search_id }), on the lead. */
  "lead.kept",
  "lead.excluded",
  "lead.put_back",
  /** A search renamed ({ name, by }) or removed ({ kept, archived, by }), on the search. */
  "lead.search_renamed",
  "lead.search_removed",
  /** Two records a doubt named, said to be two people ({ by }), on the person. */
  "contact.kept_apart",
  /** The number a business keeps set to forward to its line ({ carrier, mode, by }: never the number), on the line. */
  "line.forwarding_set",
  /**
   * A booking tool's email, read into the calendar (packages/jobs booking-read): a visit booked, moved or cancelled
   * ({ source: "booking_email", tool }), on the appointment. Shown, where appointment.changed (the calendar's hourly
   * read) is a kept record: an email is one thing that happened, said once.
   */
  "appointment.booked",
  "appointment.moved",
  "appointment.cancelled",
  /** The owner answered from the WhatsApp Business app, so the receptionist stepped back until `until` (recordEchoAndPause). */
  "conversation.owner_replied",
  /** Stripe's own news of a payment and of a trial about to end (billing.ts notePayment, noteTrialEnding): never an amount. */
  "billing.payment_failed",
  "billing.paid",
  "billing.trial_ending",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number] | WabaEventKind;

/** Customer texts that mean opt-out (webhook consent handling, §4). */
export const OPT_OUT_PATTERN = /^\s*(stop|baja|unsubscribe|alto)\s*[.!]?\s*$/i;

/**
 * What stops EVERYTHING when a person writes it by email: the same STOP words, but not UNSUBSCRIBE. An unsubscribe is
 * not a STOP (the spec's decision 12): by email it ends offers by email and leaves their visit messages
 * (EMAIL_UNSUBSCRIBE_PATTERN), exactly as the link's page does. A WhatsApp message keeps OPT_OUT_PATTERN, which reads it
 * as a STOP there.
 */
export const EMAIL_STOP_PATTERN = /^\s*(stop|baja|alto)\s*[.!]?\s*$/i;

/**
 * An email that asks to stop the offers and nothing more: "unsubscribe", "please unsubscribe me", "desuscribirme", the
 * whole of the words they wrote. It goes through the same door as the unsubscribe link (set_email_marketing).
 */
export const EMAIL_UNSUBSCRIBE_PATTERN = /^\s*(?:please\s+)?(?:unsubscribe(?:\s+me)?|desuscribir(?:me)?)\s*[.!]?\s*$/i;

/**
 * The carriers' opt-out words, for a TEXTING LINE only.
 *
 * Twilio's default list (STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE,
 * OPTOUT, per the FCC ruling) blocks the number at the carrier whatever our
 * record says, so on SMS our record must agree with theirs: a QUIT we did not
 * recognise left a customer opted in on our side and unreachable on the
 * carrier's, with the next send bouncing and an owner told a delivery failed.
 *
 * WhatsApp has no carrier rule, and its appointment templates carry "Cancel"
 * and "End" buttons that mean a booking, not a goodbye -- so these words are
 * never applied to a WhatsApp message. Whole-message only: "stop by at 4?" is
 * a booking on either channel.
 */
export const SMS_OPT_OUT_PATTERN =
  /^\s*(stop|stopall|end|cancel|quit|unsubscribe|revoke|optout|baja|alto)\s*[.!]?\s*$/i;

/**
 * Customer texts that mean opt back IN — the way out of an opt-out.
 *
 * Without this, enforcing opt-out silences someone permanently: they text STOP
 * once and nothing they ever send again gets a reply, including "start". Only
 * these exact words count. A looser test (any message means they're back)
 * would lift the block the moment they said anything, which is the same as not
 * having one — and "sí"/"yes" is deliberately excluded because it is how
 * people answer an ordinary question, not how they rejoin a list.
 */
// NOT what the wire reads any more. The inbound reading takes the two split
// patterns below, one per question, because a message that answers both is one
// opt-in enrolling a person in two programs -- which the carriers refuse a
// campaign for (30913), and which the message flow then had to confess. Kept
// for the readers that want "any opt-in word at all".
export const OPT_IN_PATTERN = /^\s*(start|unstop|resume|alta|yes offers|si ofertas|s\u00ed ofertas)\s*[.!]?\s*$/i;

/**
 * The words that answer the MARKETING question, and only that one.
 *
 * THE DEFECT THIS SPLITS. OPT_IN_PATTERN above treats "YES OFFERS" and "START"
 * as the same event: both set the single `consent` column, which then gates
 * appointment reminders, the receptionist's replies and promotional broadcasts
 * alike. So one message gave one yes that covered three purposes -- which is
 * carrier error 30913 exactly: "marketing consent was combined with other
 * consents. Marketing consent must be collected separately."
 *
 * These words say offers, in both languages this product speaks. Nothing here
 * is a bare "yes": that is how a person answers an ordinary question, and it
 * must never be read as express written consent to be marketed to.
 */
export const MARKETING_OPT_IN_PATTERN = /^\s*(yes offers|si ofertas|s\u00ed ofertas)\s*[.!]?\s*$/i;

/**
 * The words that answer the CONVERSATIONAL question: messages about your own
 * visit, and the receptionist writing back.
 *
 * START/UNSTOP/RESUME are the carriers' own standard words and are declared to
 * them in the campaign's opt-in keywords. ALTA is their Spanish equivalent.
 */
export const CONVERSATION_OPT_IN_PATTERN = /^\s*(start|unstop|resume|alta)\s*[.!]?\s*$/i;

/** Which question a customer's message answers, or null when it answers neither. */
export function optInPurposeOf(text: string): "conversational" | "marketing" | null {
  if (MARKETING_OPT_IN_PATTERN.test(text)) return "marketing";
  if (CONVERSATION_OPT_IN_PATTERN.test(text)) return "conversational";
  return null;
}

/**
 * The phrase a customer sends to say yes to offers. Unambiguous on purpose,
 * so it can ride a wa.me link or a QR at the desk without "yes" to an
 * ordinary question ever counting; the ingest records it as their own
 * message, the strongest consent there is.
 */
export const OFFERS_OPT_IN_PHRASES = { en: "YES OFFERS", es: "SI OFERTAS" } as const;

/**
 * What a wa.me link takes of a number: its digits, with no plus, spaces or brackets, from the number as E.164 or as it is shown, or
 * null where there are too few to be one. The one place that says it: the links below (waMeLink) and the Connections row's "try it" note.
 */
export function waMeDigits(number: string | null | undefined): string | null {
  const digits = String(number ?? "").replace(/\D/g, "");
  return digits.length < 8 ? null : digits;
}

/** WhatsApp opened on a number, with words ready to send where there are any; null without a usable number. */
export function waMeLink(number: string | null | undefined, text?: string): string | null {
  const digits = waMeDigits(number);
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** WhatsApp opened on the workspace's number with the phrase ready to send; null without a usable number. */
export function optInLink(
  numberE164: string | null | undefined,
  phrase: string = OFFERS_OPT_IN_PHRASES.en,
): string | null {
  return waMeLink(numberE164, phrase);
}

/* ---- Slice 2: Inbox ---- */

export const ESCALATION_REASONS = [
  "human_token",
  "non_text",
  "refusal",
  "rate_cap",
  "policy_block",
  "send_failed",
  "deadman",
  "brain_error",
  "manual",
  "opt_out",
  "state_unavailable",
  /** Delivered so late that an automated reply would arrive out of nowhere. */
  "stale",
  /** The owner set the receptionist to Ask or Never for THIS person; the
   *  thread is theirs to answer. A choice about one customer, never a
   *  workspace setting. */
  "person_hold",
  /** The workspace's day of model tokens is spent (limits.max_llm_tokens_day). */
  "budget",
  /** A booking or a service/pricing question, with that class set to Ask me first on the Autonomy pane: a person answers. */
  "policy_ask",
  /** The phone receptionist could not finish the call: a person calls them back. What to do rides in the details. */
  "callback",
  /** The workspace is paused (billing): calls only take a message and messages wait for a person, until it resumes. */
  "paused",
  /** A text arrived on a line the carriers have not approved for texting yet: kept, a person answers. */
  "carriers",
  /** An email a person must read before anyone answers it (00127). */
  "email_review",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const ESCALATION_STATES = ["open", "resolved"] as const;
export type EscalationState = (typeof ESCALATION_STATES)[number];

export const DECISION_VERBS = [
  "approve",
  "edit",
  "decline",
  "snooze",
  "wake",
  "take_over",
  "hand_back",
  "resolve",
  "archive",
  "reply",
  "cancel_send",
  "pause_agent",
  "resume_agent",
  /**
   * What one member can do to another.
   *
   * The ledger recorded every conversation verb and nothing about the team —
   * the one table where "who did this" is hardest to reconstruct afterwards
   * and matters most. Promoting someone to owner hands them billing, the
   * ability to remove everyone else, and the receptionist's voice.
   *
   * These must stay in step with decisions_verb_check (migration 00023): the
   * database rejects a verb this list allows, and a verb the database allows
   * but this omits cannot be written by any typed caller.
   */
  "invite",
  "revoke_invite",
  "change_role",
  "remove_member",
  /**
   * The only irreversible verb. privacy.html promises deletion on verified
   * request; this is the record that it happened, on subject_type 'contact',
   * and it survives the data it destroyed. Written by the owner (actor_type
   * 'user'), and again by the route for a leg that finished after the rows
   * were gone — the storage sweep.
   */
  "erase",
  /**
   * Two records of one person became one (merge_people, 00326; decision 0028). On subject_type 'contact', the kept
   * record; the payload names the merged one and counts what moved. Owner only, and never undone.
   */
  "merge",
  /**
   * A sentence handed to the phone receptionist mid-call, heard by it alone
   * and worked into its next answer (Retell update-live-call). Subject
   * 'call'. The ledger keeps the words: they are the operator's, and they
   * changed what a customer was told.
   */
  "whisper",
  /**
   * A business connected its own channel (Embedded Signup): subject
   * 'channel', payload the number, the WABA and the registration outcome.
   * The one verb whose consequence is a credential in Vault.
   */
  "connect_channel",
  /**
   * A customer's answer about marketing messages, recorded by the person
   * who heard it: subject 'contact', payload the answer, how it was given,
   * and what it was before. The record a broadcast stands on.
   */
  "consent_change",
  /**
   * A broadcast: one message, on the channels it holds, to the people who said
   * yes. The decision to send (subject 'broadcast', payload the message, the
   * audience and the count) and the decision to stop one.
   */
  "send_broadcast",
  "cancel_broadcast",
  /** A playbook started or paused: subject 'playbook'. Its runs are send_broadcast rows. */
  "start_playbook",
  "pause_playbook",
  /**
   * A playbook changed in place (the change_playbook door): its name, hour, cap, gap or cadence. Subject 'playbook'; the
   * payload names what changed. A pause or a resume stays pause_playbook or start_playbook.
   */
  "change_playbook",
  /**
   * An answer to a review on Google, in the business's own words: subject
   * 'review' (the row's id), payload the words and when Google took them.
   * Replaces the previous answer; Google keeps one per review.
   */
  "reply_review",
  /**
   * A copy of the workspace's data left the building: everyone as a CSV, a
   * thread, a call, or the whole workspace. Subject "workspace" for the two
   * that carry everyone; the thread's or the call's own row for the others.
   * The one verb an auditor asks about that the ledger did not keep.
   */
  "export",
  /** A call in progress ended from the Live page (00118). Passing one to the business is take_over, the Inbox's word for the same intent. */
  "end_call",
  "record_deal",
  /**
   * A list's life (00169, decision 0009): made, renamed, its rule changed, people put on or taken off, archived (a
   * playbook or another list depends on it), restored, deleted. Subject 'list'; the payload says what changed.
   */
  "make_list",
  "rename_list",
  "change_list_rule",
  "add_to_list",
  "drop_from_list",
  "archive_list",
  "restore_list",
  "delete_list",
  /** A client list brought in from a spreadsheet (00170): one row per part of fifty, subject the workspace. */
  "import",
  /**
   * A member opened a call's recording (00277): subject 'call', written by recording_opened as the member, once per
   * member per call per hour. A customer's voice left the building to someone's speakers; who listened is the audit.
   */
  "open_recording",
  /**
   * A member said what became of a visit (00397 mark_visit, decision 0002 step 8): kept, missed or cancelled, subject
   * 'appointment' (its row), payload from, to, the row's source, its start and the person it is for.
   */
  "mark_visit",
] as const;
export type DecisionVerb = (typeof DECISION_VERBS)[number];

export const DECISION_SUBJECTS = [
  "conversation",
  "escalation",
  "draft",
  "lead",
  "message",
  "agent",
  "membership",
  "invitation",
  "contact",
  "call",
  "channel",
  "broadcast",
  "playbook",
  "review",
  /** The workspace itself: an export of everyone, or of everything. Its id is the tenant's. */
  "workspace",
  "deal",
  /** One of the workspace's own lists (segments): its life, in the ledger (00169). */
  "list",
  /** A visit the record keeps (00345): what a member said became of it (00397). */
  "appointment",
] as const;
export type DecisionSubject = (typeof DECISION_SUBJECTS)[number];

export const ACTOR_TYPES = ["user", "ai", "system", "owner_phone"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const TEMPLATE_STATUSES = ["approved", "pending", "rejected", "paused", "disabled"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
