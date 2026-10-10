/**
 * Reports › People — what the lens's own read says, counted once.
 *
 * The route answers the lens's two halves in one DTO (people-record.ts): the window, from the database (people_series, 00395:
 * who reached the business and how, how the new ones first came, the yeses and stops they gave, the addresses that stopped
 * working, the steps finished on time), and the book as it stands now, from the people pool by People's own rules
 * (people-now.ts). This puts them in words: the head, the four figures against the period before, the mixes, the book's
 * wires and freshness, what is stuck and where the book stands. A page draws these and makes no sentence of its own; Ask
 * says what it says. A share carries the count it is of (REPORT_MIN_N greys it under five), a part with nothing in it says
 * so in words and never as a zero percentage, and either half stands without the other. Pure: the page feeds it the DTO.
 *
 * The window is "people", not "messages": report_series counts messages and calls day by day, and a person who wrote ten
 * times is one here. The book is "as of now, whatever period is picked", and says so wherever it is drawn.
 */
import { barsOf, mixOf, noMix, type MixEntry, type MixPartVM } from "../report-mix";
import { REPORT_MIN_N, compareWords, type ReportMetric, type ReportStripTile } from "../report-tiles";
import { rangeLabelOf } from "../reports";
import type { PeopleNowDto } from "./people-now";
import type { PeopleDto, PeopleSeriesDto } from "./people-record";
import {
  BOOK_EMPTY,
  CHANNELS_EMPTY,
  CHANNELS_LINE,
  EMAIL_STOPPED_EMPTY,
  FIRST_CAME_NOBODY,
  STEPS_DONE_EMPTY,
  STOPS_EMPTY,
  STOPS_LINE,
  YESES_EMPTY,
  YESES_LINE,
  channelEntries,
  emailStoppedEntries,
  emailStoppedLine,
  emailStoppedNowMeta,
  firstCameEntries,
  firstCameKnown,
  firstCameLine,
  firstCameNone,
  freshEntries,
  freshLine,
  headWords,
  listDoor,
  newMeta,
  quietDoor,
  reachedMeta,
  standMeta,
  stepsDoneEntries,
  stepsDoneLine,
  stepsDueTodayMeta,
  stepsOverdueMeta,
  stopEntries,
  stopsMeta,
  wireEntries,
  wiresLine,
  yesEntries,
  yesesMeta,
} from "./people-words";

/** A figure of the lens: the strip's tile, with the count a share is of (`n`), the list a count opens (`door`) and the tone of its number where it has them. */
export type PeopleFigureVM = ReportStripTile;

export interface PeopleReportVM {
  /** The lens's sentence; null where the window was not read, and the frame's own sentence stands. */
  head: string | null;
  /** False: the database has no people_series yet, and the lens draws nothing of the window. */
  windowAvailable: boolean;
  /** False: the people pool could not be counted, and the lens draws nothing of the book. */
  nowAvailable: boolean;
  /** [people who reached you, new people, yeses won, stops] */
  strip: PeopleFigureVM[];
  /** The window: how they reached you, how the new ones first came, how the yeses were won and the stops came, the steps done on time, the addresses that stopped. */
  channels: MixPartVM;
  firstCame: MixPartVM;
  yeses: MixPartVM;
  stops: MixPartVM;
  stepsDone: MixPartVM;
  emailStopped: MixPartVM;
  /** The book as of now: the ways people reach you, and how long since they last did. */
  wires: MixPartVM;
  fresh: MixPartVM & { quiet: { line: string; door: string; label: string } | null };
  /** [steps overdue, steps due today, email stopped working] */
  stuck: PeopleFigureVM[];
  /** [said yes to messages, can receive offers, opted out, quiet 30+ days] */
  stand: PeopleFigureVM[];
}

/** The parts that come from the window, and those that come from the book: each half is whole without the other. */
type WindowParts = Pick<
  PeopleReportVM,
  "head" | "strip" | "channels" | "firstCame" | "yeses" | "stops" | "stepsDone" | "emailStopped"
>;
type BookParts = Pick<PeopleReportVM, "wires" | "fresh" | "stuck" | "stand">;

/* ------------------------------------------------------------------- the window */

/** Whether anyone lived in the period before (one who reached you, a yes, a stop): the head and the strip compare against it alike. */
const priorHadOf = ({ reached, consent }: PeopleSeriesDto): boolean =>
  reached.before.people > 0 || consent.before.yes > 0 || consent.before.stop > 0;

/** The four figures, each against the period before in counts; the period before is compared only if anyone was in it. */
function stripOf({ reached, consent }: PeopleSeriesDto, days: number, priorHad: boolean): PeopleFigureVM[] {
  const { now, before } = reached;
  const against = (current: number, previous: number) => compareWords(current, previous, rangeLabelOf(days), priorHad);
  const { yes, stop } = consent.now;
  return [
    {
      id: "people-reached",
      metric: "people_reached",
      label: "People who reached you",
      value: String(now.people),
      meta: reachedMeta(now.people, now.new),
      compare: against(now.people, before.people),
    },
    {
      id: "new-people",
      metric: "new_people",
      label: "New people",
      value: String(now.new),
      meta: newMeta(now.people, now.new),
      compare: against(now.new, before.new),
      // A share of those who reached you: of fewer than five, it says nothing (the kit greys it).
      ...(now.people > 0 ? { n: now.people, minN: REPORT_MIN_N } : {}),
    },
    {
      id: "yeses-won",
      metric: "yeses_won",
      label: "Yeses won",
      value: String(yes.total),
      meta: yesesMeta(yes.by_purpose),
      compare: against(yes.total, consent.before.yes),
    },
    {
      id: "stops",
      metric: "stops_recorded",
      label: "Stops",
      value: String(stop.total),
      meta: stopsMeta(stop.by_purpose),
      compare: against(stop.total, consent.before.stop),
    },
  ];
}

/** A mix that draws its rows with their line, or says in words why there are none. */
const partOf = (entries: MixEntry[], line: string, empty: string): MixPartVM =>
  entries.length === 0 ? noMix(empty) : mixOf(entries, line);

function firstCamePart({ reached, first_came }: PeopleSeriesDto): MixPartVM {
  const fresh = reached.now.new;
  if (fresh === 0) return noMix(FIRST_CAME_NOBODY);
  const entries = firstCameEntries(first_came.by_via);
  const known = firstCameKnown(entries);
  return known === 0 ? noMix(firstCameNone(fresh)) : mixOf(entries, firstCameLine(known, fresh));
}

function windowOf(series: PeopleSeriesDto, days: number, book: PeopleNowDto | null): WindowParts {
  const { consent, steps, email_stopped } = series;
  const priorHad = priorHadOf(series);
  return {
    head: headWords(series.reached, days, book, priorHad),
    strip: stripOf(series, days, priorHad),
    // Spread: the DTO's `ByChannelDto` is an interface, which has no index signature to pass as a count by key.
    channels: partOf(channelEntries({ ...series.by_channel.now }), CHANNELS_LINE, CHANNELS_EMPTY),
    firstCame: firstCamePart(series),
    yeses: partOf(yesEntries(consent.now.yes.by_source), YESES_LINE, YESES_EMPTY),
    stops: partOf(stopEntries(consent.now.stop.by_source), STOPS_LINE, STOPS_EMPTY),
    stepsDone: partOf(stepsDoneEntries(steps), stepsDoneLine(steps), STEPS_DONE_EMPTY),
    emailStopped: partOf(
      emailStoppedEntries(email_stopped.by_reason),
      emailStoppedLine(email_stopped.total),
      EMAIL_STOPPED_EMPTY,
    ),
  };
}

/** What the lens draws of a database that has no people_series: nothing of the window, and no head (the frame's sentence stands). */
function noWindow(): WindowParts {
  return {
    head: null,
    strip: [],
    channels: noMix(null),
    firstCame: noMix(null),
    yeses: noMix(null),
    stops: noMix(null),
    stepsDone: noMix(null),
    emailStopped: noMix(null),
  };
}

/* -------------------------------------------------------------------- the book */

function wiresPart(book: PeopleNowDto): MixPartVM {
  if (book.people === 0) return noMix(BOOK_EMPTY);
  const { several } = book.wires;
  return {
    rows: barsOf(wireEntries(book.wires)),
    line: several > 0 ? wiresLine(several, book.people) : null,
    empty: null,
  };
}

function freshPart(book: PeopleNowDto): BookParts["fresh"] {
  if (book.people === 0) return { ...noMix(BOOK_EMPTY), quiet: null };
  return { ...mixOf(freshEntries(book.fresh), freshLine(book.people)), quiet: quietDoor(book.lists.quiet) };
}

/** `warn` for what needs you, `fail` for what failed, on the number and only when there is one (D10). */
const toned = (count: number, tone: "warn" | "fail"): { tone?: "warn" | "fail" } => (count > 0 ? { tone } : {});

/** What is stuck now: the steps whose day has come, and the addresses that no longer receive. As of now, whatever period is picked. */
function stuckNowFigures({ steps, email_stopped }: PeopleNowDto): PeopleFigureVM[] {
  return [
    {
      id: "steps-overdue",
      metric: "steps_overdue",
      label: "Steps overdue",
      value: String(steps.overdue),
      meta: stepsOverdueMeta(steps.overdue),
      compare: null,
      door: listDoor("steps_due"),
      ...toned(steps.overdue, "warn"),
    },
    {
      id: "steps-due-today",
      metric: "steps_due_today",
      label: "Steps due today",
      value: String(steps.due_today),
      meta: stepsDueTodayMeta(steps.due_today),
      compare: null,
      door: listDoor("steps_due"),
    },
    {
      id: "email-stopped",
      metric: "email_stopped_now",
      label: "Email stopped working",
      value: String(email_stopped),
      meta: emailStoppedNowMeta(email_stopped),
      compare: null,
      ...toned(email_stopped, "fail"),
    },
  ];
}

/**
 * The book's four lists, each named as People's rail names it (a test holds the labels to `BUILTIN_LISTS`' own; the lists
 * themselves are not imported, for they would bring the rule language into the page) and opening that list.
 */
const STAND_LISTS = [
  { id: "said-yes-messages", metric: "said_yes_messages", label: "Said yes to messages", list: "opted_in" },
  { id: "can-receive-offers", metric: "can_receive_offers", label: "Can receive offers", list: "offers_ok" },
  { id: "opted-out", metric: "opted_out_now", label: "Opted out", list: "opted_out" },
  { id: "quiet-30", metric: "quiet_now", label: "Quiet 30+ days", list: "quiet" },
] as const satisfies readonly {
  id: string;
  metric: ReportMetric;
  label: string;
  list: keyof PeopleNowDto["lists"];
}[];

/** Where the book stands: the people on each list, a share of the book (n is the book, and the kit greys it under five). */
function standFigures({ people, lists }: PeopleNowDto): PeopleFigureVM[] {
  return STAND_LISTS.map(({ id, metric, label, list }): PeopleFigureVM => ({
    id,
    metric,
    label,
    value: String(lists[list]),
    meta: standMeta(people),
    compare: null,
    door: listDoor(list),
    n: people,
    minN: REPORT_MIN_N,
  }));
}

function bookOf(book: PeopleNowDto): BookParts {
  return { wires: wiresPart(book), fresh: freshPart(book), stuck: stuckNowFigures(book), stand: standFigures(book) };
}

/** What the lens draws of a book that could not be counted: nothing, and the page says so. */
function noBook(): BookParts {
  return { wires: noMix(null), fresh: { ...noMix(null), quiet: null }, stuck: [], stand: [] };
}

/** The lens's own parts, in words, from the DTO the route answers. */
export function toPeopleReportVM(dto: PeopleDto): PeopleReportVM {
  const { series, now } = dto;
  return {
    windowAvailable: series !== null,
    nowAvailable: now !== null,
    ...(series === null ? noWindow() : windowOf(series, dto.days, now)),
    ...(now === null ? noBook() : bookOf(now)),
  };
}
