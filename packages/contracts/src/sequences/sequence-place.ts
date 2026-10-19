/**
 * A lead's place in a sequence, worked out once (00459 sequence_places) and said the same in every window that shows it
 * (the canvas's "One place, two windows", 18 Oct 2026): the lead sheet's Sequence section and the word beside its name,
 * a sequence's Leads tab, and Leads' "Where they stand" cell. Pure: the clock is an argument.
 *
 *   SequencePlaceDto     sequence_place: the sequence, the lead's row as its People tab files it, its sends, how replies come
 *   SequencePlaceOfDto   sequence_places_of: many leads' places, one row a lead
 *   placeWordOf          the word beside a name, its tone, and the line under it (a table's cell, the sheet's head)
 *   placeRailOf          the record's rail drawn for one lead (their place) or as they'd get it (before they join)
 *   heldChoicesOf        what a held email may become, by why it was held and the step it is
 */
import { clockDate, clockNear } from "../shared/clock";
import { capitalize, plural } from "../shared/words";
import { holdDoors, holdWords, isReachOutHold, type HoldDoor } from "../reach-out/reach-out-words";
import type { SequenceState } from "./sequence";
import type {
  SequencePeopleGroup,
  SequencePersonDraftDto,
  SequencePersonReplyDto,
  SequenceStepDto,
} from "./sequence-dto";
import { scheduleDays, scheduleWait } from "./sequence-schedule";
import { sequenceLeftWords } from "./sequence-words";

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

/** The places that need you. */
const NEEDS_YOU: ReadonlySet<SequencePeopleGroup> = new Set(["waiting", "held", "to_send", "replied"]);
/** The places that still stand: who is in it, as its Leads tab counts them. */
const STANDS: ReadonlySet<SequencePeopleGroup> = new Set(["waiting", "held", "to_send", "next", "queued", "in"]);

/** Whether a place still stands: they are in it. */
export const placeStands = (g: SequencePeopleGroup): boolean => STANDS.has(g);

/** A place's tone: amber needs you, green while it stands, plain once over. */
export const placeToneOf = (g: SequencePeopleGroup): PlaceTone =>
  NEEDS_YOU.has(g) ? "warn" : STANDS.has(g) ? "ok" : "plain";

/** What a place is read from: its row (a People row, a places_of row, sequence_place's row). */
type PlaceRow = Pick<SequencePlaceRowDto, "group" | "place" | "at" | "why">;

/** Where a lead added and not yet planned stands, by the sequence's own state. */
const queuedLine = (state: SequenceState): string =>
  state === "draft" ? "Joins when you start it" : state === "paused" ? "Waits until it's on" : "In its next batch";

/** The step a row is at, as a place says it. */
const stepWordOf = (r: PlaceRow) => `Step ${r.place ?? 1}`;

/**
 * The word beside a lead's name and the line under it, wherever its place is said (Leads' cell, the sheet's head, the
 * picker): what needs you by its own word, the step and the sequence under it; a place that stands as In and the
 * sequence's name, with when; one that ended as Done or Left, with why.
 */
export function placeWordOf(
  r: PlaceRow,
  seq: { name: string; state: SequenceState },
  clock: { tz: string; nowMs: number },
  /** Leads' cell names the sequence in the word ("In Bookstore intro"); the sheet's head, beside its name, does not. */
  named = true,
): { word: string; tone: PlaceTone; line: string | null } {
  const at = r.at ? Date.parse(r.at) : NaN;
  const when = Number.isFinite(at) ? clockNear(at, clock.tz, clock.nowMs) : null;
  const tone = placeToneOf(r.group);
  const inIt = named ? `In ${seq.name}` : PLACE_WORDS.in;
  switch (r.group) {
    case "waiting":
    case "held":
    case "to_send":
      return { word: PLACE_WORDS[r.group], tone, line: `${stepWordOf(r)} · ${seq.name}` };
    case "replied":
      return { word: PLACE_WORDS.replied, tone, line: when ? `${seq.name} · ${when}` : seq.name };
    case "queued":
      return { word: inIt, tone, line: queuedLine(seq.state) };
    case "next":
      return { word: inIt, tone, line: when ? `${stepWordOf(r)} ${when}` : stepWordOf(r) };
    case "in":
      return { word: inIt, tone, line: when ? `Next step ${when}` : "Between steps" };
    case "done":
      return { word: PLACE_WORDS.done, tone, line: `${seq.name} · every step went` };
    case "left":
      return { word: PLACE_WORDS.left, tone, line: `${seq.name} · ${sequenceLeftWords(r.why) || "taken out"}` };
  }
}

/* -------------------------------------------------------------------------------------------- a held email -- */

/** What a held email may become, in the doors' words (the canvas's one meaning each: Send as written, Skip this email). */
const HELD_CHOICE_WORDS: Record<HoldDoor, string> = {
  include: "Send as written",
  rewrite: "Rewrite the opening",
  skip: "Skip this email",
  not_a_fit: "Not a fit",
};

/**
 * The choices a held email offers, by why it was held (contracts holdDoors) and its step: Skip this email from step 2,
 * where the lead goes on to the next step (00459); at step 1 skipping would end their place, which Take out says.
 */
export function heldChoicesOf(hold: string | null, place: number | null): [HoldDoor, string][] {
  const doors: HoldDoor[] = isReachOutHold(hold) ? holdDoors(hold) : ["include", "skip"];
  return doors.filter((d) => d !== "skip" || (place ?? 1) > 1).map((d) => [d, HELD_CHOICE_WORDS[d]]);
}

/** Why a held email was held, said once: "the opening says “award-winning”, which the listing doesn't back". */
const heldWhyOf = (hold: string | null, detail: string | null): string | null =>
  isReachOutHold(hold) ? capitalize(holdWords(hold, detail)) : null;

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
  s: SequencePlaceSendDto,
  row: SequencePlaceRowDto | null,
  clock: { tz: string; nowMs: number },
): PlaceRailStepVM["state"] {
  const at = (x: string | null) => (x ? Date.parse(x) : NaN);
  if (s.state === "sent" || s.state === "handed") {
    const t = at(s.sent_at);
    return { tone: "done", words: Number.isFinite(t) ? `Sent ${clockDate(t, clock.tz, clock.nowMs)}` : "Sent" };
  }
  if (s.state === "held") {
    const why = heldWhyOf(s.reason, s.hold_detail);
    return { tone: "need", words: why ? `Held: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : "Held by the check" };
  }
  if (s.state === "drafted") return { tone: "need", words: "Yours to send, from your own inbox" };
  if (s.state === "skipped")
    return { tone: "done", words: s.reason === "owner_skipped" ? "Skipped" : capitalize(sequenceLeftWords(s.reason)) };
  if (s.state === "failed") return { tone: "done", words: "Didn't go" };
  // Planned, claimed or on its way: in a batch waiting for an OK where their place says so, else when it goes.
  if (row && row.send_id === s.id && row.group === "waiting")
    return { tone: "need", words: "In today's batch · waits for your OK" };
  const t = at(s.send_at);
  return { tone: "next", words: Number.isFinite(t) ? `Goes ${clockNear(t, clock.tz, clock.nowMs)}` : "Goes next" };
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
export function placeRailOf(p: {
  lens: Exclude<PlaceRailLens, "everyone">;
  steps: readonly RailStep[];
  titles: ReadonlyMap<number, string>;
  seq: SequenceState;
  place: SequencePlaceDto | null;
  readsReplies: boolean;
  clock: { tz: string; nowMs: number };
}): PlaceRailVM {
  const W = PLACE_RAIL_WORDS;
  const days = scheduleDays(p.steps);
  const sends = p.place ? p.place.sends : [];
  const row = p.place ? p.place.place : null;
  let ahead = false;
  const stateOf = (s: RailStep): PlaceRailStepVM["state"] => {
    if (p.lens === "preview") return s.place === 1 ? { tone: "next", words: W.afterOk } : null;
    const own = sends.filter((x) => x.step_id === s.id).at(-1) ?? null;
    if (own) return sendStateOf(own, row, p.clock);
    const first = !ahead;
    ahead = true;
    return aheadStateOf(s, first, { row, seq: p.seq, clock: p.clock });
  };
  const steps = [...p.steps]
    .sort((a, b) => a.place - b.place)
    .map((s): PlaceRailStepVM => {
      const state = stateOf(s);
      const title = p.titles.get(s.place) ?? (s.hand ? s.hand.words : s.place === 1 ? W.email : W.followUp);
      return {
        id: s.id,
        place: s.place,
        day: days.get(s.place) ?? 1,
        title,
        how: s.hand ? W.task : p.lens === "preview" ? W.asTheyGet : W.email,
        state: state && state.words ? state : null,
        wait: s.place > 1 ? scheduleWait(s) : null,
        hand: !!s.hand,
      };
    });
  const joined = p.place ? p.place.joined : null;
  const joinedAt = joined && joined.at ? Date.parse(joined.at) : NaN;
  const date = Number.isFinite(joinedAt) ? clockDate(joinedAt, p.clock.tz, p.clock.nowMs) : null;
  const start =
    p.lens === "preview"
      ? { head: W.joinsWhenAdded, sub: W.checked }
      : {
          head: date ? (joined && joined.auto ? W.joinedOn(date) : W.addedOn(date)) : W.added,
          sub: W.checked,
        };
  return { start, steps, end: { head: W.stops, sub: p.readsReplies ? W.readFrom : W.toldBy } };
}

/** How many steps a sequence has and the days they span, as the picker says it: "3 steps over 7 days". */
export function placeSpanOf(steps: number, days: number): string {
  const n = plural(steps, "step", "steps");
  return days > 0 ? `${n} over ${plural(days, "day", "days")}` : n;
}
