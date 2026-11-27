/** The closed sets of the ledger's: every event kind the product writes, Meta's account fields among them. Held to their columns as every set is (shared/enums.ts). */
/**
 * Meta's account-level webhook fields (WABA). Each arrives as an event of kind `channel.<field>`, so this list is also
 * the one computed family of event kinds; the edge's WABA_FIELDS is a Set of it.
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
 * Held to the emitters by tests/event-kinds.test.mjs, a
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
  /** An owner's ad account (00649): connected, the one of two chosen, its standing moved, access taken back, let go. */
  "ad_account.connected",
  "ad_account.chosen",
  "ad_account.standing",
  "ad_account.revoked",
  "ad_account.disconnected",
  "ad.state_changed",
  "ad.paused",
  "ad.resumed",
  "ad.press_refused",
  /** An ad turned on by its owner (00666): the press, the launch made at Meta and switched on, or stopped part way. */
  "ad.turned_on",
  "ad.made",
  "ad.setup_stopped",
  /** An owner changed a running ad made here (Meta took its new total, last day or miles), or ended it for good. */
  "ad.change_asked",
  "ad.changed",
  "ad.ended",
  "file.added",
  "file.changed",
  "file.kept",
  "file.posted",
  "file.removed",
  "file.restored",
  "file.set_aside",
  "file.unposted",
  /**
   * A note for the receptionist suggested from an owner's correction, and the member's answer (00448, decision 0063):
   * { suggestion_id, source }, never the words; a Keep's note is the settings.changed beside it.
   */
  "settings.fact_suggested",
  "settings.fact_kept",
  "settings.fact_dismissed",
  // A change kept from a rehearsal (00481, decision 0069): { rehearsal_id, op, field, version, by }, never the words.
  "settings.fix_kept",
  // What Ask remembers (00470, decision 0070): a line kept, changed or forgotten, never its words; a journal day, a morning.
  "ask.memory_kept",
  "ask.memory_changed",
  "ask.memory_forgotten",
  "ask.journal_written",
  "ask.morning_claimed",
  "policy.changed",
  "billing.updated",
  "billing.paused",
  "billing.resumed",
  /** A call: the row (00007) and the seconds it cost. */
  "call.recorded",
  /** A call ended in a transfer to a person (00312): { answered }, whether they picked up. */
  "call.transferred",
  /** A call that asked nobody (decision 0138): turned away before it was answered, or let pass without a call back; { reason }. */
  "call.screened",
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
  /**
   * Where a person works (0052, 00413): linked to a lead (its first email or call, a reply that cited ours, a member's
   * hand), or not at it any more: { lead_id, via, by? }, never a name.
   */
  "contact.business_linked",
  "contact.business_unlinked",
  "contact.noted",
  /** A note changed, taken away, or the receptionist's suggestion kept or dismissed (00157, 0007). Never the words. */
  "contact.note_changed",
  "contact.note_removed",
  "contact.note_suggested",
  "contact.note_kept",
  "contact.note_dismissed",
  "contact.note_done",
  "contact.note_undone",
  /** The member a note is for said Got it (0052): { note_id, by }, never the words. */
  "contact.note_seen",
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
  /**
   * The door found this thread already handed to a person and the same reason standing (00538): they wrote again on a
   * held thread, so its draft answers an older message. { reason }, on the conversation. Evidence: nothing is told of it.
   */
  "escalation.refreshed",
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
  /** An Instagram account disconnected and let go, written by its door (00677): { kind, login, account_id, username, by }. */
  "channel.disconnected",
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
  /** A mailbox the business connected (00423, decision 0056), by its address and the reason, never its token; and
   * what the workspace said of a sender of its mail (00483: address or domain, and the verdict, never the address). */
  "mailbox_connection.connected",
  "mailbox_connection.signed_out",
  "mailbox_connection.held",
  "mailbox_connection.resumed",
  "mailbox_connection.paused",
  "mailbox_connection.provider_wanted",
  "mailbox_connection.unpaused",
  "mailbox_connection.removed",
  "mailbox_connection.sender_sorted",
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
  /**
   * The ideas for a new search were written (00400: lead_suggestions_write), { how: "written" | "line", count, by_owner }:
   * "written" when the model's ideas were kept, with how many; "line" when the owner set the business line they are
   * written from, which asks for new ones. A record for Reports (how often ideas are written, whether owners rewrite
   * the line), never a line of the owner's Activity.
   */
  "lead.ideas_written",
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
  /** Ask's words for a message WhatsApp refused, kept so its editor opens on them ({ words, reason, by }); a draft. */
  "template.fix_written",
  /** The owner switched what the workspace answers on or off ({ capability, by }: calls, WhatsApp or texts). */
  "capability.activated",
  "capability.deactivated",
  /** A person left the workspace by deleting their account ({ by, how }): the seat is gone, and so is its name. */
  "member.left",
  /** "Stop writing to them" on a reach-out's lead, and a held reach-out email decided ({ decision, by }), on its run. */
  "reach_out.lead_stopped",
  "reach_out.send_decided",
  /** A lead's own email typed on their sheet, or the step's words put back (decision 0096; { step_id, kept, by }). */
  "reach_out.lead_words_changed",
  /**
   * Leads added to a list-fed reach-out ({ search_id, n, by }), and an add taken back ({ search_id, taken, leaving,
   * sent, by }), on the reach-out (00426).
   */
  "reach_out.lead_added",
  "reach_out.lead_taken_back",
  /** A place in Needs review kept (it counts against the month), left out, or put back ({ by, search_id }), on the lead. */
  "lead.kept",
  "lead.excluded",
  "lead.put_back",
  /** A lead put off in a pass of the pile: Later ({ search_id, by }), on the lead (00426). */
  "lead.later",
  /**
   * Who a company lead's reach-out writes to, chosen by its owner ({ person, checking, by }: the index of one of the people
   * its source named, and whether their address is being checked first), on the lead (00430 lead_addressee_choose).
   */
  "lead.addressee_chosen",
  /** A lead's name or city put right by its owner ({ name, city, again, by }, never the words), on the lead. */
  "lead.named",
  /** A search renamed ({ name, by }) or removed ({ kept, archived, by }), on the search. */
  "lead.search_renamed",
  "lead.search_removed",
  /**
   * A lead's own receptionist before they sign up (00497, decision 0079): made ({ preview_id, by }), on the lead; made
   * theirs ({ preview_id }) on the lead, and ({ by }) on the workspace that became theirs.
   */
  "preview.made",
  "preview.claimed",
  /** A sequence to leads set to add a search's new ready leads, or not ({ search_id, by }), on its first step (00459). */
  "reach_out.source_set",
  /** A sequence to leads set to try a business that never answered again after some days, or not ({ days, was, by }),
   *  on its first step (00608, decision 0120). */
  "reach_out.again_set",
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
  "appointment.lapsed", // a request that ran out, closed (00679): { told, starts_at, service, contact_id }
  /** The owner answered from the WhatsApp Business app, so the receptionist stepped back until `until` (recordEchoAndPause). */
  "conversation.owner_replied",
  /** Stripe's own news of a payment and of a trial about to end (billing.ts notePayment, noteTrialEnding): never an amount. */
  "billing.payment_failed",
  "billing.paid",
  "billing.trial_ending",
  /** A website's entry kept ({ form, owed }) and its ask settled ({ state }); a website's key made, changed or ended (00675). */
  "form_entry.accepted",
  "form_entry.asked",
  "form_key.set",
  /**
   * A post moved ({ from, to, place, by?, seen? }: post_moved, 00720), at every step of its making and sending and on its
   * owner's word; and a week's slot an approval left out, held with why ({ why, plan_id, by? }: plan_slots_hold).
   */
  "post.moved",
  "plan_slot.held",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number] | WabaEventKind;
