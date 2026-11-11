/**
 * What Need you and its To do will draw, and which of their acts is the page's coral, worked out from the reads they draw
 * from and nothing else (Today in three zones, 2 Nov 2026; one arrangement, 11 Nov 2026). The list draws by it, and the
 * page's arrangement (arrangement.ts) and the head (zones/head.tsx) read it too, in the same pass. They used to hear it
 * from the list as it drew (a store each part told from an effect), so on the first frame a part could draw before it
 * heard: Ask found's Check it coral beside Finish setting up's Continue, its pane leading a page where people waited, the
 * head's line a frame late. Read here, every part has the same answer before anything paints.
 *
 * What a visit's presses came to (the rows acted on and kept in their place, the row a desk opened, the steps marked done)
 * is kept in the rows' store (need-you/row-state.ts), by the list and not by the part that draws it, so whoever reads the
 * model reads it as the list does. It goes as the list goes (clearRowStates).
 */
import {
  NEED_YOU_CAPS,
  needYouGroupsOf,
  needYouSay,
  clockIsNear,
  type AppointmentWord,
  type NeedYouGroups,
  type TodayQueueRowVM,
  type TodayVM,
} from "@chanlytics/contracts";
import { useSurface } from "../use-surface";
import { waitRowsOf } from "../waits/rows";
import { runsPending } from "../waits/run-acts";
import { TODAY_HELPERS } from "./helpers";
import { useDraftCounts, type DraftWant } from "./need-you/drafts";
import { useRests } from "./need-you/rests";
import { reviewsToAnswer } from "./need-you/reviews";
import { useRowState } from "./need-you/row-state";
import { draftWantOf, opensToWork, worksInPlace } from "./need-you/rows";
import { reviewRowOf } from "./need-you/sheet/row-line";
import { useTodayOnPhone } from "./phone";
import { useMoved } from "./shell";
import { useTodayWord } from "./zones/day-vm";
import { withKept, type Kept } from "./zones/kept";
import { dueSteps } from "./zones/queue-steps";
import { askedVisits } from "./zones/queue-visits";

/** Where the list keeps what this visit's presses came to, in the rows' store. */
const NEED_YOU_STATE = "today-need-you";
const TO_DO_STATE = "today-to-do";

const NO_KEPT: Kept = {};
const NONE_DONE: readonly string[] = [];

/** The groups above To do, as drawn: Up next, the five waiting, and what waits for your OK. */
export type NeedYouDrawn = Pick<NeedYouGroups<TodayQueueRowVM>, "next" | "waiting" | "ok">;

/** A row the coral may go to, and whether it gives none where it is drawn short (Up next's, or beside a focus that takes it). */
interface CoralCandidate {
  row: TodayQueueRowVM;
  shortQuiet: boolean;
}

/**
 * The row whose act is the coral: the first, in the order they are drawn, whose act is the list's to give. A row of no
 * work of its own keeps its one door, quiet; a row acted on this visit says only what became of it; a reply that goes on its
 * own takes none (its press is Stop); a row drawn short gives its verb the coral unless it stands where short rows are quiet.
 * Null where none takes it.
 */
function coralRowOf(candidates: readonly CoralCandidate[], at: { kept: Kept; focus: string | null }): string | null {
  for (const { row, shortQuiet } of candidates) {
    if (!worksInPlace(row) || at.kept[row.id]) continue;
    const short = opensToWork(row) && row.id !== at.focus;
    if (short ? !shortQuiet : row.kind !== "held") return row.id;
  }
  return null;
}

/** The rows a step due or a visit to mark draws, without the rows for the rest: the cap is across the three kinds. */
const oneEach = (r: TodayQueueRowVM) => r.kind === "step" || r.kind === "visit";

/** To do as it will draw: its rows, how many there are in all, which act is the coral, and what this visit did to them. */
export interface ToDoModel {
  /** Every to-do as read, before the cap and the ones acted on. */
  read: TodayQueueRowVM[];
  /** The rows drawn: the cap's, with the ones acted on kept in their place. */
  rows: TodayQueueRowVM[];
  count: number;
  coral: string | null;
  steps: ReturnType<typeof dueSteps>;
  visits: ReturnType<typeof askedVisits>;
  answering: ReturnType<typeof reviewsToAnswer>;
  word: AppointmentWord;
  kept: Kept;
  setKept: (next: (was: Kept) => Kept) => void;
  setDone: (next: (was: readonly string[]) => readonly string[]) => void;
}

/**
 * To do (decision 0076), `cap` drawn across the steps due, the visits to mark and the reviews to answer, in that order. Its
 * first act is the coral where Need you's rows above it took none (`queueHolds`); `focus` is the row a desk has open.
 */
function useToDoModel(at: { queueHolds: boolean; focus: string | null }): ToDoModel {
  // People's rows are the steps', the Calendar's blocks the visits', Google's the reviews' and the morning's the rests over
  // them: each moves this.
  useMoved(["people", "calendar", "google", "ask_morning"]);
  const [done, setDone] = useRowState<readonly string[]>(TO_DO_STATE, "done", NONE_DONE);
  const [kept, setKept] = useRowState<Kept>(TO_DO_STATE, "kept", NO_KEPT);
  const word = useTodayWord();
  const { rests } = useRests();
  const answering = reviewsToAnswer(useSurface("google"), rests);
  const steps = dueSteps();
  const visits = askedVisits(word);
  const read = [
    ...TODAY_HELPERS.withVisitsAsked(TODAY_HELPERS.withSteps([], steps), visits).filter(oneEach),
    ...answering.map(reviewRowOf),
  ];
  // A row acted on keeps its place for the visit, where it stood among the rows drawn (kept.ts, Need you's own rule): never
  // past the cap, where the next read's rows would push it. A step marked done goes at once.
  const rows = withKept(
    read.filter((r) => !(r.step && done.includes(r.step.note_id))),
    kept,
  ).slice(0, NEED_YOU_CAPS.todo);
  const coral = at.queueHolds
    ? null
    : coralRowOf(
        rows.map((row) => ({ row, shortQuiet: false })),
        { kept, focus: at.focus },
      );
  return {
    read,
    rows,
    count: (steps?.count ?? 0) + (visits?.count ?? 0) + answering.length,
    coral,
    steps,
    visits,
    answering,
    word,
    kept,
    setKept,
    setDone,
  };
}

/** Need you as it will draw: its rows and groups, the focus, the coral, what this visit did, To do, and whether it draws. */
export interface NeedYouModel {
  rows: TodayQueueRowVM[];
  groups: NeedYouGroups<TodayQueueRowVM>;
  drawn: NeedYouDrawn;
  /** Up next, the waiting drawn and the asks drawn, in the order they stand. */
  order: TodayQueueRowVM[];
  /** The row worked in place: the first still open, on a phone always, on a desk until another is opened. */
  focus: string | null;
  /** Whether the focus's own act takes the coral: a reply that goes on its own takes none (its press is Stop). */
  focusTakes: boolean;
  /** The row of the groups above To do whose act is the page's coral; null where none of them takes it. */
  coral: string | null;
  kept: Kept;
  setKept: (next: (was: Kept) => Kept) => void;
  setOpened: (next: (was: string | null | undefined) => string | null | undefined) => void;
  phone: boolean;
  todo: ToDoModel;
  /** Need you draws a pane: a group above To do, To do, or the calls it could not read. Older alone is not one. */
  draws: boolean;
}

/**
 * Need you over Today's read (null before it): the rows as read, with a reply to a reach-out read as that reply and each
 * row acted on this visit as it was kept, in their groups (contracts need-you/groups.ts), each group to its cap. The runs
 * that wait for an OK are counted where they stand, after the asks; their verbs are never the coral.
 */
export function useNeedYouModel(vm: TodayVM | null): NeedYouModel | null {
  // The runs (Sent's), the reviews and the people move the parts of the list; the replies to a reach-out move a row read
  // as that reply's (contracts withReplies).
  useMoved(["today", "broadcasts", "people", "calendar", "reach_out_replies", "google", "settings"]);
  const [kept, setKept] = useRowState<Kept>(NEED_YOU_STATE, "kept", NO_KEPT);
  // The row a desk has open: Up next until the member opens another (undefined), or none where they closed it (null).
  const [opened, setOpened] = useRowState<string | null | undefined>(NEED_YOU_STATE, "opened", undefined);
  const phone = useTodayOnPhone();
  const rows = vm ? withKept(TODAY_HELPERS.withReplies(vm.queue.rows), kept) : [];
  const groups = needYouGroupsOf(rows);
  const drawn: NeedYouDrawn = {
    next: groups.next,
    waiting: groups.waiting.slice(0, NEED_YOU_CAPS.waiting),
    ok: groups.ok.slice(0, NEED_YOU_CAPS.ok),
  };
  const order = [...drawn.next, ...drawn.waiting, ...drawn.ok];
  // A reply that goes on its own is a focus too (the canvas's shift moment): drawn as its card, it leaves the first waiting
  // row short, holding the coral, and once it is stopped the next open row rises.
  const first = order.find((r) => !kept[r.id] && (opensToWork(r) || r.kind === "held"))?.id ?? null;
  const focus = phone || opened === undefined ? first : opened;
  const focusRow = order.find((r) => r.id === focus) ?? null;
  const focusTakes = !!focusRow && !kept[focusRow.id] && focusRow.kind !== "held";
  // Up next's short row is the focus put aside, never the coral; a row waiting or asking, drawn short, takes it only where
  // the focus's own act did not.
  const coral = coralRowOf(
    [
      ...drawn.next.map((row) => ({ row, shortQuiet: true })),
      ...[...drawn.waiting, ...drawn.ok].map((row) => ({ row, shortQuiet: focusTakes })),
    ],
    { kept, focus },
  );
  const todo = useToDoModel({ queueHolds: coral !== null, focus: phone ? null : focus });
  if (!vm) return null;
  const runs = waitRowsOf(runsPending().waiting, []).length;
  const above = order.length > 0 || runs > 0;
  return {
    rows,
    groups,
    drawn,
    order,
    focus,
    focusTakes,
    coral,
    kept,
    setKept,
    setOpened,
    phone,
    todo,
    draws: above || todo.rows.length > 0 || vm.callsRead === false,
  };
}

/** The drafts these rows read (rows.tsx draftWantOf): a reply, or a call back's read. */
export const draftWantsOf = (rows: readonly TodayQueueRowVM[]): DraftWant[] =>
  rows.map(draftWantOf).filter((w): w is DraftWant => !!w);

/**
 * What the head says after how many need you: what Ask prepared for the rows still open, then the one thing that cannot
 * wait, a reply that goes on its own or the first window to shut within two hours. Null before Today is read.
 */
export function useNeedYouLine(vm: TodayVM | null): string | null {
  const model = useNeedYouModel(vm);
  const open = model ? [...model.groups.next, ...model.drawn.waiting].filter((r) => !model.kept[r.id]) : [];
  // A reply outside WhatsApp's window goes only as a template: Ask's words for it are not said as ready (the 10/10 read,
  // 2 Nov 2026: "Ask drafted a reply" over a card whose one press was Choose a template).
  const counts = useDraftCounts(
    draftWantsOf(open.filter((r) => r.writes?.window_open !== false && r.kind !== "callback")),
  );
  if (!model) return null;
  const held = open.find((r) => r.kind === "held") ?? null;
  // The window that cannot wait is another person's: a held reply's own is said on its row, a day away, and the
  // receptionist is already answering them.
  const shuts = open.find((r) => r.kind !== "held" && clockIsNear(r) && r.writes?.window_closes) ?? null;
  return needYouSay({
    ...counts,
    held: held ? { who: held.who } : null,
    firstWindow: shuts?.writes?.window_closes ? { who: shuts.who, at: shuts.writes.window_closes } : null,
  });
}
