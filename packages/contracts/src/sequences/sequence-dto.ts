/**
 * What the sequence readers answer (00442): `sequence_overview` a row a sequence, `sequence_steps_of` its steps,
 * `sequence_people` who is in it by where they stand, `sequence_history` what it sent, a batch a row. The page and Ask
 * read these and nothing else of a sequence, so the number Ask says is the number the page shows.
 */
import type { AppointmentWord } from "../journey/appointment-word";
import type { ReachOutChainDto } from "../reach-out/reach-out-dtos";
import type { ReachOutFedBy } from "../reach-out/reach-out-leads";
import type { NewOnceKept } from "./new-draft";
import type { SequenceMode, SequenceStart, SequenceState } from "./sequence";
import type { SequenceEvidence } from "./sequence-evidence";

/** A sequence's first step, as the list reads it: how it starts and the class it runs under. */
export interface SequenceFirstStepDto {
  id: string;
  kind: string;
  trigger: string;
  state: string;
  policy_class: string;
  run_hour: number;
  list_id: string | null;
  list_key: string | null;
  /** The workspace's own list it runs on, by its name; null for none or one of People's (list_key). */
  list_name: string | null;
  search_id: string | null;
  /** The lead search a sequence to leads writes to, by its name. */
  search_name: string | null;
  /**
   * The search whose new ready leads join a sequence to leads without a press (00459 auto-add), by its id and name; null
   * where nobody joins but those added. Absent from a server before 00459.
   */
  source_search_id?: string | null;
  source_name?: string | null;
  /**
   * The search it could add from while it adds from none (How it runs' auto-add switch): the live finder search that found
   * most of its list's leads, which no other sequence adds from. Null where there is none; absent before 00459.
   */
  source_could?: { id: string; name: string } | null;
  owner_sends: boolean;
  until: string | null;
  /**
   * When a person last let a batch of its words go (00462): null while its words are new, and its next batch then waits
   * for an OK whatever the mode (contracts batchModeOf).
   */
  words_ok_at: string | null;
  template_name: string | null;
  template_language: string | null;
}

/** A one-off's one batch: when it goes and to how many. */
export interface SequenceDateDto {
  batch_id: string;
  state: string;
  at: string;
  people: number;
}

/**
 * What needs you in a sequence: batches waiting for your OK and how many people they hold, emails held by the check,
 * emails for you to send yourself, and replies to answer; and since when the oldest of them has waited.
 */
export interface SequenceNeedsDto {
  waiting: number;
  waiting_people: number;
  held: number;
  to_send: number;
  replies: number;
  oldest_at: string | null;
  /**
   * The batches waiting for an OK, soonest first, each with what the badge judges it by (contracts runWaitsOnYou): its
   * step, the business's day it was made for and its moment. The server's reader counts `waiting` from those an OK can
   * still send (sequenceWaitsNow).
   */
  batches: SequenceWaitingBatchDto[];
}

/** A batch waiting for an OK, as the overview answers it. */
export interface SequenceWaitingBatchDto {
  id: string;
  step_id: string | null;
  run_for: string | null;
  at: string;
  people: number;
  audience: { kind: string | null; trigger: string | null };
}

/** A sequence as the list reads it (`sequence_overview`). */
export interface SequenceRowDto {
  id: string;
  name: string;
  starts: SequenceStart;
  state: SequenceState;
  /** How its batches are decided (decision 0064, `sequences.mode`); null for a one-off, which pressing Send decided. */
  mode: SequenceMode | null;
  created_at: string;
  first: SequenceFirstStepDto | null;
  date: SequenceDateDto | null;
  /** A message sent once, kept as a draft (00465): who, when, how and its step, as New shaped them; absent before it. */
  once?: NewOnceKept | null;
  steps: number;
  /** The days its steps span: each wait after the first (00459); absent from a server before it. */
  days?: number;
  /** A sequence to leads' emails still to write, a step's body left empty (00459); absent from a server before it. */
  unwritten?: number;
  channels: string[];
  needs: SequenceNeedsDto;
  /** The batch to come: waiting for an OK, scheduled or going out. */
  next: { id: string; at: string; people: number; state: string; place: number | null } | null;
  /** The last batch that went, with what it sent and drew back. */
  last: { id: string; at: string; sent: number; replied: number } | null;
  /**
   * Who is in it now: everyone whose place stands, as its People tab files them (00459 sequence_places: a lead added and
   * not yet planned, waiting for an OK, held, for you to send, up next or between steps); before 00459, those between steps.
   */
  in_it: number;
}

/** New words for a step that wait for WhatsApp to approve them (00441), with WhatsApp's answer so far. */
export interface SequenceNextWordsDto {
  template_id: string | null;
  name: string;
  language: string;
  status: string | null;
  rejected_reason: string | null;
}

/** A step in its place (`sequence_steps_of`). */
export interface SequenceStepDto {
  id: string;
  place: number;
  name: string;
  kind: string;
  trigger: string;
  state: string;
  after_days: number | null;
  only_if: string[];
  channels: string[];
  template_id: string | null;
  template_name: string | null;
  template_language: string | null;
  params: unknown;
  /** A sequence's last step for the team, a lead's or (00465) a customer's: a call or a note; null for a message. */
  hand: { kind: string; words: string } | null;
  next_words: SequenceNextWordsDto | null;
  /** When a person last let a batch of its words go (00462); null while they are new, and its next batch asks. */
  words_ok_at: string | null;
  /** What its batches of the last 30 days sent, and drew back. */
  sent: number;
  replied: number;
}

/**
 * Where someone in a sequence stands, the People tab's groups in their order: `queued` is a lead on its list that nothing
 * has been planned for yet (00459), every lead of a draft.
 */
export const SEQUENCE_PEOPLE_GROUPS = [
  "waiting",
  "held",
  "to_send",
  "replied",
  "next",
  "queued",
  "in",
  "done",
  "left",
] as const;
export type SequencePeopleGroup = (typeof SEQUENCE_PEOPLE_GROUPS)[number];

/** One person or lead in a sequence (`sequence_people`). */
export interface SequencePersonDto {
  group: SequencePeopleGroup;
  contact_id: string | null;
  lead_id: string | null;
  enrollment_id: string | null;
  send_id: string | null;
  batch_id: string | null;
  name: string | null;
  place: number | null;
  at: string | null;
  /** Why they were held or left (a send's reason, booked, replied, removed). */
  why: string | null;
  hold_detail: string | null;
  /**
   * On a to_send row, the email as it was handed to its owner (00447): what their mail app opens with. Null on every other
   * row, and absent from a server before 00447, where the run's sheet in Sent lays it out instead.
   */
  draft?: SequencePersonDraftDto | null;
  /**
   * On a reached-out email waiting for an OK or held (its send's), the opening it goes with: null while the check writes
   * it, or where its step's words have none. Absent on every other row, and from a server before it (30 Oct 2026).
   */
  opening?: string | null;
  /** Beside `opening`: whether the check has read the email yet. */
  checked?: boolean;
  /**
   * On a replied row (00455), the reply that asks for an answer, the one the overview counts: what they said and the
   * conversation it is answered in. Null on every other row, and absent from a server before 00455.
   */
  reply?: SequencePersonReplyDto | null;
}

/** A reply that waits for an answer, as a replied row carries it (00455). */
export interface SequencePersonReplyDto {
  /** interested or question: the readings that ask for an answer. */
  intent: string;
  summary: string | null;
  conversation_id: string | null;
}

/** The email handed to its owner to send from their own inbox (00429), as a to_send row carries it (00447). */
export interface SequencePersonDraftDto {
  to: string;
  subject: string;
  /** The whole email as it reads, its foot included: what the owner sends. */
  text: string;
  /** A step after the first: it answers an email the business may have answered in the owner's own inbox. */
  follow_up: boolean;
  angle: string | null;
  drafted_at: string;
}

/** Who is in a sequence: each group's count whole, and its first rows. */
export interface SequencePeopleDto {
  counts: Partial<Record<SequencePeopleGroup, number>>;
  rows: SequencePersonDto[];
}

/** What became of a batch's sends (`sequence_batch_counts`). */
export interface SequenceBatchCountsDto {
  waiting: number;
  sent: number;
  skipped: number;
  failed: number;
  held: number;
  to_send: number;
  delivered: number;
  read: number;
  replied: number;
}

/** A batch as History reads it. */
export interface SequenceBatchDto {
  id: string;
  state: string;
  run_for: string | null;
  at: string;
  scheduled_for: string;
  finished_at: string | null;
  people: number;
  failure: string | null;
  place: number | null;
  counts: Partial<SequenceBatchCountsDto>;
}

/**
 * GET sequences/:id/replies: the conversations that answered a sequence over one of History's periods, by the rule its
 * days open onto (a person's words within the reply window after a batch reached them; a lead's reply read as theirs).
 */
export interface SequenceRepliesDto {
  sequence_id: string;
  name: string;
  period: "30" | "90" | "all";
  conversation_ids: string[];
}

/** What a sequence sent, newest first (`sequence_history`). */
export interface SequenceHistoryDto {
  batches: SequenceBatchDto[];
  more: boolean;
}

/** GET sequences: the workspace's sequences, the clock they are said in, and what it calls an appointment. */
export interface SequencesPageDto {
  sequences: SequenceRowDto[];
  timezone: string;
  word: AppointmentWord;
}

/** GET sequences/:id: one sequence (with how its batches are decided, its own mode), its steps, and the clock. */
export interface SequenceRecordDto {
  sequence: SequenceRowDto;
  steps: SequenceStepDto[];
  timezone: string;
  /** What the workspace calls an appointment, which says when a moment's sequence starts. */
  word: AppointmentWord;
  /**
   * The business day its first step last ran (`sequence_steps.last_run_for`): when its next run goes (sequenceNextOf).
   * Absent from a server before it, which then says no next run it cannot know.
   */
  last_run_for?: string | null;
  /**
   * Why its first step's last run did nothing, where it did nothing (core runPlaybook's `skipped`, from its `playbook.run`
   * event: no calendar, its list gone, its message not approved, the class set to Never, its last day passed); null where
   * it ran, sent or found nobody (contracts sequenceRunOff says it). Absent from a server before it.
   */
  last_run_off?: string | null;
  /**
   * Whether it ever made a batch (0072): End it ends one that did, and Discard takes away one that never did. Absent where
   * it could not be read, and from a server before it, which then offers no Discard.
   */
  ran?: boolean;
  /**
   * A sequence to leads: whether an email of it was ever written (0072), after which it is paused, never let go of. False
   * of any other sequence; absent where it could not be read, which offers no Discard either.
   */
  wrote?: boolean;
  /**
   * How its first step's runs go, beyond its hour: the most one run sends, the days before someone hears it again (a
   * moment's), and the days between runs (the month's offer). What Start's Change opens with. Absent on a sequence to
   * leads and a one-off, and from a server before it.
   */
  settings?: { cap_per_run: number; gap_days: number; cadence_days: number };
  /**
   * A sequence to leads: what it writes to, a list its owner adds leads to (Add leads opens Leads to add to it) or its
   * search, which the finder keeps current (contracts isLeadList over the search's `via`). Absent on any other sequence,
   * and from a server before it, which then opens the search.
   */
  fed_by?: ReachOutFedBy;
  /**
   * A sequence to leads, as it is written (00459: the draft's record is its editor): each step's words, its mailboxes,
   * its pace and who signs. Absent on any other sequence, and from a server before it; null where it could not be read.
   */
  chain?: ReachOutChainDto | null;
  /**
   * What its batches did over the last EVIDENCE_DAYS (decision 0064, step 5): went, after an OK, stopped, skipped
   * unanswered; How it runs says it under Before each batch. Absent on a one-off, where it could not be read, and from a
   * server before it.
   */
  evidence?: SequenceEvidence | null;
  /**
   * A one-off: its one message as its batch sends it. Absent on any other sequence, and from a server before it, which
   * then names the sequence alone; null where the batch could not be read.
   */
  one_off?: SequenceOneOffDto | null;
}

/** A one-off's message (its batch, whose id is the sequence's): the message, the values it is filled with, how it goes. */
export interface SequenceOneOffDto {
  template_name: string | null;
  template_language: string | null;
  params: unknown;
  /** The channels its sends go by, a customer's not skipped, in CONSENT_CHANNELS' order; none until a send names one. */
  channels: string[];
}

/**
 * GET sequences/:id/reach: what Turn on asks with (contracts sequenceResumeAsk) beside what the record holds, for a
 * sequence on a moment or a list: who its next run reaches, counted as GET playbooks counts its first step's card (its
 * pool, for the channels it goes by), the most one run sends, and whether the workspace is paused (billing).
 */
export interface SequenceReachDto {
  /** Null where its moment could not be counted: the question then says when alone. */
  candidates: number | null;
  cap_per_run: number | null;
  paused: boolean;
}
