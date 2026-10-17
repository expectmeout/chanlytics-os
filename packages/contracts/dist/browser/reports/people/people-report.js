import { STOP_WORDS } from "../../consent/consent.js";
import { barsOf, mixOf, noMix } from "../report-mix.js";
import { REPORT_MIN_N, compareWords } from "../report-tiles.js";
import { rangeLabelOf } from "../reports.js";
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
  yesesMeta
} from "./people-words.js";
const priorHadOf = ({ reached, consent }) => reached.before.people > 0 || consent.before.yes > 0 || consent.before.stop > 0;
function stripOf({ reached, consent }, days, priorHad) {
  const { now, before } = reached;
  const against = (current, previous) => compareWords(current, previous, rangeLabelOf(days), priorHad);
  const { yes, stop } = consent.now;
  return [
    {
      id: "people-reached",
      metric: "people_reached",
      label: "People who reached you",
      value: String(now.people),
      meta: reachedMeta(now.people, now.new),
      compare: against(now.people, before.people)
    },
    {
      id: "new-people",
      metric: "new_people",
      label: "New people",
      value: String(now.new),
      meta: newMeta(now.people, now.new),
      compare: against(now.new, before.new),
      // A share of those who reached you: of fewer than five, it says nothing (the kit greys it).
      ...now.people > 0 ? { n: now.people, minN: REPORT_MIN_N } : {}
    },
    {
      id: "yeses-won",
      metric: "yeses_won",
      label: "Yeses won",
      value: String(yes.total),
      meta: yesesMeta(yes.by_purpose),
      compare: against(yes.total, consent.before.yes)
    },
    {
      id: "stops",
      metric: "stops_recorded",
      label: "Stops",
      value: String(stop.total),
      meta: stopsMeta(stop.by_purpose),
      compare: against(stop.total, consent.before.stop)
    }
  ];
}
const partOf = (entries, line, empty) => entries.length === 0 ? noMix(empty) : mixOf(entries, line);
function firstCamePart({ reached, first_came }) {
  const fresh = reached.now.new;
  if (fresh === 0) return noMix(FIRST_CAME_NOBODY);
  const entries = firstCameEntries(first_came.by_via);
  const known = firstCameKnown(entries);
  return known === 0 ? noMix(firstCameNone(fresh)) : mixOf(entries, firstCameLine(known, fresh));
}
function windowOf(series, days, book) {
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
      EMAIL_STOPPED_EMPTY
    )
  };
}
function noWindow() {
  return {
    head: null,
    strip: [],
    channels: noMix(null),
    firstCame: noMix(null),
    yeses: noMix(null),
    stops: noMix(null),
    stepsDone: noMix(null),
    emailStopped: noMix(null)
  };
}
function wiresPart(book) {
  if (book.people === 0) return noMix(BOOK_EMPTY);
  const { several } = book.wires;
  return {
    rows: barsOf(wireEntries(book.wires)),
    line: several > 0 ? wiresLine(several, book.people) : null,
    empty: null
  };
}
function freshPart(book) {
  if (book.people === 0) return { ...noMix(BOOK_EMPTY), quiet: null };
  return { ...mixOf(freshEntries(book.fresh), freshLine(book.people)), quiet: quietDoor(book.lists.quiet) };
}
const toned = (count, tone) => count > 0 ? { tone } : {};
function stuckNowFigures({ steps, email_stopped }) {
  return [
    {
      id: "steps-overdue",
      metric: "steps_overdue",
      label: "Steps overdue",
      value: String(steps.overdue),
      meta: stepsOverdueMeta(steps.overdue),
      compare: null,
      door: listDoor("steps_due"),
      ...toned(steps.overdue, "warn")
    },
    {
      id: "steps-due-today",
      metric: "steps_due_today",
      label: "Steps due today",
      value: String(steps.due_today),
      meta: stepsDueTodayMeta(steps.due_today),
      compare: null,
      door: listDoor("steps_due")
    },
    {
      id: "email-stopped",
      metric: "email_stopped_now",
      label: "Email stopped working",
      value: String(email_stopped),
      meta: emailStoppedNowMeta(email_stopped),
      compare: null,
      ...toned(email_stopped, "fail")
    }
  ];
}
const STAND_LISTS = [
  { id: "said-yes-messages", metric: "said_yes_messages", label: "Said yes to messages", list: "opted_in" },
  { id: "can-receive-offers", metric: "can_receive_offers", label: "Can receive offers", list: "offers_ok" },
  { id: "opted-out", metric: "opted_out_now", label: STOP_WORDS.pill, list: "opted_out" },
  { id: "quiet-30", metric: "quiet_now", label: "Quiet 30+ days", list: "quiet" }
];
function standFigures({ people, lists }) {
  return STAND_LISTS.map(({ id, metric, label, list }) => ({
    id,
    metric,
    label,
    value: String(lists[list]),
    meta: standMeta(people),
    compare: null,
    door: listDoor(list),
    n: people,
    minN: REPORT_MIN_N
  }));
}
function bookOf(book) {
  return { wires: wiresPart(book), fresh: freshPart(book), stuck: stuckNowFigures(book), stand: standFigures(book) };
}
function noBook() {
  return { wires: noMix(null), fresh: { ...noMix(null), quiet: null }, stuck: [], stand: [] };
}
export function toPeopleReportVM(dto) {
  const { series, now } = dto;
  return {
    windowAvailable: series !== null,
    nowAvailable: now !== null,
    ...series === null ? noWindow() : windowOf(series, dto.days, now),
    ...now === null ? noBook() : bookOf(now)
  };
}
