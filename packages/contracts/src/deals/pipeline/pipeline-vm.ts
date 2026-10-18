/**
 * The Pipeline's view model (0008): the shape of its groups, its rows with their chips, steps and next steps, and
 * the line over them. Types and the groups' order only; pipeline.ts builds it (pipelineOf).
 */
import type { PersonRowVM } from "../../people/person-row";
import type { StepDue } from "../../notes/steps";
import type { Tone } from "../../shell/tone";
import type { DealVM } from "../deal-vm";
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
  | "openDeals"
  | "askedMs"
  | "consultedMs"
  | "lastVisitMs"
  | "nextVisitMs"
  | "consultAhead"
  | "calendarTz"
  | "nextStep"
  | "followUp"
> &
  /** Their last visit as the one visit line, where the row carries it: a consultation is worded by its mark (D1-consult-held). */
  Partial<Pick<PersonRowVM, "lastVisitLine">>;

/** The one thing a row says beside its facts: warn where something waits on the owner, info for what is on its way, plain for a fact. */
export interface PipelineChip {
  words: string;
  tone: Extract<Tone, "warn" | "info" | "plain">;
}

export interface PipelineRowVM<T extends PipelineSource = PersonRowVM> {
  /**
   * The row's own id: its person's for their first row, and `<person>_<deal>` for each further open deal of theirs
   * (0029: one row per open deal), so a cursor, a card and the address each name one row. What acts on the person (their
   * peek's read, their page, the deal sheet) takes `person.id`, or pipelinePersonOf of an id.
   */
  id: string;
  /** The group it is drawn in: what its menu offers is the group's (a consultation starts a proposal). */
  group: PipelineGroupKey;
  name: string;
  /** The People row it stands for, whole: the person cell and the phone's card draw it as People does. */
  person: T;
  /**
   * The deal this row stands for (0029): one of the person's open deals, or their closed one; null for a consultation,
   * which has no deal yet. A move, a pass and the row's chip read this deal, never the one their People row shows.
   */
  deal: DealVM | null;
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
   * the consultations, how many ended in the last week with nothing since. Null for nothing to say.
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
  /**
   * It goes on with the part before it, as a total's worth goes with its count ("$4,250" after "3 proposals out"): a
   * page that sets each fact on a line of its own keeps the two together, so a dot never starts a line.
   */
  joins: boolean;
}

/**
 * One of a phone's filters over the Pipeline (Ruben, 10 Oct 2026): a count, the view it opens, and the tone of its dot
 * -- proposals out, what waits on the owner, clients. What they come to is `money`, said once beside them.
 */
export interface PipelineFilter {
  view: PipelineView;
  count: number;
  words: string;
  tone: "info" | "warn" | "ok";
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
  /** A phone's line of filters: each count with the view it opens; only those that have something. */
  filters: PipelineFilter[];
  /** What the proposals out and the clients come to, once: "$2,500 proposed · $120 a month from clients"; null with neither. */
  money: string | null;
  /** The groups with someone in them, in order. */
  groups: PipelineGroupVM<T>[];
  /** Nobody in any group: no deal, and no consultation to follow. */
  empty: boolean;
  /** The workspace's pace (dealPaceOf), which every wait on this Pipeline was judged by; null without one. */
  pace: DealPaceVM | null;
}

/**
 * A Pipeline row's id (0029): the person's own for their first row, `<person>_<deal>` for each further open deal. An id
 * never holds `_` otherwise (a person's is a UUID), so pipelinePersonOf reads the person back from any row's id.
 */
export function pipelineRowId(personId: string, dealKey: string | null): string {
  return dealKey === null ? personId : `${personId}_${dealKey}`;
}

/**
 * The row that holds what `rowId` named in this Pipeline: itself while it is drawn, else the row of the deal it named
 * (0029: when another deal of theirs closes, the one their People row shows changes, and a further deal's row becomes
 * their first, with their id), else null.
 */
export function pipelineRowNow(
  vm: { groups: readonly { rows: readonly { id: string; deal: { id: string | null } | null }[] }[] },
  rowId: string,
): string | null {
  const rows = vm.groups.flatMap((g) => g.rows);
  if (rows.some((row) => row.id === rowId)) return rowId;
  const at = rowId.indexOf("_");
  const deal = at < 0 ? null : rowId.slice(at + 1);
  return (deal && rows.find((row) => row.deal?.id === deal)?.id) || null;
}

/** The person a Pipeline row id names: the part before its `_`, or the whole id for a person's first row. */
export function pipelinePersonOf(rowId: string): string {
  const at = rowId.indexOf("_");
  return at < 0 ? rowId : rowId.slice(0, at);
}
