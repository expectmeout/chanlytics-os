/**
 * To do (decision 0076): the owner's own to-dos, a group of Need you that stands open under To decide (Today in three
 * zones, 2 Nov 2026), on a desk and a phone alike, apart from who waits on them and never in their count. A person's next
 * step whose day has come (0007: queue-steps.tsx, Done or Not now that moves its day), yesterday's visits nobody has said
 * whether they came to (0047: queue-visits.tsx, Kept or Missed and Ask's rebook), and the reviews to answer (0071's,
 * need-you/review-work.tsx: Ask's draft, posted with its grace): three drawn across the three, in that order, and the
 * group's foot says the rest. The same derivations, the same rows and presses (need-you/people-rows.tsx); it takes the page's
 * coral only where Need you holds none.
 */
import { useEffect, useLayoutEffect, useState, type ReactElement, type ReactNode } from "react";
import { DEFAULT_TIMEZONE, lensRoute, type AppointmentWord, type TodayQueueRowVM } from "@chanlytics/contracts";
import { useSurface } from "../../use-surface";
import { holdsCoral, useCoralHeld } from "../queue-coral";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, canDo, useMoved, useToast, workspaceClock } from "../shell";
import { needYouRows, type NeedYouRowsCtx } from "../need-you/people-rows";
import { useDraftsMoved, wantDrafts } from "../need-you/drafts";
import { stepNoteWantOf } from "../need-you/step-note";
import { useRests } from "../need-you/rests";
import { reviewsToAnswer } from "../need-you/reviews";
import { reviewRowOf } from "../need-you/sheet/row-line";
import type { VerbKind } from "../../waits/wait-rows";
import { useTodayWord } from "./day-vm";
import { keptWith, keptWithout, withKept, type Kept } from "./kept";
import { dueSteps, stepDone } from "./queue-steps";
import { askedVisits } from "./queue-visits";
import { KeptAll } from "../need-you/kept-all";

/** To do's rows as Need you draws them: the rows drawn, how many there are in all, and the toast their presses say in. */
export interface ToDoRows {
  drawn: ReactElement[];
  /**
   * The steps due, the visits to mark and the reviews drawn, in their order, with how To do keeps one acted on, lets it go
   * and marks a step done: a phone's walk steps into them after the people (the Parts board: "To do's rows join the walk").
   */
  walk: {
    rows: readonly TodayQueueRowVM[];
    kept: ReadonlySet<string>;
    keep: (row: TodayQueueRowVM) => void;
    unkeep: (row: TodayQueueRowVM) => void;
    stepDone: (row: TodayQueueRowVM) => void;
  };
  count: number;
  /** How many the cap left out: the group's foot says them. */
  cut: number;
  /** The to-dos the walk's rows leave, those past the cap: a phone's walk ends on them. */
  left: number;
  /**
   * Where the ones left out are, in To do's order: People's Steps due, the Calendar on yesterday, Reports' Reviews. Null
   * where none was left out: the press at the group's foot opens it, since the Inbox holds none of them.
   */
  door: string | null;
  /** Mark all kept, where two or more of yesterday's visits wait to be marked (need-you/kept-all.tsx); null otherwise. */
  keptAll: ReactNode;
  toast: ReactNode;
}

/** The rows a step due or a visit to mark draws, without the rows for the rest: the cap is across the three kinds. */
const oneEach = (r: TodayQueueRowVM) => r.kind === "step" || r.kind === "visit";

/**
 * To do's rows, `cap` drawn across the steps due, the visits to mark and the reviews to answer, in that order (Need you's
 * group, need-you/groups.tsx). `queueHolds`: whether Need you's rows above them took the coral, said by the list as it
 * draws; drawn alone (a test), it hears the list's word instead. `open` opens a row the way the list does (a phone's sheet,
 * a desk's place), and `focus` is the one a desk has open.
 */
export function useToDoRows({
  cap,
  queueHolds,
  open,
  focus = null,
}: {
  cap: number;
  queueHolds?: boolean;
  open?: (rowId: string) => void;
  focus?: string | null;
}): ToDoRows {
  // People's rows are the steps', the Calendar's blocks the visits', Google's the reviews' and the morning's the rests over
  // them: each moves this.
  useMoved(["people", "calendar", "google", "ask_morning"]);
  // And the notes steps arrive with (decision 0120): kept on their threads, they land as the drafts do.
  useDraftsMoved();
  const [toastNode, flash] = useToast();
  const [done, setDone] = useState<readonly string[]>([]);
  const [kept, setKept] = useState<Kept>({});
  const heard = useCoralHeld("queue");
  const taken = queueHolds ?? heard;
  const word: AppointmentWord = useTodayWord();
  const { rests } = useRests();
  const answering = reviewsToAnswer(useSurface("google"), rests);
  const steps = dueSteps();
  const visits = askedVisits(word);
  // Each step, each visit and each review a row of its own, the count of every one of them (the rows for the rest stand
  // down: the group's foot says how many more, across the three).
  const read = [
    ...TODAY_HELPERS.withVisitsAsked(TODAY_HELPERS.withSteps([], steps), visits).filter(oneEach),
    ...answering.map(reviewRowOf),
  ];
  // A row acted on keeps its place for the visit, where it stood among the rows drawn, with its receipt and its undo
  // (kept.ts, Need you's own rule): never past the cap, where the next read's rows would push it. A step marked done goes
  // at once.
  const all = withKept(
    read.filter((r) => !(r.step && done.includes(r.step.note_id))),
    kept,
  );
  const count = (steps?.count ?? 0) + (visits?.count ?? 0) + answering.length;
  const rows = all.slice(0, cap);
  // The page's one coral: To do's first act, where Need you holds none.
  let primaryLeft = !taken;
  const verbKind: VerbKind = () => {
    const k = primaryLeft ? "primary" : "ghost";
    primaryLeft = false;
    return k;
  };
  const ctx: NeedYouRowsCtx = {
    nav: (to) => appNavigate(to),
    verbKind,
    may: canDo("approve"),
    tz: workspaceClock()?.zone() ?? DEFAULT_TIMEZONE,
    flash,
    keep: (row) => setKept((was) => keptWith(was, row, rows)),
    unkeep: (row) => setKept((was) => keptWithout(was, row)),
    kept: new Set(Object.keys(kept)),
    focus,
    open: open ?? (() => undefined),
    word,
    stepDone: (r) =>
      void stepDone(r, flash, {
        hide: (noteId) => setDone((was) => [...was, noteId]),
        show: (noteId) => setDone((was) => was.filter((id) => id !== noteId)),
      }),
  };
  const drawn = needYouRows(rows, ctx);
  const holds = !taken && !primaryLeft;
  // The steps' notes the workspace's newest drafts did not hold, read by their threads, once each.
  const noteThreads = rows.flatMap((r) => stepNoteWantOf(r)?.conversationId ?? []).join(",");
  useEffect(() => {
    void wantDrafts(rows.flatMap((r) => stepNoteWantOf(r) ?? []));
    // The threads stand for the rows: a new step, or one with another thread, reads again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteThreads]);
  useLayoutEffect(() => {
    holdsCoral("todo", holds);
  }, [holds]);
  useLayoutEffect(() => () => holdsCoral("todo", false), []);
  // What the group's foot says is left out counts only the rows drawn that the read still holds: a row acted on is no to-do
  // now, and must not hide one that is.
  const held = (r: TodayQueueRowVM) => read.some((x) => x.id === r.id);
  const shown = (kind: TodayQueueRowVM["kind"]) => rows.filter((r) => r.kind === kind && held(r)).length;
  const door =
    steps && steps.count > shown("step")
      ? steps.to
      : visits && visits.count > shown("visit")
        ? visits.to
        : answering.length > shown("review")
          ? lensRoute("reviews")
          : null;
  const cut = Math.max(0, count - rows.filter(held).length);
  const walk = { rows, kept: ctx.kept, keep: ctx.keep, unkeep: ctx.unkeep, stepDone: ctx.stepDone };
  const keptAll = visits ? <KeptAll ids={visits.markIds} word={word} ctx={ctx} /> : null;
  return { drawn, walk, count, cut, left: cut, door, keptAll, toast: toastNode };
}
