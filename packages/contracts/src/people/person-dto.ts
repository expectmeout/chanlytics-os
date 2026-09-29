/**
 * A person as the wire carries them: one People row (people_list, and what the API attaches to it), a person's page
 * with everything it reads (identities, escalations, decisions, the runs that named them, the lead they were found
 * as), and PersonCampaignVM, a run as that page draws it, beside the run it is drawn from. Types only: the row's
 * view model is person-row.ts, the page's person-profile.ts.
 */
import type { ConsentChange } from "../consent/consent";
import type { PersonVisitsDto } from "../calendar/calendar-people";
import type { StepColumns } from "../notes/steps";
import type { CallDto } from "../conversations/call-dto";
import type { ConversationDto } from "../conversations/thread-dto";
import type { DealDto } from "../deals/deal-vm";
import type { DealPaceDto } from "../deals/deal-waits";
import type { RecipientState } from "../broadcasts/broadcasts";
import type { PersonNoteDto, PersonNoteTeamDto } from "../notes/person-notes";
import type { ReachOutLeadTimelineDto } from "../reach-out/reach-out-leads";

/* --------------------------------- DTOs ---------------------------------- */

/** One row of `people_list(tenant, contact?)`. Every column is nullable on
 *  the wire (RETURNS TABLE), so readers coalesce. */
export interface PersonRowDto {
  id: string;
  display_name: string | null;
  wa_profile_name: string | null;
  phone_e164: string | null;
  /** As normalizeEmail stores it (00125). A person may have this and no number. */
  email: string | null;
  consent: string | null;
  consent_source: string | null;
  marketing_consent?: string | null;
  marketing_consent_source?: string | null;
  marketing_consent_updated_at?: string | null;
  consent_updated_at: string | null;
  dnc: boolean | null;
  channels: string[] | null;
  conversation_count: number | null;
  escalation_count: number | null;
  needs_human: boolean | null;
  open_escalation_reason: string | null;
  open_escalation_since: string | null;
  latest_conversation_id: string | null;
  latest_state: string | null;
  latest_paused_until: string | null;
  latest_assignee_user_id: string | null;
  latest_snooze_until: string | null;
  latest_wa_inbound_at: string | null;
  last_message_at: string | null;
  last_message_direction: string | null;
  last_message_sender: string | null;
  last_inbound_text: string | null;
  last_inbound_at: string | null;
  last_call_at: string | null;
  /** The last call THEY placed — the one that means they reached out. */
  last_inbound_call_at?: string | null;
  /** What they wanted from that call in the analysis's plain words, else the
   *  provider's summary; null until the call is analysed. */
  last_inbound_call_summary?: string | null;
  call_count: number | null;
  call_seconds: number | null;
  /** Earliest REAL event time: a dated message or a call. Null when the only
   *  history is an undated import. */
  first_contact_at: string | null;
  /** Earliest row we hold, whatever it dates — the import moment for a
   *  backfilled person. The floor for "before …". */
  earliest_row_at: string | null;
  has_backfill: boolean | null;
  has_chat: boolean | null;
  /** The wires their written words travelled: whatsapp, sms, email (00127). Absent on a row read before it. */
  message_channels?: string[] | null;
  queued_reply_at: string | null;
  /** Where they first came from (00138): calendar | lead | manual | import | call | whatsapp | sms | email, or null
   *  when nothing says. In words through cameFromOf; absent on a row read before the column existed. */
  came_from?: string | null;
  /** The reply mode in force for this person — their own setting, else the
   *  workspace's. Attached by the API from the policies table; people_list
   *  does not carry it. */
  effective_reply_mode?: string | null;
  /** Their appointments on the owner's calendar, attached by the API when the
   *  workspace has one connected; null means no calendar. */
  visits?: PersonVisitsDto | null;
  /** The newest open or current deal, else the newest of any (people_list, 00156): absent on a row read before the columns existed. */
  deal_id?: string | null;
  deal_stage?: string | null;
  deal_service?: string | null;
  deal_proposed_at?: string | null;
  deal_decided_at?: string | null;
  deal_ended_at?: string | null;
  deal_amount_cents?: number | null;
  deal_per?: string | null;
  /** That deal's link, the day it stands until and why they passed (00160). */
  deal_proposal_url?: string | null;
  deal_valid_until?: string | null;
  deal_lost_reason?: string | null;
  /** Their next step (00166): the earliest open note with a day. Absent on a row read before the columns existed. */
  step_id?: StepColumns["step_id"];
  step_body?: StepColumns["step_body"];
  step_due_on?: StepColumns["step_due_on"];
  step_for_user_id?: StepColumns["step_for_user_id"];
  step_deal_id?: StepColumns["step_deal_id"];
  /** Who that step is for, attached by the API from the team as a note's is: their name, and whether it is the reader. */
  step_for_name?: StepColumns["step_for_name"];
  step_for_me?: StepColumns["step_for_me"];
  /**
   * The row's place in People's order (0021, 00268): when they were last in touch ("-infinity" for someone never in
   * touch) and when they were added. The next page starts just past the last row's place. Absent on a row from a
   * database before 00268, whose pages are read by offset.
   */
  in_touch_at?: string | null;
  added_at?: string | null;
}

export interface PersonIdentityDto {
  channel: string;
  external_id: string;
  created_at: string;
}

export interface PersonEscalationDto {
  id: string;
  conversation_id: string;
  reason: string;
  state: string;
  details: string | null;
  created_at: string;
  updated_at: string;
  resolved_by_user_id: string | null;
}

export interface PersonDecisionDto {
  id: string;
  verb: string;
  subject_type: string;
  subject_id: string;
  actor_type: string;
  actor_user_id: string | null;
  created_at: string;
  payload: Record<string, unknown> | null;
}

export interface PersonDetailDto {
  row: PersonRowDto;
  identities: PersonIdentityDto[];
  conversations: ConversationDto[];
  calls: CallDto[];
  escalations: PersonEscalationDto[];
  decisions: PersonDecisionDto[];
  /** This person's own receptionist mode, or null to follow the workspace. */
  receptionist_mode?: string | null;
  /** The workspace's reply policy mode, for the "following …" hint. */
  workspace_reply_mode?: string | null;
  /** Their appointments on the owner's calendar, when the workspace has one connected. */
  visits?: PersonVisitsDto;
  /** How they came to be in People when it was not by writing or calling: the calendar sweep, or a hand. */
  added?: { at: string; source: string; title: string | null };
  /** The owner's notes on this person: the field 00157 superseded, still sent for a page loaded before it. */
  notes?: string | null;
  /** Their notes (0007), newest first; absent on a read before the table existed. */
  person_notes?: PersonNoteDto[];
  /** The team, for a note's "For": absent where the team could not be read. */
  note_team?: PersonNoteTeamDto[];
  /**
   * The owner's proposal link on the person (00154). The deal holds it now (0008); this is read only for someone with no
   * deal at all, until the column retires.
   */
  proposal_url?: string | null;
  /** Every deal recorded on them, newest first (0004); absent on a read before the table existed. */
  deals?: DealDto[];
  /** Whether deals are on in this workspace: it says some customers get a proposal first (dealsAreOn, 0008). */
  deals_on?: boolean;
  /** The workspace's pace (00167 deal_pace), where deals are on; absent from a server before it. */
  deal_pace?: DealPaceDto | null;
  /** The profile's service names, for the page's picker when it lists more than one. */
  services?: string[];
  /** The services that need a consultation first (booking_rules.consult_first): which one a consultation was for. */
  consult_first?: string[];
  /** The workspace's booking link, for the profile's one-step send. */
  booking_link?: string | null;
  /** Every change to either answer, newest first: the ledger rows (contact.consent_changed), as evidence. */
  consent_history?: ConsentChange[];
  /** The runs that named this person, newest first: a playbook's, or a broadcast someone sent (broadcast_recipients). */
  campaigns?: PersonCampaignDto[];
  /** The lead this person was found as, when they were one (leads.contact_id). */
  lead?: PersonLeadDto | null;
}

/** One run that named a person: what went, when, and what became of it at the wire. */
export interface PersonCampaignDto {
  broadcast_id: string;
  /** The run's own name, as its sender gave it or the sweep named it. */
  name: string;
  /** The playbook whose run it was, and the playbook's name then; both null for a broadcast someone sent. */
  playbook_id: string | null;
  playbook_name: string | null;
  state: RecipientState;
  /** Why they were held back or not reached, as the send job recorded it (HELD_REASONS). */
  reason: string | null;
  sent_at: string | null;
  /** When the run was due: what a row that never went out is dated by. */
  scheduled_for: string | null;
  /** The message it sent them, which names the thread a reply is looked for in. */
  message_id: string | null;
}

/** The lead a person was found as: the place the finder found, before they wrote or were called. */
export interface PersonLeadDto {
  id: string;
  business_name: string;
  found_at: string;
  /**
   * What a reach-out wrote to the lead and what came back (Reach out Part 6, H11; 00241 reach_out_lead_timeline); null
   * when it could not be read, absent from a server before it.
   */
  reach_out?: ReachOutLeadTimelineDto | null;
}

/** One run on a person's page: what it was, when, and what became of it. */
export interface PersonCampaignVM {
  id: string;
  kind: "playbook" | "broadcast";
  /** The playbook's name for its run, or the broadcast's own. */
  title: string;
  /** "Sep 3", by the business's clock. */
  when: string;
  /** What became of it: "Replied", "Sent", "Held — no yes to offers", "Didn't send", "Waiting to send". */
  outcome: string;
  /** The line under the title, in Broadcasts' history words: "Playbook · Replied", "Broadcast · Sent". */
  line: string;
  tone: "ok" | "plain" | "warn";
  /** The run's own report. */
  to: string;
}
