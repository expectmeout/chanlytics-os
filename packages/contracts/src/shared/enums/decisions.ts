/** The closed sets of the decisions': every verb a decision names, its subjects, who acted, and a visit's word. Held to their columns as every set is (shared/enums.ts). */
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
  /**
   * A step of a sequence added, changed, given new words or taken away (00442 sequence_step_save, sequence_step_remove,
   * sequence_step_words; decision 0060): subject 'sequence', payload the step and what changed of it.
   */
  "change_step",
  /** People taken out of a sequence (00442 sequence_leave), and put back (00450 sequence_return): subject 'sequence'. */
  "leave_sequence",
  "return_to_sequence",
  /**
   * A new sequence made whole, kept as a draft or started (00442 sequence_create, decision 0060 S4), and one that never
   * sent let go (sequence_discard): subject 'sequence', payload its steps and whether it started, or its name and state.
   */
  "make_sequence",
  "discard_sequence",
  /**
   * A member answered a booking the receptionist asked for (00443 booking_request_answer, decision 0061): booked, or not,
   * subject 'appointment' (the request's row), payload booked, its start, the person and the service.
   */
  "answer_booking_request",
  /**
   * A thread set aside as not a customer's (00539, decision 0093): a member said so, and it was archived with its address
   * marked; or a member said it was one after all, and it waits on them again. Subject 'conversation', payload what was
   * undone by it.
   */
  "not_a_customer",
  "reply_anyway",
  /**
   * An owner's ad account and its ads (00649, decision 0050): the account connected or let go, subject 'ad_account';
   * an ad paused, turned back on, or turned on from New ad (00666), subject 'ad'. The owner's alone (the `ads`
   * permission).
   */
  "connect_ad_account",
  "disconnect_ad_account",
  "pause_ad",
  "resume_ad",
  "turn_on_ad",
  "change_ad",
  "end_ad",
  /** An ad cancelled while it is set up (00676; the Ads plan's 4.7, point 8): its owner's, or a yes taken back's. */
  "cancel_ad",
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
  /** A sequence (decision 0060, 00442): its steps changed and its people taken out. Its id is its first step's. */
  "sequence",
  /** An owner's own ad account, and one of its ads (00649, decisions 0049 and 0050): connected, paused, resumed. */
  "ad_account",
  "ad",
] as const;
export type DecisionSubject = (typeof DECISION_SUBJECTS)[number];

export const ACTOR_TYPES = ["user", "ai", "system", "owner_phone"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/**
 * What a member may say became of a visit (00397 mark_visit; decision 0002, step 8). Here, with the closed sets, and not in
 * calendar/words.ts, which says them: Today's view model names it and the phone app's program reaches that (mobile/widget.ts),
 * which must not reach the calendar's words.
 */
export type VisitWord = "kept" | "missed" | "cancelled";
