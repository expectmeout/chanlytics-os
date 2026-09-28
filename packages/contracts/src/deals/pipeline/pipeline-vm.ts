/**
 * The Pipeline's view model (0008): the shape of its groups, its rows with their chips, steps and next steps, and
 * the line over them. Types and the groups' order only; pipeline.ts builds it (pipelineOf).
 */
import type { PersonRowVM } from "../../people/people";
import type { StepDue } from "../../notes/steps";
import type { Tone } from "../../shell/tone";
import type { DealPaceVM } from "../deal-waits";
import type { PipelineView } from "./pipeline-views";

export type PipelineGroupKey = "consultations" | "proposals" | "clients" | "closed";
/** The groups, in the order the Pipeline draws them. */
export const PIPELINE_GROUPS: readonly PipelineGroupKey[] = ["consultations", "proposals", "clients", "closed"];

/**
 * What of a People row the Pipeline reads: who, their deal as the page says it, when they last wrote or called, and
 * their consultations -- the last one's end (the rule's) and its start (the words'), and the next one.
 */
export type PipelineSource = Pick<
  PersonRowVM,
  | "id"
  | "name"
  | "deal"
  | "askedMs"
  | "consultedMs"
  | "lastVisitMs"
  | "consultAhead"
  | "calendarTz"
  | "nextStep"
  | "followUp"
>;

/** The one thing a row says beside its facts: warn where something waits on the owner, info for what is on its way, plain for a fact. */
export interface PipelineChip {
  words: string;
  tone: Extract<Tone, "warn" | "info" | "plain">;
}

export interface PipelineRowVM<T extends PipelineSource = PersonRowVM> {
  id: string;
  /** The group it is drawn in: what its menu offers is the group's (a consultation starts a proposal). */
  group: PipelineGroupKey;
  name: string;
  /** The People row it stands for, whole: the person cell and the phone's card draw it as People does. */
  person: T;
  /** The deal's service; null for a consultation, which has no deal yet. */
  service: string | null;
  /** The deal's value in words, "$1,200" or "$2,500 a month"; null without one. */
  value: string | null;
  /** How long it has stood where it is, "8 d"; "" for a consultation still ahead. */
  inStage: string;
  chip: PipelineChip | null;
  /**
   * The deal's steps, as the row, the card and the peek draw them: a consultation where one was held or is coming
   * up, the proposal, the client. Empty for a pass or an end, whose chip says it. A picture of what the group head
   * and the chip say in words, so a screen reader is not read it again.
   */
  track: PipelineStep[];
  /**
   * Their next step (0007, amended): the earliest open note with a day, as People's row carries it, its day judged
   * again as the Pipeline is drawn. Null without one.
   */
  next: PipelineNextVM | null;
}

/** A row's next step, as its column, its card and the peek say it. */
export interface PipelineNextVM {
  id: string;
  words: string;
  /** The day itself, "2026-09-26", for the order; `when` is how it is said: "Due Thu", "Overdue since Mon". */
  day: string;
  when: string;
  due: StepDue;
  forWho: string | null;
  /** The deal it moves, when it names one. */
  dealId: string | null;
}

/** One step on a row's track: done, where the deal stands now, or still ahead. */
export interface PipelineStep {
  key: "consultation" | "proposal" | "client";
  at: "done" | "current" | "ahead";
  /** Where it stands, in the tone its chip is in (a proposal waiting on the owner is warn); plain either side of it. */
  tone: Extract<Tone, "info" | "ok" | "warn" | "plain">;
}

export interface PipelineGroupVM<T extends PipelineSource = PersonRowVM> {
  key: PipelineGroupKey;
  label: string;
  count: number;
  /**
   * What the group comes to: the value of its proposals or its clients in all ("$4,250", "$1,340 a month"), and for
   * the consultations, how many were held in the last week with no proposal yet. Null for nothing to say.
   */
  meta: string | null;
  /** Whether it starts folded: Passed or ended does, until someone opens it (PIPELINE_WORDS.show). */
  collapsed: boolean;
  rows: PipelineRowVM<T>[];
}

/**
 * One part of the line over the table: its words, and the view a press on it opens (the rail's own row), in warn where
 * it counts what waits on the owner. The totals are words only.
 */
export interface PipelineLinePart {
  words: string;
  view: PipelineView | null;
  tone: "warn" | null;
}

export interface PipelineVM<T extends PipelineSource = PersonRowVM> {
  /**
   * The line over the table, in the parts a page sets dots between -- "3 proposals out", "$4,250", "1 waiting over a
   * week", "1 lapsed", "2 clients", "$1,340 a month" -- and only the parts that have something. Always the whole
   * Pipeline's, whatever view the groups are of.
   */
  summary: string[];
  /** The same parts, with the view each opens. */
  line: PipelineLinePart[];
  /** The groups with someone in them, in order. */
  groups: PipelineGroupVM<T>[];
  /** Nobody in any group: no deal, and no consultation to follow. */
  empty: boolean;
  /** The workspace's pace (dealPaceOf), which every wait on this Pipeline was judged by; null without one. */
  pace: DealPaceVM | null;
}
