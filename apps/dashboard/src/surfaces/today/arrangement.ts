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
 */
import { useWaitsOnToday } from "../needs-you";
import { useSurface } from "../use-surface";
import { useNeedYouModel } from "./need-you-model";
import { canDo } from "./shell";
import { useFoundModel } from "./zones/found";
import { useSetupActs } from "./zones/setup-card";

/** What may hold the page's coral, in the walk's order; null where nothing on the page asks for it. */
type CoralHolder = "queue" | "todo" | "setup" | "found" | null;

export interface TodayArrangement {
  /** Anyone waiting on the owner (the one count, needs-you.ts): setting up then stands under Need you, never over it. */
  waiting: boolean;
  /** Ask found leads the work's column, wide: Today is read and Need you draws no pane. */
  lead: boolean;
  /** Nothing waits and nothing was found: the day alone, one column. */
  alone: boolean;
  coral: CoralHolder;
}

/** What the arrangement is worked out from: what each part will draw. */
interface ArrangementReads {
  /** Today has been read: before it, Need you has drawn nothing yet, and Ask found does not lead. */
  read: boolean;
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
}

/** The arrangement, from what each part will draw. Pure: the page's tests hold the walk here. */
export function arrangementOf(r: ArrangementReads): TodayArrangement {
  const lead = r.read && !r.needYou;
  const coral: CoralHolder = r.queueCoral
    ? "queue"
    : r.todoCoral
      ? "todo"
      : !r.waiting && r.setupActs
        ? "setup"
        : lead && r.found.acts && r.mayAct
          ? "found"
          : null;
  return { waiting: r.waiting, lead, alone: lead && !r.found.draws, coral };
}

/** Today's arrangement, read in the page's render from the same reads its parts draw from. */
export function useTodayArrangement(): TodayArrangement {
  const vm = useSurface("today");
  const needYou = useNeedYouModel(vm ?? null);
  const waiting = useWaitsOnToday();
  const setupActs = useSetupActs();
  const found = useFoundModel();
  return arrangementOf({
    read: !!vm,
    needYou: !!needYou?.draws,
    queueCoral: needYou?.coral ?? null,
    todoCoral: needYou?.todo.coral ?? null,
    waiting,
    setupActs,
    found: { draws: found.draws, acts: found.acts },
    mayAct: canDo("approve"),
  });
}
