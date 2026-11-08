/** Activity: dtos. */
import type { PageInfo } from "../../shared/envelope";

/**
 * The activity log: both ledgers, in an owner's words.
 *
 * The decisions ledger says what a person did (or the receptionist, or the
 * system, on their behalf); the events ledger says what happened. Both have
 * existed since the first slice and neither was readable by an owner except
 * inside one person's timeline. One row shape, one sentence per kind, and
 * nothing of a payload but the few fields a sentence names -- the payloads
 * carry numbers, addresses and provider ids from every corner of the product
 * and none of that belongs on a screen by accident.
 */
export interface ActivityRowDto {
  id: string;
  at: string;
  /** Which ledger: a decision (somebody did) or an event (something happened). */
  source: "decision" | "event";
  /** The verb or the kind, as the ledger spells it. */
  kind: string;
  subject_type: string | null;
  subject_id: string | null;
  /** The member who did it, when a member did; null for the receptionist and the system. */
  actor_user_id: string | null;
  actor_type: string | null;
  /** The sentence. */
  text: string;
  /**
   * The family its emitter filed an event under (events.category: billing, contact, lead, ...), as it was written;
   * null for a decision, which has none. What says a row is about money (activity-rows.ts isActivityMoney).
   */
  category: string | null;
}

/** A member the log may be narrowed to: their user id, and the name the rows say. */
export interface ActivityMemberDto {
  id: string;
  name: string;
}

export interface ActivityPageDto {
  /**
   * The page's rows, newest first. A page is a hundred rows, and more where those fold to a handful of lines
   * (contracts activityLines): a burst of one kind is one line, and a page of one line is no page.
   */
  rows: ActivityRowDto[];
  /** Member id → the name to show (their name, else the address they signed in with). */
  actors: Record<string, string>;
  /**
   * What a row is about, by name: `<subject_type>:<subject_id>` → the person's name (their own, their thread's or
   * their call's), a list's, a broadcast's or a playbook's. A subject with no name read is absent, and its row says
   * its sentence alone.
   */
  subjects: Record<string, string>;
  /**
   * Where a row opens, for the subjects whose page had to be looked up: `<subject_type>:<subject_id>` → a route without
   * its slash (a message's or an escalation's thread, a deal's person, a visit's panel on its day: `calendar/<day>:a-<id>`,
   * the day by the workspace's clock, a template's message in the Library: `campaigns/messages/<name>`). Every other subject's door is contracts activityDoor's, from the row alone.
   */
  doors: Record<string, string>;
  /** The workspace's members, for the picker of who did it; empty where the roster could not be read. */
  members: ActivityMemberDto[];
  /**
   * Where this page ended, not how far down it started: `next_cursor` is
   * `"<created_at>|<row id>"` and is what asks for the page behind it. An
   * offset made every page read the whole log above it (server/activity.ts).
   */
  page: PageInfo;
  /** The kinds the page may filter by, both ledgers', for the picker. */
  kinds: string[];
}

export const WORDS: Record<string, string> = {
  // decisions
  approve: "Approved a reply",
  edit: "Edited a reply",
  decline: "Declined a reply",
  snooze: "Snoozed a thread",
  wake: "Woke a thread",
  take_over: "Took over a thread",
  hand_back: "Handed a thread back to the receptionist",
  resolve: "Resolved an escalation",
  archive: "Archived a thread",
  reply: "Replied from the dashboard",
  cancel_send: "Stopped a reply before it sent",
  pause_agent: "Paused the receptionist",
  resume_agent: "Resumed the receptionist",
  invite: "Invited a member",
  revoke_invite: "Withdrew an invitation",
  change_role: "Changed a member's role",
  remove_member: "Removed a member",
  erase: "Erased a person",
  merge: "Merged two records of one person",
  whisper: "Whispered to the phone receptionist",
  connect_channel: "Connected a channel",
  consent_change: "Recorded a consent answer",
  send_broadcast: "Sent a message once",
  cancel_broadcast: "Canceled a send",
  start_playbook: "Started a campaign",
  pause_playbook: "Paused a campaign",
  change_playbook: "Changed a campaign",
  reply_review: "Replied to a Google review",
  export: "Exported data",
  import: "Imported people from a spreadsheet",
  open_recording: "Listened to a call's recording",
  end_call: "Ended a call",
  record_deal: "Recorded a deal",
  make_list: "Made a list",
  rename_list: "Renamed a list",
  change_list_rule: "Changed who is on a list",
  add_to_list: "Put people on a list",
  drop_from_list: "Took people off a list",
  archive_list: "Archived a list",
  restore_list: "Restored a list",
  delete_list: "Deleted a list",
  mark_visit: "Said whether they came",
  change_step: "Changed a sequence's step",
  leave_sequence: "Took people out of a sequence",
  return_to_sequence: "Put people back in a sequence",
  make_sequence: "Made a sequence",
  discard_sequence: "Let a sequence go",
  answer_booking_request: "Answered a request to book",
  not_a_customer: "Said it was not a customer",
  reply_anyway: "Said it was a customer after all",
  // events
  "message.received": "A customer wrote",
  "message.sent": "A message went out",
  "message.send_failed": "A message could not be sent",
  "message.send_blocked": "A message was held at the wire",
  "message.send_raced_cancel": "A send raced a cancel",
  "contact.consent_changed": "A consent answer changed",
  "contact.added": "A person was added",
  "contact.named": "A person was named",
  "contact.business_linked": "A person was linked to a business",
  "contact.business_unlinked": "A person was unlinked from a business",
  "contact.noted": "A note was written",
  "contact.note_changed": "A note was changed",
  "contact.note_removed": "A note was taken away",
  "contact.note_seen": "A note was read by the one it was for",
  "contact.note_suggested": "The receptionist suggested a note",
  "contact.note_kept": "A suggested note was kept",
  "contact.note_dismissed": "A suggested note was dismissed",
  "contact.note_done": "A step was done",
  "contact.note_undone": "A step was opened again",
  "contact.email_set": "A person's email address changed",
  "contact.proposal_set": "A person's proposal link changed",
  // A deal is a record (0004): each move of one, in the owner's words.
  "deal.proposed": "A proposal went out",
  "deal.won": "A person became a client",
  "deal.lost": "A person passed on a proposal",
  "deal.ended": "An engagement ended",
  "contact.email_suppressed": "A person's email address stopped being sent to",
  "contact.erased": "A person was erased",
  "contact.merged": "Two records of one person became one",
  "person.resolved": "A door resolved who a person is",
  "appointment.changed": "A booking on the calendar changed",
  // Retired with the Blob store (00151): nothing writes it, but rows written before survive in `events` and still need their sentence.
  "contact.blob_erased": "A person's stored thread was erased",
  "conversation.reopened": "A thread reopened",
  "conversation.pause_expired": "A pause ended",
  "conversation.snooze_expired": "A snooze ended",
  "escalation.changed": "A handover's reason changed",
  "escalation.refreshed": "They wrote again on a held thread",
  "escalation.opened": "A thread was handed to the team",
  "call.recorded": "A call was recorded",
  "call.transferred": "A call was passed to a person",
  "booking_link.sent": "The booking link was sent",
  "broadcast.sent": "A run finished",
  "broadcast.stopped": "A run stopped",
  "playbook.run": "A campaign ran",
  "playbook.changed": "A campaign was edited",
  "template.submitted": "A message was sent to WhatsApp for approval",
  "template.removed": "A message was deleted from Messages",
  "member.joined": "Joined the workspace",
  "member.left": "Left the workspace",
  "reach_out.lead_stopped": "A sequence stopped writing to a lead",
  "reach_out.send_decided": "A held email to a lead was decided",
  "reach_out.lead_words_changed": "An email to a lead was changed for that lead",
  "reach_out.lead_added": "Leads were added to a sequence",
  "reach_out.lead_taken_back": "Leads were taken back from a sequence",
  "lead.kept": "A lead was kept from Needs review",
  "lead.excluded": "A lead was left out of Needs review",
  "lead.put_back": "A lead was put back in Needs review",
  "lead.later": "A lead was put off for later",
  "lead.addressee_chosen": "A company's sequence was set to write to someone else",
  "lead.search_renamed": "A search was renamed",
  "lead.search_removed": "A search was removed",
  "reach_out.source_set": "A sequence was set to add a search's new leads, or to stop",
  "contact.kept_apart": "Two records were kept as two people",
  "line.forwarding_set": "Call forwarding was set up",
  "appointment.booked": "A booking arrived by email",
  "appointment.moved": "A booking was changed by email",
  "appointment.cancelled": "A booking was cancelled by email",
  "conversation.owner_replied": "The owner replied from the WhatsApp Business app, and the receptionist stepped back",
  "billing.payment_failed": "A payment did not go through",
  "billing.paid": "A payment went through",
  "billing.trial_ending": "The trial ends in three days",
  "capability.activated": "Answering was switched on",
  "capability.deactivated": "Answering was switched off",
  "channel.quality_rating": "A WhatsApp number's quality rating changed",
  // Meta's own news of the account (contracts WABA_FIELDS), one kind per field: said as what Meta did, never as its field.
  "channel.phone_number_quality_update": "Meta changed a WhatsApp number's quality",
  "channel.account_update": "Meta updated the WhatsApp account",
  "channel.message_template_status_update": "Meta reviewed a message",
  "channel.account_review_update": "Meta reviewed the WhatsApp account",
  "channel.message_template_quality_update": "Meta changed a message's quality",
  "channel.template_category_update": "Meta changed a message's category",
  "channel.phone_number_name_update": "Meta reviewed a WhatsApp number's name",
  "channel.standing": "A WhatsApp number's standing with Meta changed",
  "setup.requested": "Setup was requested",
  "voice.provisioned": "The phone receptionist was provisioned",
  "line.answering": "A line started answering",
  "line.failed": "A line failed",
  "line.released": "A line was released",
  "line.forwarding_verified": "Forwarding was verified",
  "line.texting_on": "Texting turned on",
  "line.texting_approved": "The carriers approved texting",
  "line.texting_rejected": "The carriers sent the registration back",
  "business.recorded": "The business record was saved",
  "platform.acted": "Chanlytics acted on the workspace",
  "google.linked": "A Google listing was linked",
  "google.unlinked": "The Google listing was unlinked",
  "google.reviews": "New Google reviews were read",
  "google.connected": "Google Business Profile was connected",
  "google.disconnected": "Google Business Profile was disconnected",
  "google.replied": "A Google review was answered",
  "google.reply_held": "A review reply was written and not posted",
  "mailbox.created": "The workspace's email address was set up",
  "mailbox.renamed": "The name on the workspace's email changed",
  "mailbox.offers_paused": "Offers by email were paused",
  "mailbox.offers_resumed": "Offers by email were turned back on",
  "mailbox_connection.connected": "A mailbox to write from was connected",
  "mailbox_connection.signed_out": "A mailbox to write from was signed out",
  "mailbox_connection.held": "A mailbox to write from was held",
  "mailbox_connection.resumed": "A mailbox to write from was resumed",
  "mailbox_connection.paused": "A mailbox to write from was paused",
  "file.added": "A photo was added",
  "file.changed": "A photo was changed",
  "file.kept": "Photos were kept",
  "file.posted": "A post went on the Google profile",
  "file.removed": "A photo was deleted",
  "file.set_aside": "Photos from a listing were set aside",
  "file.unposted": "A post came off the Google profile",
  "mailbox_connection.unpaused": "A mailbox to write from writes again",
  "mailbox_connection.removed": "A mailbox to write from was removed",
  "mailbox_connection.sender_sorted": "Who sends your mailbox automated mail changed",
  "channel.connected": "A WhatsApp number was connected",
  "lead.stage": "A lead moved",
  "lead.emailed": "A lead was marked as emailed",
  "lead.call": "A call to a lead was logged",
  "lead.not_a_fit": "A lead was marked not a fit",
  "lead.round": "A search for businesses",
  "lead.no_card": "An ask no source covers yet",
  "lead.converted": "A lead is Talking",
  "lead.set_aside": "A lead was set aside",
  "lead.ideas_written": "Ideas for a search were written",
  // A lead's own receptionist before they sign up (decision 0079): made for a lead, and made theirs. The claimed
  // workspace files the claim too, of itself (its row names no preview), and reads it as where it began.
  "preview.made": "A preview of its own receptionist was made for a lead",
  "preview.claimed": "A lead made their preview theirs",
  // A reply to a reach-out, read (Reach out Part 5): the case below says who and what it meant.
  "reach_out.replied": "A business wrote back to a sequence",
  "reach_out.reply_undone": "A reply read as no was undone",
  "workspace.created": "The workspace was created",
  "workspace.activated": "The workspace passed a milestone",
  // The partner programme (0012), as the workspace's owner reads it; partnerEventBits says the rest of each.
  "partner.attributed": "The workspace was made through a partner's link",
  "partner.code_ignored": "A partner's code was not used",
  "partner.earned": "A partner earned a share of a payment",
  "partner.reversed": "A partner's share changed",
  "partner.standing_set": "A partner's share was judged",
  "partner.paid": "A partner was paid their share",
  "partner.handover_sent": "A partner sent the workspace to its owner",
  "partner.handover_accepted": "The owner accepted the workspace from its partner",
  "partner.handover_declined": "The owner declined the workspace from its partner",
  "partner.invited": "The workspace asked a partner to join",
  "partner.invite_withdrawn": "The invitation to a partner was taken back",
  "partner.invite_accepted": "A partner joined the workspace",
  "partner.invite_declined": "A partner declined to join the workspace",
  "settings.changed": "Settings changed",
  "settings.fact_suggested": "The receptionist suggested a note from your correction",
  "settings.fact_kept": "A note from a correction was kept",
  "settings.fact_dismissed": "A note from a correction was dismissed",
  "settings.fix_kept": "A change from a rehearsal was kept",
  "ask.memory_kept": "Ask kept something to remember",
  "ask.memory_changed": "Something Ask remembers was changed",
  "ask.memory_forgotten": "Something Ask remembered was forgotten",
  "ask.journal_written": "Ask wrote its journal",
  "ask.morning_claimed": "Ask looked at the day",
  "policy.changed": "An autonomy setting changed",
  "billing.updated": "Billing changed",
  "billing.paused": "Billing paused the workspace",
  "billing.resumed": "Billing resumed the workspace",
  "ingest.allowlist_skip": "A message was skipped by the allowlist",
  "ingest.unreachable_sender": "A sender could not be answered",
  "ingest.unroutable": "A message could not be placed on a workspace",
  "policy.veto_window_skipped": "A veto window was skipped",
  "usage.llm_tokens": "Model usage",
  "usage.ask_tokens": "Assistant usage",
  "usage.voice_seconds": "Call minutes",
  "usage.wa_conversation": "A WhatsApp conversation opened",
  "webhook.auth": "A webhook signature was checked",
  "webhook.delivery": "A webhook was delivered",
};
