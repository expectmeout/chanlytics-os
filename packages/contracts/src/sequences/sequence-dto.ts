/**
 * What the sequence readers answer (00442): `sequence_overview` a row a sequence, `sequence_steps_of` its steps,
 * `sequence_people` who is in it by where they stand, `sequence_history` what it sent, a batch a row. The page and Ask
 * read these and nothing else of a sequence, so the number Ask says is the number the page shows.
 */
import type { AppointmentWord } from "../journey/appointment-word";
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
export const SEQUENCE_PEOPLE_GROUPS = ["waiting", "held", "to_send", "next", "in", "done", "left"] as const;
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
}
