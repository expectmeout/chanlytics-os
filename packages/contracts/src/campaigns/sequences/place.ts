/**
 * A lead's place in a sequence, worked out once (00459 sequence_places) and said the same in every window that shows it
 * (the canvas's "One place, two windows", 18 Oct 2026): the lead sheet's Sequence section and the word beside its name,
 * a sequence's Leads tab, and Leads' "Where they stand" cell. Pure: the clock is an argument.
 *
 *   SequencePlaceDto     sequence_place: the sequence, the lead's row as its People tab files it, its sends, how replies come
 *   SequencePlaceOfDto   sequence_places_of: many leads' places, one row a lead
 *   placeWordOf          the word beside a name, its tone, and the line under it (a table's cell, a row, the sheet's head)
 *   placeRailOf          the record's rail drawn for one lead (their place) or as they'd get it (before they join)
 */
import { clockDate, clockNear } from "../../shared/clock";
import { capitalize, plural } from "../../shared/words";
import type { ReachOutWhyNot } from "../reach-out/leads/standing";
import { isReachOutHold } from "../reach-out/words/claims";
import { heldWhyOf } from "./held";
import type { SequenceState } from "./sequence";
import type { SequencePeopleGroup, SequencePersonDraftDto, SequencePersonReplyDto, SequenceStepDto } from "./dto";
import { scheduleDays, scheduleWait } from "./schedule";
import { sequenceLeftWords } from "./words/next";

/* ------------------------------------------------------------------------------------------------- the reads -- */

/** One send of the lead's in its sequence, as sequence_place answers it: the rail drawn for one lead reads these. */
export interface SequencePlaceSendDto {
  id: string;
  step_id: string;
  place: number;
  state: string;
  reason: string | null;
  hold_detail: string | null;
  send_at: string | null;
  sent_at: string | null;
  drafted_at: string | null;
  batch_id: string | null;
}

/** The lead's row, as its sequence's People tab files it (sequence_people's row, less the name it already has). */
export interface SequencePlaceRowDto {
  group: SequencePeopleGroup;
  enrollment_id: string | null;
  send_id: string | null;
  batch_id: string | null;
  place: number | null;
  at: string | null;
  why: string | null;
  hold_detail: string | null;
  draft: SequencePersonDraftDto | null;
  reply: SequencePersonReplyDto | null;
  /**
   * On an email waiting for an OK, held or up next, the opening it goes with (null until the check writes it, or where its
   * words have none) and whether the check has read it. Absent on every other row, as People's read has them.
   */
  opening?: string | null;
  checked?: boolean;
  /** Beside them: its lead has words of their own at its step, holding no line, so those are what it goes with (decision 0096). */
  own?: boolean;
  /** Beside them: the check put it off until then, where it did (its day's share, a model's bad hour). */
  check_after?: string | null;
}

/**
 * One lead's place (00459 sequence_place): the sequence it stands in (where its place stands, else the last it was in),
 * its row, each send of its there, whether replies there are read from a connected mailbox or told (They wrote back…),
 * and whether its owner sends its emails. Null for a lead in no sequence.
 */
export interface SequencePlaceDto {
  sequence: { id: string; name: string; state: SequenceState };
  place: SequencePlaceRowDto;
  sends: SequencePlaceSendDto[];
  reads_replies: boolean;
  owner_sends: boolean;
  /** When they joined its list: by hand, or from the search it adds from (auto-add). */
  joined: { at: string | null; auto: boolean } | null;
  /** The leave Put back would undo, where it took this lead alone out; absent or null where there is none. */
  put_back?: { decision_id: string } | null;
}

/** Many leads' places (00459 sequence_places_of): one row a lead in a sequence, the place that stands first. */
export interface SequencePlaceOfDto {
  lead_id: string;
  sequence_id: string;
  name: string;
  state: SequenceState;
  group: SequencePeopleGroup;
  place: number | null;
  at: string | null;
  why: string | null;
}

/* ------------------------------------------------------------------------------------------------- the word -- */

/** A word's tone, as the house's tone pill draws it: amber needs you, green runs, plain is over. */
export type PlaceTone = "warn" | "ok" | "plain";

/** Each place said beside a name, in the singular (the canvas's States board); in it, up next and added are In it. */
export const PLACE_WORDS: Record<SequencePeopleGroup, string> = {
  waiting: "Waits for your OK",
  held: "Held",
  to_send: "Yours to send",
  replied: "Wrote back",
  next: "In it",
  queued: "In it",
  in: "In it",
  done: "Done",
  left: "Left",
};

/** In it, as a row says it, where the sequence is named in the line under the word, never in the word. */
const PLACE_IN_ROW_WORD = "In sequence";

/** A lead on a sequence's list that its next batch cannot take: the word, amber, with why in the line. */
export const PLACE_NOT_PLANNED_WORD = "Not planned";

/**
 * Why a lead on a sequence's list is not planned, in the door's own reasons (reach_out_why_not, read for the list's leads
 * by sequence_queued_why_not): its row said "In its next batch" of a lead no batch could ever take (the phone walk of 3 Nov
 * 2026: three plumbers whose addresses could not be checked). Checking is no reason: the address is on its way.
 */
const NOT_PLANNED_WORDS: Partial<Record<ReachOutWhyNot, string>> = {
  gone: "No longer in your leads",
  closed: "Already worked",
  customer: "Already a customer",
  suppressed: "Asked not to be written to",
  written: "Already written to",
  shared: "Shares a number or site with another lead",
  no_email: "No email address",
  unconfirmed: "Their address can't be confirmed",
  invalid: "Their address bounced",
  unchecked: "Their address couldn't be checked",
};

/** Why a lead on a list is not planned, or null where its next batch can take it. */
export const placeNotPlannedOf = (reason: string | null): string | null =>
  reason ? (NOT_PLANNED_WORDS[reason as ReachOutWhyNot] ?? null) : null;

/** A lead on a list whose address is still being checked: it joins the batch after that. */
const QUEUED_CHECKING = "Joins once their address is checked";

/** The places that need you. */
const NEEDS_YOU: ReadonlySet<SequencePeopleGroup> = new Set(["waiting", "held", "to_send", "replied"]);
/** The places that still stand: who is in it, as its Leads tab counts them. */
const STANDS: ReadonlySet<SequencePeopleGroup> = new Set(["waiting", "held", "to_send", "next", "queued", "in"]);

/** Whether a place still stands: they are in it. */
export const placeStands = (peopleGroup: SequencePeopleGroup): boolean => STANDS.has(peopleGroup);

/** A place's tone: amber needs you, green while it stands, plain once over. */
export const placeToneOf = (peopleGroup: SequencePeopleGroup): PlaceTone =>
  NEEDS_YOU.has(peopleGroup) ? "warn" : STANDS.has(peopleGroup) ? "ok" : "plain";

/** What a place is read from: its row (a People row, a places_of row, sequence_place's row). */
type PlaceRow = Pick<SequencePlaceRowDto, "group" | "place" | "at" | "why">;

/**
 * Whether the check is at an email's line now (decision 0098): it comes to every planned email within minutes, whatever
 * its day, unless its sequence is not on or it was put off. What holds no line is the caller's to know.
 */
export const placeLineWriting = (
  row: { checked?: boolean; check_after?: string | null },
  seq: { state: SequenceState },
  nowMs: number,
): boolean => row.checked === false && seq.state === "on" && !(row.check_after && Date.parse(row.check_after) > nowMs);

/** Where a lead added and not yet planned stands, by the sequence's own state. */
const queuedLine = (state: SequenceState): string =>
  state === "draft" ? "Joins when you start it" : state === "paused" ? "Waits until it's on" : "In its next batch";

/** The step a row is at, as a place says it. */
const stepWordOf = (r: PlaceRow) => `Step ${r.place ?? 1}`;

/**
 * The word beside a lead's name and the line under it, wherever its place is said (Leads' cell, a row, the sheet's head,
 * the picker): what needs you by its own word, the step and the sequence under it; a place that stands as In and the
 * sequence's name, with when; a lead on a list its next batch cannot take as Not planned, with why; one that ended as
 * Done, or by why it left ("Taken out", "Wrote back"), never "Left", which Leads' Filtered out once sat beside.
 */
export function placeWordOf(
  place: PlaceRow,
  seq: { name: string; state: SequenceState },
  clock: { tz: string; nowMs: number },
  /**
   * Where the sequence is named: in the word ("In Bookstore intro", Leads' Stage cell), in the line under a short word
   * ("line": a row, whose one status is the place's word: In sequence, then "Step 1 Tue 9:00 AM · Bookstore intro"), or
   * nowhere for In it (false: the sheet's head, which says it beside).
   */
  named: boolean | "line" = true,
): { word: string; tone: PlaceTone; line: string | null } {
  const at = place.at ? Date.parse(place.at) : NaN;
  const when = Number.isFinite(at) ? clockNear(at, clock.tz, clock.nowMs) : null;
  const tone = placeToneOf(place.group);
  const inIt = named === true ? `In ${seq.name}` : named === "line" ? PLACE_IN_ROW_WORD : PLACE_WORDS.in;
  const withName = (line: string) => (named === "line" ? `${line} · ${seq.name}` : line);
  switch (place.group) {
    case "waiting":
    case "held":
    case "to_send":
      return { word: PLACE_WORDS[place.group], tone, line: `${stepWordOf(place)} · ${seq.name}` };
    case "replied":
      return { word: PLACE_WORDS.replied, tone, line: when ? `${seq.name} · ${when}` : seq.name };
    case "queued": {
      const not = placeNotPlannedOf(place.why);
      if (not)
        return { word: PLACE_NOT_PLANNED_WORD, tone: "warn", line: named === false ? not : `${not} · ${seq.name}` };
      return { word: inIt, tone, line: withName(place.why === "checking" ? QUEUED_CHECKING : queuedLine(seq.state)) };
    }
    case "next":
      return { word: inIt, tone, line: withName(when ? `${stepWordOf(place)} ${when}` : stepWordOf(place)) };
    case "in":
      return { word: inIt, tone, line: withName(when ? `Next step ${when}` : "Between steps") };
    case "done":
      return { word: PLACE_WORDS.done, tone, line: `${seq.name} · every step went` };
    case "left":
      return { word: placeLeftWord(place.why), tone, line: seq.name };
  }
}

/** Why someone left, as the word that stands for their place: "Taken out", "Wrote back", "Unsubscribed". */
export const placeLeftWord = (reason: string | null): string => capitalize(sequenceLeftWords(reason) || "taken out");

/* -------------------------------------------------------------------------------------------- a held email -- */

/** Why a held email was held, said once as every held row says it (contracts heldWhyOf); none for a reason not the check's. */
const placeHeldWhy = (hold: string | null, detail: string | null): string | null =>
  isReachOutHold(hold) ? heldWhyOf(hold, detail) : null;

/* -------------------------------------------------------------------------------------------------- the rail -- */

/** Which way the rail is drawn: everyone's (the record's own Steps), one lead's place, or as they'd get it before joining. */
export type PlaceRailLens = "everyone" | "one" | "preview";

/** A step on the rail for one lead, or as they'd get it: its day, its title, how it goes, and what it is doing for them. */
export interface PlaceRailStepVM {
  id: string;
  place: number;
  day: number;
  title: string;
  /** "Email", "Email · as they'd get it", "A task for you". */
  how: string;
  /** What it is doing for them: amber where it needs you, quiet where it is coming, done once it went. */
  state: { tone: "need" | "next" | "done"; words: string } | null;
  /** The wait before it, and who it keeps going; null for the first. */
  wait: { wait: string; only: string | null } | null;
  hand: boolean;
}

/** The rail for one lead: where they joined, each step, and what stops it. */
export interface PlaceRailVM {
  start: { head: string; sub: string | null };
  steps: PlaceRailStepVM[];
  end: { head: string; sub: string };
}

export const PLACE_RAIL_WORDS = {
  theirPlace: "Their place",
  ifAdded: "If you add them",
  joinsWhenAdded: "Joins when you add them",
  checked: "Each email is checked before it goes",
  addedOn: (date: string) => `You added them ${date}`,
  joinedOn: (date: string) => `Joined on its own ${date}`,
  added: "You added them",
  email: "Email",
  asTheyGet: "Email · as they'd get it",
  task: "A task for you",
  followUp: "Following up",
  stops: "Stops when they reply, book, bounce, unsubscribe or say no.",
  readFrom: "Replies are read from your connected mailbox.",
  toldBy: "Replies aren't read here: say so with They wrote back…",
  takeOut: (name: string) => `Take out of ${name}`,
  afterOk: "Goes after your OK",
} as const;

/** What a step's own send did for them, on its box. */
function sendStateOf(
  sequencePlaceSend: SequencePlaceSendDto,
  row: SequencePlaceRowDto | null,
  clock: { tz: string; nowMs: number },
): PlaceRailStepVM["state"] {
  const at = (x: string | null) => (x ? Date.parse(x) : NaN);
  if (sequencePlaceSend.state === "sent" || sequencePlaceSend.state === "handed") {
    const t = at(sequencePlaceSend.sent_at);
    return { tone: "done", words: Number.isFinite(t) ? `Sent ${clockDate(t, clock.tz, clock.nowMs)}` : "Sent" };
  }
  if (sequencePlaceSend.state === "held") {
    const reason = placeHeldWhy(sequencePlaceSend.reason, sequencePlaceSend.hold_detail);
    return {
      tone: "need",
      words: reason ? `Held: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}` : "Held by the check",
    };
  }
  if (sequencePlaceSend.state === "drafted") return { tone: "need", words: "Yours to send, from your own inbox" };
  if (sequencePlaceSend.state === "skipped")
    return {
      tone: "done",
      words:
        sequencePlaceSend.reason === "owner_skipped"
          ? "Skipped"
          : capitalize(sequenceLeftWords(sequencePlaceSend.reason)),
    };
  if (sequencePlaceSend.state === "failed") return { tone: "done", words: "Didn't go" };
  // Planned, claimed or on its way: in a batch waiting for an OK where their place says so, else when it goes.
  if (row && row.send_id === sequencePlaceSend.id && row.group === "waiting")
    return { tone: "need", words: "In today's batch · waits for your OK" };
  const item = at(sequencePlaceSend.send_at);
  return {
    tone: "next",
    words: Number.isFinite(item) ? `Goes ${clockNear(item, clock.tz, clock.nowMs)}` : "Goes next",
  };
}

/** A step with no send of theirs yet: the next one says when, the rest wait their turn. */
function aheadStateOf(
  step: Pick<SequenceStepDto, "place">,
  first: boolean,
  { row, seq, clock }: { row: SequencePlaceRowDto | null; seq: SequenceState; clock: { tz: string; nowMs: number } },
): PlaceRailStepVM["state"] {
  if (!first || !row) return null;
  if (row.group === "queued") return { tone: "next", words: step.place === 1 ? queuedLine(seq) : "" };
  if (row.group === "in") {
    const t = row.at ? Date.parse(row.at) : NaN;
    return { tone: "next", words: Number.isFinite(t) ? `Goes ${clockNear(t, clock.tz, clock.nowMs)}` : "Next" };
  }
  return null;
}

/** The step a rail reads: its place, wait, hand, conditions and kind. */
type RailStep = Pick<SequenceStepDto, "id" | "place" | "after_days" | "hand" | "only_if" | "kind">;

/**
 * The record's rail drawn for one lead ("one": each step by what its send did, the next by when it goes; Start says when
 * they joined) or as they'd get it before they join ("preview": each email as they'd get it, step 1 after your OK, a
 * batch carrying leads you added asks first). Titles are the page's (each email's subject as this lead reads it). The
 * end says what stops it, and how a reply is learned of: read from a connected mailbox, or told.
 */
export function placeRailOf(params: {
  lens: Exclude<PlaceRailLens, "everyone">;
  steps: readonly RailStep[];
  titles: ReadonlyMap<number, string>;
  seq: SequenceState;
  place: SequencePlaceDto | null;
  readsReplies: boolean;
  clock: { tz: string; nowMs: number };
}): PlaceRailVM {
  const words = PLACE_RAIL_WORDS;
  const days = scheduleDays(params.steps);
  const sends = params.place ? params.place.sends : [];
  const row = params.place ? params.place.place : null;
  let ahead = false;
  const stateOf = (s: RailStep): PlaceRailStepVM["state"] => {
    if (params.lens === "preview") return s.place === 1 ? { tone: "next", words: words.afterOk } : null;
    const own = sends.filter((x) => x.step_id === s.id).at(-1) ?? null;
    if (own) return sendStateOf(own, row, params.clock);
    const first = !ahead;
    ahead = true;
    return aheadStateOf(s, first, { row, seq: params.seq, clock: params.clock });
  };
  const steps = [...params.steps]
    .sort((a, b) => a.place - b.place)
    .map((text): PlaceRailStepVM => {
      const state = stateOf(text);
      const title =
        params.titles.get(text.place) ??
        (text.hand ? text.hand.words : text.place === 1 ? words.email : words.followUp);
      return {
        id: text.id,
        place: text.place,
        day: days.get(text.place) ?? 1,
        title,
        how: text.hand ? words.task : params.lens === "preview" ? words.asTheyGet : words.email,
        state: state && state.words ? state : null,
        wait: text.place > 1 ? scheduleWait(text) : null,
        hand: !!text.hand,
      };
    });
  const joined = params.place ? params.place.joined : null;
  const joinedAt = joined && joined.at ? Date.parse(joined.at) : NaN;
  const date = Number.isFinite(joinedAt) ? clockDate(joinedAt, params.clock.tz, params.clock.nowMs) : null;
  const start =
    params.lens === "preview"
      ? { head: words.joinsWhenAdded, sub: words.checked }
      : {
          head: date ? (joined && joined.auto ? words.joinedOn(date) : words.addedOn(date)) : words.added,
          sub: words.checked,
        };
  return { start, steps, end: { head: words.stops, sub: params.readsReplies ? words.readFrom : words.toldBy } };
}

/** How many steps a sequence has and the days they span, as the picker says it: "3 steps over 7 days". */
export function placeSpanOf(steps: number, days: number): string {
  const n = plural(steps, "step", "steps");
  return days > 0 ? `${n} over ${plural(days, "day", "days")}` : n;
}
