/**
 * Today's arrangement (one arrangement, 11 Nov 2026): which zones draw, whether Ask found leads the page, whether the day
 * stands alone, and which part holds the page's one coral, worked out once from the reads, in the page's own render, and
 * handed to the parts. The canvas walks the coral (Today in three zones, 2 Nov 2026; the Moments board: "the open row, else
 * the first that waits, else To do, else setting up, else Ask found's first act"): Need you's open row, else its first
 * waiting; else To do's first act; else the setup card's first act, while nobody waits on the owner; else Ask found's first
 * act, where it leads the page. One coral a screen.
 *
 * Each part used to say what it drew to a store as it drew, and the parts after it heard it a frame later: Ask found's
 * Check it drew coral beside Finish setting up's Continue and then went quiet, its pane led a page where people waited and
 * then moved, Safari kept the coral's glow after it went (10 Nov 2026, Ruben's iPhone). Read here, from what each part will
 * draw (need-you-model.ts, setup-card.tsx useSetupActs, found.tsx useFoundModel), the first frame is the last.
 *
 * And what those parts are drawn from is known by the first draw (Today knows its shape at its first draw, 13 Nov 2026):
 * Today's first read carries what Ask found's checks and To do's steps read of People (helpers.ts peopleForToday), Reports' headline
 * and Ask's morning. Where it is not known yet (People not read, past the first draw's wait, or more than one page of it),
 * the page keeps its two columns and Ask found under the day: not read yet is never nothing found. On a quiet desk the
 * day stood alone in one column and split in two as Ask found came, which moved the day across the page.
 */
import { useFirstWait, useWaitsOnToday } from "../needs-you";
import { useSurface } from "../use-surface";
import type { TodayCard } from "./calm/lead";
import type { TodayMorning } from "./calm/evening";
import { useTodayEvening } from "./zones/head";
import { useWeekMoment } from "./calm/week";
import { useNeedYouModel } from "./need-you-model";
import { canDo } from "./shell";
import { useFoundModel } from "./zones/found";
import { useSetupActs } from "./zones/setup-card";

/** What may hold the page's coral, in the walk's order; null where nothing on the page asks for it. */
type CoralHolder = "queue" | "todo" | "week" | "setup" | "found" | null;

export interface TodayArrangement {
  /** Anyone waiting on the owner (the one count, needs-you.ts): setting up then stands under Need you, never over it. */
  waiting: boolean;
  /** Ask found leads the work's column, wide: Today is read, what Ask found is drawn from is known, and Need you draws no pane. */
  lead: boolean;
  /** Nothing waits and nothing was found, known to be nothing: the day alone, one column. */
  alone: boolean;
  coral: CoralHolder;
  /** The one card: the thing most worth doing, which the page draws first and whole; every other item is a line. */
  card: TodayCard;
  /**
   * Once the business has closed for the day (W5, calm/evening.tsx): what waits for morning, folded into one line; null by
   * day. Only who truly needs you holds the card then: a to-do, setting up and what AI found wait for the morning.
   */
  morning: TodayMorning | null;
}

/** What the arrangement is worked out from: what each part will draw. */
interface ArrangementReads {
  /** Today has been read: before it, Need you has drawn nothing yet, and Ask found does not lead. */
  read: boolean;
  /**
   * What Ask found and To do's steps are drawn from is in, or has failed (found.tsx `shown`): before it, neither says
   * anything, so Ask found does not lead and the day does not stand alone.
   */
  known: boolean;
  /** Need you draws a pane (need-you-model.ts `draws`). */
  needYou: boolean;
  /** Which of Need you's rows, and which of To do's, has its act the coral, by id; null where none. */
  queueCoral: string | null;
  todoCoral: string | null;
  waiting: boolean;
  /** The setup card draws an act (setup-card-body.tsx setupCardActs). */
  setupActs: boolean;
  /** Ask found draws a pane (a row, or a read it ranks from that failed), and whether a row with an act. */
  found: { draws: boolean; acts: boolean };
  /** The member may approve: Ask found's acts are approvals or doors past one. */
  mayAct: boolean;
  /** Need you's focus row, by its id: the person or the ask drawn whole; null where none is. */
  focus: string | null;
  /** The first row of the runs waiting for a word, by its key (waits/rows.ts waitRowKey); null where none waits. */
  waitFirst: string | null;
  /** To do's first row still open, by its id; null where it draws none. */
  todoFirst: string | null;
  /** The to-do the member pressed, while it is still open: it takes the card, as a line of Need you's pressed does. */
  todoPressed: string | null;
  /** Ask found's first row, by its key; null where it has none. */
  foundFirst: string | null;
  /** What waits for morning once the business has closed for the day; null by day. */
  morning: TodayMorning | null;
  /** The week's card while it is still to be seen (calm/week.tsx, W9), by its id; null where there is none. */
  week?: string | null;
}

/**
 * The card, in the walk the coral already takes (the Moments board): a person waiting, even one whose own press takes no
 * coral (a reply going on its own, whose press is Stop); else To do's first; else setting up, never over someone waiting;
 * else what Ask found, once what it is drawn from is known: not read yet is never nothing found.
 */
function todayCardOf(
  reads: Pick<
    ArrangementReads,
    | "read"
    | "known"
    | "focus"
    | "waitFirst"
    | "todoFirst"
    | "todoPressed"
    | "waiting"
    | "setupActs"
    | "foundFirst"
    | "morning"
    | "week"
  >,
): TodayCard {
  if (!reads.read) return null;
  if (reads.todoPressed) return { holder: "todo", id: reads.todoPressed };
  if (reads.focus) return { holder: "queue", id: reads.focus };
  // What the head counts takes the card before what it does not (D15): a run waiting for a word, then To do.
  if (reads.waitFirst) return { holder: "wait", id: reads.waitFirst };
  // Once the day is over, what can wait for morning does not take the card (W5).
  if (reads.morning) return null;
  // Once a week, while nobody waits, what AI did, until Got it (W9): before a to-do, which a business always has, and
  // which takes the card back as Got it is pressed.
  if (!reads.waiting && reads.week) return { holder: "week", id: reads.week };
  if (reads.todoFirst) return { holder: "todo", id: reads.todoFirst };
  if (!reads.waiting && reads.setupActs) return { holder: "setup", id: "setup" };
  if (reads.known && reads.foundFirst) return { holder: "found", id: reads.foundFirst };
  return null;
}

/**
 * Who holds the page's coral, in the walk's order: who waits, then (by day) the week's card, a to-do, setting up, and what
 * AI found where it leads. Once the day is over only who waits holds it.
 */
function coralOf(reads: ArrangementReads, lead: boolean): CoralHolder {
  if (reads.queueCoral) return "queue";
  if (reads.morning) return null;
  if (!reads.waiting && reads.week) return "week";
  if (reads.todoCoral) return "todo";
  if (!reads.waiting && reads.setupActs) return "setup";
  return lead && reads.found.acts && reads.mayAct ? "found" : null;
}

/** The arrangement, from what each part will draw. Pure: the page's tests hold the walk here. */
export function arrangementOf(reads: ArrangementReads): TodayArrangement {
  const lead = reads.read && reads.known && !reads.needYou;
  const coral = coralOf(reads, lead);
  return {
    waiting: reads.waiting,
    lead,
    alone: lead && !reads.found.draws,
    coral,
    card: todayCardOf(reads),
    morning: reads.morning,
  };
}

/** Today's arrangement, read in the page's render from the same reads its parts draw from. */
export function useTodayArrangement(): TodayArrangement {
  const vm = useSurface("today");
  const needYou = useNeedYouModel(vm ?? null);
  const waiting = useWaitsOnToday();
  const waitFirst = useFirstWait();
  const setupActs = useSetupActs();
  const found = useFoundModel();
  const evening = useTodayEvening();
  const week = useWeekMoment();
  const todo = needYou?.todo ?? null;
  const morning: TodayMorning | null = evening
    ? {
        toDo: todo?.count ?? 0,
        toDoDoor: todo?.steps?.to ?? todo?.visits?.to ?? null,
        found: found.found.rows.length + found.found.rest.length,
        setup: setupActs,
      }
    : null;
  return arrangementOf({
    morning,
    week: week?.id ?? null,
    read: !!vm,
    known: found.shown,
    needYou: !!needYou?.draws,
    queueCoral: needYou?.coral ?? null,
    todoCoral: needYou?.todo.coral ?? null,
    waiting,
    setupActs,
    found: { draws: found.draws, acts: found.acts },
    mayAct: canDo("approve"),
    focus: needYou?.focus ?? null,
    waitFirst,
    todoFirst: needYou?.todo.rows.find((r) => !needYou.todo.kept[r.id])?.id ?? null,
    todoPressed: needYou?.todo.rows.find((r) => r.id === needYou.opened && !needYou.todo.kept[r.id])?.id ?? null,
    foundFirst: found.found.rows[0]?.key ?? null,
  });
}
