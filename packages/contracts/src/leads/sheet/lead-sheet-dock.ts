/**
 * The lead sheet, in Sequences' words (the refined canvas, 17 Oct 2026): where a lead stands, said as the sequence's Leads
 * tab files it, so Leads' rows, the sheet and the record never disagree; the sequence box on the card, the door to the
 * record with Change beside it; and the dock at the sheet's foot, which holds only what needs you (one line, one fact, at
 * most two acts) and is not drawn when nothing does, as a sequence's record has it. Every sentence is here.
 *
 *   leadSheetPlaceOf   where they stand in the sequence they are in, from their story's sends and readings
 *   leadSheetWordOf    the word beside the name, and its tone: the place, or the lead's own state before a sequence
 *   leadSheetBoxOf     the sequence box: Joins, In, Left or Can't join, the sequence by name, and its one line
 *   leadSheetDockOf    the dock: its line, its fact and its acts, by the lead's state and its place
 *   leadLinePlaceOf    a row's place on Leads, from the open search's lines, in the same words (the Stage cell)
 */
import { clockDate, clockNear } from "../../shared/clock";
import { DAY_MS } from "../../shared/time";
import { capitalize } from "../../shared/words";
import type { ReachOutLeadLineDto, ReachOutLeadTimelineDto } from "../../reach-out/reach-out-leads";
import { REPLY_INTENT_WORDS, isReplyIntent } from "../../reach-out/reach-out-replies";
import { holdWords, isReachOutHold, type ReachOutHold } from "../../reach-out/reach-out-words";
import { sequenceLeftWords } from "../../sequences/sequence-words";
import type { LeadSheetAct, LeadSheetClosedVM, LeadSheetSlotVM, LeadSheetState } from "./lead-sheet";

/* ------------------------------------------------------------------------------------------------- the place -- */

/** Where someone stands in a sequence, as its Leads tab files them (contracts SEQUENCE_PEOPLE_GROUPS). */
export type LeadPlaceGroup = "waiting" | "held" | "to_send" | "replied" | "next" | "in" | "done" | "left";

/** Each place said beside a name: the group's own word, in the singular (the canvas's States board). */
export const LEAD_PLACE_WORDS: Record<LeadPlaceGroup, string> = {
  waiting: "Waits for your OK",
  held: "Held",
  to_send: "For you to send",
  replied: "Wrote back",
  next: "Up next",
  in: "In it",
  done: "Done",
  left: "Left",
};

/** Where they stand in their sequence: the place, its step, and the send that needs you there. */
export interface LeadPlaceVM {
  group: LeadPlaceGroup;
  /** The step they are at, from 1. */
  step: number;
  /** A held send to decide, or one drafted for its owner to send; null where none waits on you. */
  sendId: string | null;
  /** Why the check held it. */
  hold: ReachOutHold | null;
  holdDetail: string | null;
  /** The batch a drafted send waits in, where its owner sends it. */
  runId: string | null;
  /** What it means, in one line: "Step 1 held: …", "Step 2 Thu 9:00 AM", "Left · you stopped writing". */
  line: string;
}

/** A send still to go: planned, being claimed, or on its way. */
const PENDING = new Set(["planned", "claimed", "queued"]);
/** The readings that ask for an answer, as the overview counts one (00442) and People's replied group files one (00455). */
const ASKS_ANSWER = new Set(["interested", "question"]);
/** How long a reply asks for an answer, as the overview counts one (00442: read in the last 14 days). */
const ASKS_FOR = 14 * DAY_MS;

/** A person's reading that asks for an answer, read in the last 14 days and not undone: they wrote back. */
const wroteBack = (t: ReachOutLeadTimelineDto, nowMs: number) =>
  t.readings.some(
    (r) =>
      !r.undone &&
      (r.claim === "person" || r.claim === "owner") &&
      ASKS_ANSWER.has(r.intent) &&
      nowMs - Date.parse(r.read_at) <= ASKS_FOR,
  );

/** The step a send is, from 1. */
const placeStepOf = (n: number | null) => (n === null ? 1 : n + 1);

type Send = ReachOutLeadTimelineDto["sends"][number];
const NO_SEND = { sendId: null, hold: null, holdDetail: null, runId: null };

/** A send of theirs that waits on you or on the clock: held by the check, drafted for you, in a batch for your OK, planned. */
function pendingPlaceOf(
  sends: readonly Send[],
  t: ReachOutLeadTimelineDto,
  nowMs: number,
  tz: string,
): LeadPlaceVM | null {
  const held = sends.find((s) => s.state === "held");
  if (held) {
    const hold = isReachOutHold(held.reason) ? held.reason : null;
    const step = placeStepOf(held.n);
    return {
      ...NO_SEND,
      group: "held",
      step,
      sendId: held.id,
      hold,
      line: LEAD_PLACE_LINES.held(step, hold && holdWords(hold, null)),
    };
  }
  const drafted = sends.find((s) => s.state === "drafted");
  if (drafted) {
    const step = placeStepOf(drafted.n);
    return {
      ...NO_SEND,
      group: "to_send",
      step,
      sendId: drafted.id,
      runId: drafted.run_id ?? null,
      line: LEAD_PLACE_LINES.toSend(step),
    };
  }
  const pending = sends.find((s) => PENDING.has(s.state));
  if (!pending) return null;
  const step = placeStepOf(pending.n);
  // A planned email in a batch that waits for its owner's OK (00426: a batch carrying leads you added asks first).
  if (pending.state === "planned" && t.chain && t.chain.waiting_run_id)
    return { ...NO_SEND, group: "waiting", step, line: LEAD_PLACE_LINES.waiting(step) };
  const when = pending.send_at ? clockNear(Date.parse(pending.send_at), tz, nowMs) : null;
  return { ...NO_SEND, group: "next", step, line: LEAD_PLACE_LINES.next(step, when) };
}

/** Why their place ended, by their story: stopped, said no, bounced, booked, or the reason the last send went nowhere. */
function leftWhyOf(t: ReachOutLeadTimelineDto, sends: readonly Send[]): string | null {
  const last = sends.at(-1);
  if (t.stopped_at) return "owner_stopped";
  if (t.closed_reason === "said_no") return "said_no";
  if (sends.some((s) => s.bounced)) return "bounced";
  if (t.booked_at) return "booked";
  return last && (last.state === "skipped" || last.state === "failed") ? (last.reason ?? "removed") : null;
}

/** Nothing of theirs waits: left (with why), every step gone, or between steps. */
function settledPlaceOf(sends: readonly Send[], t: ReachOutLeadTimelineDto, nowMs: number, tz: string): LeadPlaceVM {
  const last = sends.at(-1);
  const why = leftWhyOf(t, sends);
  if (why)
    return { ...NO_SEND, group: "left", step: placeStepOf(last ? last.n : null), line: LEAD_PLACE_LINES.left(why) };
  const gone = sends.filter((s) => s.left);
  const steps = t.chain && t.chain.steps ? t.chain.steps.length : 0;
  if (steps > 0 && gone.length >= steps) return { ...NO_SEND, group: "done", step: steps, line: LEAD_PLACE_LINES.done };
  const sent = gone.at(-1);
  const at = sent && sent.sent_at ? clockDate(Date.parse(sent.sent_at), tz, nowMs) : null;
  const step = placeStepOf(sent ? sent.n : null);
  return { ...NO_SEND, group: "in", step, line: LEAD_PLACE_LINES.in(step, at) };
}

/**
 * Where they stand in the sequence they are in, by what its sends say, in People's order (00455 sequence_people): one who
 * wrote back and waits for an answer; a send held by the check, drafted for its owner, waiting in a batch for an OK, or
 * planned; on its list with nothing planned yet; between steps; every step gone; or left, with why. Null outside a
 * sequence.
 */
export function leadSheetPlaceOf(t: ReachOutLeadTimelineDto | null, nowMs: number, tz: string): LeadPlaceVM | null {
  if (!t || !t.chain) return null;
  const sends = [...t.sends].sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  if (wroteBack(t, nowMs)) {
    const last = sends.filter((s) => s.left).at(-1);
    return { ...NO_SEND, group: "replied", step: placeStepOf(last ? last.n : null), line: LEAD_PLACE_LINES.replied };
  }
  // Their place, where the story carries it (00455): a leave or the last step ended it, whatever their sends say.
  const ended = t.place && (t.place.state === "left" || t.place.state === "done") ? t.place : null;
  if (ended) {
    const step = placeStepOf(sends.filter((s) => s.left).at(-1)?.n ?? null);
    return ended.state === "done"
      ? { ...NO_SEND, group: "done", step, line: LEAD_PLACE_LINES.done }
      : { ...NO_SEND, group: "left", step, line: LEAD_PLACE_LINES.left(ended.why ?? "removed") };
  }
  const pending = pendingPlaceOf(sends, t, nowMs, tz);
  if (pending) return pending;
  // On its list, nothing planned for them yet (00426: a lead added waits for the sequence's next batch).
  if (sends.length === 0 && !t.stopped_at && t.closed_reason !== "said_no")
    return { ...NO_SEND, group: "next", step: 1, line: LEAD_PLACE_LINES.queued };
  return settledPlaceOf(sends, t, nowMs, tz);
}

/** Each place's one line, as the sequence box says it under the sequence's name. */
const LEAD_PLACE_LINES = {
  /** The card's headline says what they wrote and where it is answered; the box says only what the sequence did. */
  replied: "Stopped for them",
  held: (step: number, why: string | null) => (why ? `Step ${step} held: ${why}` : `Step ${step} is held by the check`),
  toSend: (step: number) => `Step ${step} is drafted for you to send yourself`,
  waiting: (step: number) => `Step ${step} waits for your OK with the rest of its batch`,
  next: (step: number, when: string | null) => (when ? `Step ${step} ${when}` : `Step ${step} is planned`),
  in: (step: number, at: string | null) => (at ? `Step ${step} sent ${at}` : `Step ${step} is next, after its wait`),
  queued: "Step 1 goes in its next batch",
  done: "Every step went",
  /** Why, alone: the word beside the name and the box's verb already say Left. */
  left: (why: string) => capitalize(sequenceLeftWords(why)),
} as const;

/* -------------------------------------------------------------------------------------------- the word -------- */

/** A word's tone, as the house's tone pill draws it: amber needs you, green runs, plain is over or not decided on yet. */
export type LeadWordTone = "warn" | "ok" | "plain";

/** The places that need you: amber. */
const NEEDS_YOU: ReadonlySet<LeadPlaceGroup> = new Set(["waiting", "held", "to_send", "replied"]);

/**
 * The word beside the name: where they stand once a sequence has them (its group's word), else the lead's own state:
 * Ready, To review, Wrote back, or what closed it. A lead in another sequence is In it, as that sequence files it.
 */
export function leadSheetWordOf(p: {
  state: LeadSheetState;
  place: LeadPlaceVM | null;
  closed: LeadSheetClosedVM | null;
}): { word: string; tone: LeadWordTone } {
  if (p.place) {
    const g = p.place.group;
    return { word: LEAD_PLACE_WORDS[g], tone: NEEDS_YOU.has(g) ? "warn" : g === "next" || g === "in" ? "ok" : "plain" };
  }
  switch (p.state) {
    case "review":
      return { word: "To review", tone: "warn" };
    case "replied":
      return { word: LEAD_PLACE_WORDS.replied, tone: "warn" };
    case "elsewhere":
    case "sequence":
      return { word: LEAD_PLACE_WORDS.in, tone: "ok" };
    case "closed":
      return { word: p.closed ? p.closed.title : LEAD_PLACE_WORDS.left, tone: "plain" };
    default:
      return { word: "Ready", tone: "plain" };
  }
}

/* --------------------------------------------------------------------------------------------- the box -------- */

/** The sequence box: how they stand to it, which (a door to its record), its one line, and whether Change is offered. */
export interface LeadSheetBoxVM {
  /** "Joins", "In", "Left", "Can't join", or null where no sequence is named ("No sequence takes leads you add"). */
  verb: string | null;
  name: string | null;
  /** The record the name opens. */
  rootId: string | null;
  line: string;
  change: boolean;
}

const LEAD_BOX_WORDS = {
  joins: "Joins",
  in: "In",
  left: "Left",
  cantJoin: "Can't join",
  goesWith: "Goes with",
  none: "No sequence takes leads you add",
  /** While their story or the sequences are still being read: nothing said yet that the reads could take back. */
  reading: "Reading where they stand",
  noneLine: "Make one in Sequences; you come back here",
  afterOk: "Step 1 after your OK",
  /** Step 1 by its subject as this lead would get it (the refined canvas): "Step 1, “A quieter phone”, after your OK". */
  afterOkNamed: (subject: string) => `Step 1, “${subject}”, after your OK`,
  onceKept: "Once you keep it",
  inNextBatch: "In its next batch",
  phoneOnly: "A sequence to leads writes email; they have a phone",
  elsewhere: "A business is written to once, so this one stays with that sequence",
} as const;

/**
 * The sequence box, by the state and the place: Joins the sequence the adds go to (Step 1 after your OK, or once kept),
 * Goes with a search's own, In the one they are in (its place's line), Left it (why), Can't join (they have only a
 * phone), or no sequence yet. Change is offered where the adds may go to another.
 */
export function leadSheetBoxOf(p: {
  state: LeadSheetState;
  place: LeadPlaceVM | null;
  /** The sequence they are in (their story's), by name and record. */
  inSequence: { rootId: string; name: string } | null;
  /** The other sequence that has them (the add door's answer). */
  elsewhere: { rootId: string | null; name: string } | null;
  /** Where the adds go: the one chosen. */
  target: { rootId: string; name: string } | null;
  /** Step 1's subject as this lead would get it, where every part of it fills; null otherwise. */
  firstSubject: string | null;
  /** The open search's own sequence, which takes every ready lead it finds. */
  searchWrites: { rootId: string; name: string } | null;
  canChange: boolean;
  closed: LeadSheetClosedVM | null;
  /** Their story or the sequences still being read. */
  reading: boolean;
}): LeadSheetBoxVM {
  const B = LEAD_BOX_WORDS;
  if (p.inSequence && p.place) {
    const verb = p.place.group === "left" ? B.left : B.in;
    return { verb, name: p.inSequence.name, rootId: p.inSequence.rootId, line: p.place.line, change: false };
  }
  if (p.reading) return { verb: null, name: null, rootId: null, line: B.reading, change: false };
  if (p.state === "elsewhere" && p.elsewhere)
    return { verb: B.in, name: p.elsewhere.name, rootId: p.elsewhere.rootId, line: B.elsewhere, change: false };
  if (p.state === "closed" && p.closed)
    return { verb: null, name: null, rootId: null, line: `${p.closed.title}. ${p.closed.line}`, change: false };
  if (p.searchWrites)
    return {
      verb: B.goesWith,
      name: p.searchWrites.name,
      rootId: p.searchWrites.rootId,
      line: B.inNextBatch,
      change: false,
    };
  if (!p.target) return { verb: null, name: null, rootId: null, line: `${B.none}. ${B.noneLine}`, change: false };
  const t = { name: p.target.name, rootId: p.target.rootId, change: p.canChange };
  if (p.state === "phone") return { ...t, verb: B.cantJoin, line: B.phoneOnly };
  const after = p.firstSubject ? B.afterOkNamed(p.firstSubject) : B.afterOk;
  return { ...t, verb: B.joins, line: p.state === "review" ? B.onceKept : after };
}

/* -------------------------------------------------------------------------------------------- the dock -------- */

/** The dock: its line and fact, a round ✕ for Not a fit where it is one, and at most two acts, the last the primary. */
export interface LeadSheetDockVM {
  line: string;
  fact: string;
  /** Something is being read: a spinner beside the line, and the acts wait. */
  waiting: boolean;
  x: boolean;
  acts: LeadSheetSlotVM[];
}

export const LEAD_DOCK_WORDS = {
  /** The dock names where Add goes (the refined canvas, decision 04), so a wrong default shows before the press. */
  ready: { line: (sequence: string) => `Joins ${sequence}`, fact: "Nothing goes until you approve" },
  checking: { line: "Checking their mailbox", fact: "Add waits a few seconds" },
  reading: { line: "Reading where they stand", fact: "A moment" },
  noEmail: { line: "No email to write to", fact: "Call them, or find one" },
  elsewhere: { line: "One sequence at a time", fact: "Take them out there to add them here" },
  noSequence: { line: "Nothing to add to yet", fact: "Starts from this lead, and comes back" },
  review: { line: "To review", fact: "Keep counts it, and sends it on" },
  waiting: { line: "Waits for your OK", fact: "A batch, so in the sequence" },
  held: { line: "Held by the check", fact: "Its email, decided here" },
  toSend: { line: "Yours to send", fact: "From your own inbox" },
  search: { line: "Goes in its next batch", fact: "Not a fit is how one stays out" },
  first: { line: "On a new list of this pile's", fact: "You write to them once, at the end" },
  replied: (intent: string | null, at: string | null) => ({
    line: "Wrote back",
    fact: [intent, at].filter(Boolean).join(" · ") || "Answer them in the Inbox",
  }),
  approve: "Approve",
  decide: "Decide",
  openDraft: "Open the draft",
  answer: "Answer",
  call: "Call",
  add: "Add",
  later: "Later",
  notFit: "Not a fit",
  keep: "Keep",
  exclude: "Leave out",
  openIt: "Open it",
  newSequence: "New sequence",
  itsSequence: "Its sequence",
  hold: "Add to a new list",
  putBack: "Put back",
  ready_: "Move back to Ready",
  /** Held, decided here (the canvas's HeldDecide): the same choices, and the same verb, as the sequence's Leads tab. */
  decideAsk: "What to do with its email?",
  decideOnly: (sequence: string) => `Only this one email. The rest of its batch waits in “${sequence}”.`,
  back: "Back",
  /** The desk's key row under the dock: in a pile, the dock's own keys and Undo; out of one, J and K walk the rows. */
  undoKey: "undo",
  moveKeys: "next, before",
} as const;

const dockAct = (
  a: LeadSheetAct,
  label: string,
  icon: string,
  key: LeadSheetSlotVM["key"] = null,
  off: string | null = null,
): LeadSheetSlotVM => ({ act: a, label, icon, key, sub: null, off });

/** What the dock is read from, beside the state and the place. */
export interface LeadSheetDockFacts {
  state: LeadSheetState;
  place: LeadPlaceVM | null;
  pile: "list" | "first" | "search" | null;
  /** Where Add would go; null where no sequence takes leads by hand. */
  target: string | null;
  /** Why Add is off for this lead (the door's answer, or a hole); null when it would go. */
  blocked: string | null;
  canCall: boolean;
  canLater: boolean;
  closed: LeadSheetClosedVM | null;
  /** Their newest reading that asks for an answer: what it was read as, and when. */
  reply: { intent: string; readAt: string } | null;
  /** Their story or the sequences still being read: the dock waits, offering nothing the reads could take back. */
  reading: boolean;
  tz: string;
  nowMs: number;
}

/** Later where a search holds the lead; none out of one (the dock holds two acts at most). */
const dockLaterOf = (f: LeadSheetDockFacts) =>
  f.canLater ? [dockAct("later", LEAD_DOCK_WORDS.later, "clock", "l")] : [];

/** The dock while a sequence has them: only where their place needs you. */
function placeDock(f: LeadSheetDockFacts, place: LeadPlaceVM): LeadSheetDockVM | null {
  const D = LEAD_DOCK_WORDS;
  const dock = (w: { line: string; fact: string }, acts: LeadSheetSlotVM[]) => ({
    ...w,
    waiting: false,
    x: false,
    acts,
  });
  if (place.group === "waiting") return dock(D.waiting, [dockAct("approve", D.approve, "chevron", "a")]);
  if (place.group === "held") return dock(D.held, [dockAct("decide", D.decide, "chevron", "a")]);
  if (place.group === "to_send") return dock(D.toSend, [dockAct("open_draft", D.openDraft, "send", "a")]);
  if (place.group === "replied") return repliedDock(f);
  return null;
}

/** They wrote back: what it was read as and when, a call where there is a number, and Answer. */
function repliedDock(f: LeadSheetDockFacts): LeadSheetDockVM {
  const D = LEAD_DOCK_WORDS;
  const r = f.reply;
  const intent = r && isReplyIntent(r.intent) ? capitalize(REPLY_INTENT_WORDS[r.intent]) : null;
  const at = r ? clockNear(Date.parse(r.readAt), f.tz, f.nowMs) : null;
  return {
    ...D.replied(intent, at),
    waiting: false,
    x: false,
    acts: [...(f.canCall ? [dockAct("call", D.call, "phone", "c")] : []), dockAct("thread", D.answer, "chat", "a")],
  };
}

/** The dock for a lead not in a sequence yet: what Add would do, or why it can't yet and the one way on. */
function readyDock(f: LeadSheetDockFacts): LeadSheetDockVM | null {
  const D = LEAD_DOCK_WORDS;
  const x = dockAct("not_a_fit", D.notFit, "x", "n");
  if (f.pile === "search")
    return { ...D.search, waiting: false, x: true, acts: [x, dockAct("sequence", D.itsSequence, "external")] };
  if (f.pile === "first")
    return { ...D.first, waiting: false, x: true, acts: [x, ...dockLaterOf(f), dockAct("hold", D.hold, "plus", "a")] };
  // No sequence takes leads by hand yet: one is made in Sequences from this lead, and Not a fit and Later stay theirs.
  if (!f.target)
    return {
      ...D.noSequence,
      waiting: false,
      x: true,
      acts: [x, ...dockLaterOf(f), dockAct("new_sequence", D.newSequence, "chevron", "a")],
    };
  if (f.state === "finding")
    return { ...D.checking, waiting: true, x: true, acts: [x, dockAct("add", D.add, "plus", "a", D.checking.fact)] };
  return {
    line: D.ready.line(f.target),
    fact: f.blocked ?? D.ready.fact,
    waiting: false,
    x: true,
    acts: [x, ...dockLaterOf(f), dockAct("add", D.add, "plus", "a", f.blocked)],
  };
}

/**
 * The dock, by the lead's state and its place: Add with ✕ and Later for a lead to decide on (or why it can't go, and the
 * way on: a call, its other sequence, a new sequence), Leave out and Keep for one to review, and while a sequence has
 * them only what needs you: an OK to give, a held email to decide, a draft to send, a reply to answer. Null when nothing
 * needs you: in it, up next, done, left, or asked to stop.
 */
export function leadSheetDockOf(f: LeadSheetDockFacts): LeadSheetDockVM | null {
  const D = LEAD_DOCK_WORDS;
  if (f.place) return placeDock(f, f.place);
  if (f.reading) return { ...D.reading, waiting: true, x: false, acts: [] };
  switch (f.state) {
    case "review":
      return {
        ...D.review,
        waiting: false,
        x: false,
        acts: [dockAct("exclude", D.exclude, "ban", "n"), dockAct("keep", D.keep, "check", "a")],
      };
    case "phone":
      return f.canCall
        ? {
            ...D.noEmail,
            waiting: false,
            x: true,
            acts: [dockAct("not_a_fit", D.notFit, "x", "n"), dockAct("call", D.call, "phone", "a")],
          }
        : null;
    case "elsewhere":
      return { ...D.elsewhere, waiting: false, x: false, acts: [dockAct("sequence", D.openIt, "chevron", "a")] };
    case "replied":
      return repliedDock(f);
    case "sequence":
      return null;
    case "closed": {
      const fix = f.closed ? f.closed.fix : null;
      if (!f.closed || !fix) return null;
      const one =
        fix === "put_back"
          ? dockAct("put_back", D.putBack, "undo", "a")
          : fix === "ready"
            ? dockAct("ready", D.ready_, "undo", "a")
            : dockAct("call", D.call, "phone", "a");
      return { line: f.closed.title, fact: f.closed.line, waiting: false, x: false, acts: [one] };
    }
    default:
      return readyDock(f);
  }
}

/* ---------------------------------------------------------------------------------------- a row on Leads ------ */

/**
 * A row's place on Leads (the Stage cell, under its stage), from the open search's lines (00241 reach_out_search_lines),
 * in the words the sheet and the record use: Wrote back, Held, For you to send, Waits for your OK, Up next, In it, Left.
 * Null where the sequence has done nothing with the lead yet.
 */
export function leadLinePlaceOf(
  l: ReachOutLeadLineDto,
  chainWaits: boolean,
  nowMs: number,
  tz: string,
): { word: string; tone: LeadWordTone; line: string | null } | null {
  const W = LEAD_PLACE_WORDS;
  const r = l.reply;
  const person = r && !r.undone && r.claim !== "auto_reply";
  if (person && ASKS_ANSWER.has(r.intent))
    return { word: W.replied, tone: "warn", line: clockNear(Date.parse(r.read_at), tz, nowMs) };
  if (l.held) return { word: W.held, tone: "warn", line: null };
  if ((l.drafted ?? 0) > 0) return { word: W.to_send, tone: "warn", line: null };
  const why = l.stopped_at
    ? "owner_stopped"
    : l.closed_reason === "said_no" || (person && r.intent === "no")
      ? "said_no"
      : l.bounced
        ? "bounced"
        : l.booked_at
          ? "booked"
          : null;
  if (why) return { word: W.left, tone: "plain", line: sequenceLeftWords(why) };
  const next = l.next_at ? Date.parse(l.next_at) : NaN;
  if (l.sent === 0 && chainWaits && (l.added_at || Number.isFinite(next)))
    return { word: W.waiting, tone: "warn", line: null };
  if (Number.isFinite(next)) return { word: W.next, tone: "ok", line: clockNear(next, tz, nowMs) };
  if (l.sent > 0) {
    const last = l.last_sent_at ? Date.parse(l.last_sent_at) : NaN;
    return { word: W.in, tone: "ok", line: Number.isFinite(last) ? `sent ${clockNear(last, tz, nowMs)}` : null };
  }
  return null;
}
