/**
 * One campaign in Reports › Campaigns (lenses.ts CampaignScope): what one sequence sent over the days Reports shows, and what came
 * of it, counted from the batches its History counts (00442 sequence_batch_counts, contracts historyFigures), so the record's
 * History and its report say the same numbers for the same days. A run's own report screen left for this (Ruben, 21 Oct
 * 2026): a day of History that went opens here, over that day. Pure: the page reads the batches and hands them over.
 */
import { shiftKey } from "../calendar/day-keys";
import { sequenceRoute } from "../sequences/sequence-address";
import { SEQUENCE_WORDS } from "../sequences/sequence-words";
import {
  SEQUENCE_HISTORY_WORDS,
  batchWent,
  historyDayWords,
  historyFigures,
  historyStamp,
  type SequenceHistoryFigure,
} from "../sequences/sequence-tab-words";
import type { SequenceBatchDto, SequenceRowDto } from "../sequences/sequence-dto";
import { zoneDayKey } from "../shared/clock";
import { plural } from "../shared/words";
import { CAMPAIGN_SCOPE_ALL, campaignScopeKey, type CampaignScope } from "./lenses";
import { dayPointOf } from "./reports";

/** The lens's words for what it is narrowed to, and for one campaign's cards. */
export const CAMPAIGN_SCOPE_WORDS = {
  label: "Which campaign",
  all: "All campaigns",
  /** The sequence's own pages, from its report. */
  open: "Open it",
  reading: "Reading what it sent…",
  /** What a failed read could not read: "Couldn't read what it sent". */
  failed: "what it sent",
  gone: "This campaign isn’t in this workspace.",
  days: { title: "Sent, day by day", aria: "Messages it sent per day. The arrow keys read each day." },
  byStep: { title: "By step", line: "What each step sent, and what came of it." },
  sends: { title: "Each send", line: "Newest first, with what came of each." },
  heads: { when: "When", what: "What came of it", sent: "Sent" },
  nothing: (name: string) => `Nothing went out from “${name}” in these days`,
  nothingBody: "Its History says what it sent before, and what goes next.",
} as const;
const SAID = CAMPAIGN_SCOPE_WORDS;

/** What the fold is handed: the sequence, the batches read, and the days Reports shows. */
export interface CampaignOneInput {
  id: string;
  name: string;
  timezone: string;
  /** How many steps it has: by step is drawn where it has more than one. */
  steps: number;
  /** Its batches, newest first, as far back as they were read. */
  batches: readonly SequenceBatchDto[];
  /** The days Reports shows, as day keys. */
  from: string;
  to: string;
  nowMs: number;
}

/** One day's column: what it sent and what came back from it. */
export interface CampaignOnePointVM {
  day: string;
  label: string;
  short: string;
  sent: number;
  replied: number;
  sentWords: string;
  answeredWords: string;
}

/** What a step sent over the days, and what came of it. */
export interface CampaignOneStepVM {
  place: number;
  label: string;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
}

/** One send of the days: when, which step, and what came of it in History's own words. */
export interface CampaignOneSendVM {
  id: string;
  /** What it is (sent, going out, failed, waiting for an OK, to come, canceled): its mark, as History's day marks it. */
  state: string;
  when: string;
  end: string;
  said: string;
  went: boolean;
}

export interface CampaignOneVM {
  name: string;
  /** The frame's sentence for it. */
  head: string;
  figures: SequenceHistoryFigure[];
  points: CampaignOnePointVM[];
  /** Whether a column has anything in it: a chart of zeros is not drawn. */
  sentAny: boolean;
  byStep: CampaignOneStepVM[] | null;
  sends: CampaignOneSendVM[];
  /** Said in place of the cards where nothing went out in these days. */
  empty: { title: string; body: string } | null;
  /** Its own pages: the record's History. */
  door: { label: string; to: string };
}

/** The day a batch is of, as History files it: the day it ran for, else the day it went. */
const batchDayOf = (b: SequenceBatchDto, tz: string): string => b.run_for ?? zoneDayKey(Date.parse(b.at), tz);

/** The days from one key to another, both in. */
function daysFrom(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = shiftKey(d, 1)) out.push(d);
  return out;
}

const batchCount = (b: SequenceBatchDto, k: "sent" | "delivered" | "read" | "replied"): number => b.counts[k] ?? 0;

/** Each step's sends over the days, in its place's order; none where it has one step. */
function byStepOf(went: readonly SequenceBatchDto[], steps: number): CampaignOneStepVM[] | null {
  if (steps < 2) return null;
  const places = [...new Set(went.map((b) => b.place ?? 1))].sort((a, b) => a - b);
  return places.map((place) => {
    const of = went.filter((b) => (b.place ?? 1) === place);
    const sum = (k: "sent" | "delivered" | "read" | "replied") => of.reduce((n, b) => n + batchCount(b, k), 0);
    const label = SEQUENCE_HISTORY_WORDS.step(place);
    return {
      place,
      label: label.charAt(0).toUpperCase() + label.slice(1),
      sent: sum("sent"),
      delivered: sum("delivered"),
      read: sum("read"),
      replied: sum("replied"),
    };
  });
}

/** The frame's sentence: what it sent over the days, and how many of those drew a reply. */
function oneHeadOf(name: string, sent: number, replied: number): string {
  if (sent === 0) return `${SAID.nothing(name)}.`;
  const back = replied === 0 ? "nobody has written back yet" : `${replied} drew a reply`;
  return `${name} sent ${plural(sent, "message")}: ${back}.`;
}

export function campaignOneOf(input: CampaignOneInput): CampaignOneVM {
  const { id, name, timezone: tz, from, to } = input;
  const inDays = input.batches.filter((b) => {
    const day = batchDayOf(b, tz);
    return day >= from && day <= to;
  });
  const went = inDays.filter(batchWent);
  const figures = historyFigures(went);
  const points = daysFrom(from, to).map((day) => {
    const of = went.filter((b) => batchDayOf(b, tz) === day);
    const sent = of.reduce((n, b) => n + batchCount(b, "sent"), 0);
    const replied = of.reduce((n, b) => n + batchCount(b, "replied"), 0);
    const point = dayPointOf(day);
    return {
      ...point,
      sent,
      replied,
      sentWords: `${point.label}: ${plural(sent, "message")} sent`,
      answeredWords: replied === 0 ? "No replies" : plural(replied, "reply", "replies"),
    };
  });
  const sent = went.reduce((n, b) => n + batchCount(b, "sent"), 0);
  const replied = went.reduce((n, b) => n + batchCount(b, "replied"), 0);
  const sends = inDays.map((b) => {
    const place = b.place && input.steps > 1 ? SEQUENCE_HISTORY_WORDS.step(b.place) : null;
    const said = historyDayWords(b, place);
    return {
      id: b.id,
      state: b.state,
      when: historyStamp(Date.parse(b.at), tz, input.nowMs),
      ...said,
      went: batchWent(b),
    };
  });
  return {
    name,
    head: oneHeadOf(name, sent, replied),
    figures,
    points,
    sentAny: sent > 0,
    byStep: byStepOf(went, input.steps),
    sends,
    empty: went.length === 0 ? { title: SAID.nothing(name), body: SAID.nothingBody } : null,
    door: { label: SAID.open, to: sequenceRoute(id, "history") },
  };
}

/** One choice of the lens's picker: a sequence, under the group its start puts it in. */
export interface CampaignChoice {
  key: string;
  label: string;
  group: "all" | "customers" | "leads" | "dates";
}

/** The picker's group a sequence stands in: by how it starts, as Sequences groups the ones that are on. */
const groupOf = (row: Pick<SequenceRowDto, "starts">): CampaignChoice["group"] =>
  row.starts === "leads" ? "leads" : row.starts === "date" ? "dates" : "customers";

/** The groups' headings, Sequences' own words for them. */
export const CAMPAIGN_CHOICE_GROUPS: Readonly<Record<Exclude<CampaignChoice["group"], "all">, string>> = {
  customers: SEQUENCE_WORDS.groups.customers,
  leads: SEQUENCE_WORDS.groups.leads,
  dates: SEQUENCE_WORDS.groups.dates,
};

/**
 * What the picker lists: every campaign first, then each sequence that has sent (a draft or one that never went has nothing
 * to report), grouped by how it starts, newest send first; the one the address names is listed whatever it is.
 */
export function campaignChoicesOf(
  rows: readonly Pick<SequenceRowDto, "id" | "name" | "starts" | "state" | "last">[],
  scope: CampaignScope,
): CampaignChoice[] {
  const named = scope.kind === "sequence" ? scope.id : null;
  const sent = rows
    .filter((r) => r.id === named || (r.state !== "draft" && r.last !== null))
    .sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""));
  const order: CampaignChoice["group"][] = ["customers", "leads", "dates"];
  const choices = order.flatMap((group) =>
    sent
      .filter((r) => groupOf(r) === group)
      .map((r) => ({ key: campaignScopeKey({ kind: "sequence", id: r.id }), label: r.name, group })),
  );
  return [{ key: campaignScopeKey(CAMPAIGN_SCOPE_ALL), label: SAID.all, group: "all" }, ...choices];
}
