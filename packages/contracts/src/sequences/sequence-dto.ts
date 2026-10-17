/**
 * What the sequence readers answer (00442): `sequence_overview` a row a sequence, `sequence_steps_of` its steps,
 * `sequence_people` who is in it by where they stand, `sequence_history` what it sent, a batch a row. The page and Ask
 * read these and nothing else of a sequence, so the number Ask says is the number the page shows.
 */
import type { AppointmentWord } from "../journey/appointment-word";
import type { ReachOutFedBy } from "../reach-out/reach-out-leads";
import type { SequenceStart, SequenceState } from "./sequence";

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
  owner_sends: boolean;
  until: string | null;
  trial_until: string | null;
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
  created_at: string;
  first: SequenceFirstStepDto | null;
  date: SequenceDateDto | null;
  steps: number;
  channels: string[];
  needs: SequenceNeedsDto;
  /** The batch to come: waiting for an OK, scheduled or going out. */
  next: { id: string; at: string; people: number; state: string; place: number | null } | null;
  /** The last batch that went, with what it sent and drew back. */
  last: { id: string; at: string; sent: number; replied: number } | null;
  /** People in it now: a step of theirs still to come. */
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
  /** A sequence to leads' last step for the team: a call or a note. */
  hand: { kind: string; words: string } | null;
  next_words: SequenceNextWordsDto | null;
  /** What its batches of the last 30 days sent, and drew back. */
  sent: number;
  replied: number;
}

/** Where someone in a sequence stands, the People tab's groups in their order. */
export const SEQUENCE_PEOPLE_GROUPS = ["waiting", "held", "to_send", "replied", "next", "in", "done", "left"] as const;
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

/** GET sequences/:id: one sequence, its steps, who approves its batches, and the clock. */
export interface SequenceRecordDto {
  sequence: SequenceRowDto;
  steps: SequenceStepDto[];
  /** The autonomy mode its first step's class runs under (policies): who approves. Null where none is set (ask). */
  mode: string | null;
  timezone: string;
  /** What the workspace calls an appointment, which says when a moment's sequence starts. */
  word: AppointmentWord;
  /**
   * The business day its first step last ran (`sequence_steps.last_run_for`): when its next run goes (sequenceNextOf).
   * Absent from a server before it, which then says no next run it cannot know.
   */
  last_run_for?: string | null;
  /**
   * A sequence to leads: what it writes to, a list its owner adds leads to (Add leads opens Leads to add to it) or its
   * search, which the finder keeps current (contracts isLeadList over the search's `via`). Absent on any other sequence,
   * and from a server before it, which then opens the search.
   */
  fed_by?: ReachOutFedBy;
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
