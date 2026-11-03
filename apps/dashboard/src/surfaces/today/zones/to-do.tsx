/**
 * To do (decision 0076): the owner's own to-dos, a group of Need you that stands open under To decide (Today in three
 * zones, 2 Nov 2026), on a desk and a phone alike, apart from who waits on them and never in their count. A person's next
 * step whose day has come (0007: queue-steps.tsx, Done or Not now that moves its day), yesterday's visits nobody has said
 * whether they came to (0047: queue-visits.tsx, Kept or Missed and Ask's rebook), and the reviews to answer (0071's,
 * need-you/review-work.tsx: Ask's draft, posted with its grace): three drawn across the three, in that order, and Need
 * you's foot says the rest. The same derivations, the same rows and presses (need-you/people-rows.tsx); it takes the page's
 * coral only where Need you holds none.
 */
import { useLayoutEffect, useState, type ReactElement, type ReactNode } from "react";
import {
  DEFAULT_TIMEZONE,
  lensRoute,
  type AppointmentWord,
  type GoogleReviewDto,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import { useSurface } from "../../use-surface";
import { holdsCoral, useCoralHeld } from "../queue-coral";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, canDo, useMoved, useToast, workspaceClock } from "../shell";
import { needYouRows, reviewRows, type NeedYouExtrasCtx } from "../need-you/people-rows";
import { reviewsToAnswer } from "../need-you/reviews";
import type { VerbKind } from "../../waits/wait-rows";
import { useTodayWord } from "./day-vm";
import { keptWith, keptWithout, withKept, type Kept } from "./kept";
import { dueSteps, stepDone } from "./queue-steps";
import { askedVisits } from "./queue-visits";

/** To do's rows as Need you draws them: the rows drawn, how many there are in all, and the toast their presses say in. */
export interface ToDoRows {
  drawn: ReactElement[];
  /**
   * The steps due and the visits to mark drawn, in their order, with how To do keeps one acted on, lets it go and marks a
   * step done: a phone's walk steps into them after the people (the Parts board: "To do's rows join the walk").
   */
  walk: {
    rows: readonly TodayQueueRowVM[];
    kept: ReadonlySet<string>;
    keep: (row: TodayQueueRowVM) => void;
    unkeep: (row: TodayQueueRowVM) => void;
    stepDone: (row: TodayQueueRowVM) => void;
  };
  count: number;
  /** How many the cap left out: Need you's foot says them. */
  cut: number;
  /** The to-dos the walk's rows leave, the reviews and those past the cap: a phone's walk ends on them. */
  left: number;
  /**
   * Where the ones left out are, in To do's order: People's Steps due, the Calendar on yesterday, Reports' Reviews. Null
   * where none was left out. Need you's See all opens it where nothing else was left out: the Inbox holds none of them.
   */
  door: string | null;
  toast: ReactNode;
}

/** The rows a step due or a visit to mark draws, without the rows for the rest: the cap is across the three kinds. */
const oneEach = (r: TodayQueueRowVM) => r.kind === "step" || r.kind === "visit";

/**
 * To do's rows, `cap` drawn across the steps due, the visits to mark and the reviews to answer, in that order (Need you's
 * group, need-you/groups.tsx). `queueHolds`: whether Need you's rows above them took the coral, said by the list as it
 * draws; drawn alone (a test), it hears the list's word instead.
 */
export function useToDoRows({ cap, queueHolds }: { cap: number; queueHolds?: boolean }): ToDoRows {
  // People's rows are the steps', the Calendar's blocks the visits', Google's the reviews': each moves this.
  useMoved(["people", "calendar", "google"]);
  const [toastNode, flash] = useToast();
  const [done, setDone] = useState<readonly string[]>([]);
  const [kept, setKept] = useState<Kept>({});
  // A review answered or set aside leaves the next read: it keeps its place for the visit.
  const [keptReviews, setKeptReviews] = useState<readonly GoogleReviewDto[]>([]);
  const heard = useCoralHeld("queue");
  const taken = queueHolds ?? heard;
  const word: AppointmentWord = useTodayWord();
  const answering = reviewsToAnswer(useSurface("google"));
  const steps = dueSteps();
  const visits = askedVisits(word);
  // Each step and each visit a row of its own, the count of every one of them (the rows for the rest stand down: the
  // foot says how many more, across the three).
  const read = TODAY_HELPERS.withVisitsAsked(TODAY_HELPERS.withSteps([], steps), visits).filter(oneEach);
  // A row acted on keeps its place for the visit, where it stood among the rows drawn, with its receipt and its undo
  // (kept.ts, Need you's own rule): never past the cap, where the next read's rows would push it. A step marked done goes
  // at once.
  const all = withKept(
    read.filter((r) => !(r.step && done.includes(r.step.note_id))),
    kept,
  );
  const reviewsAll = [...keptReviews, ...answering.filter((r) => !keptReviews.some((k) => k.id === r.id))];
  const count = (steps?.count ?? 0) + (visits?.count ?? 0) + answering.length;
  const rows = all.slice(0, cap);
  const reviews = reviewsAll.slice(0, Math.max(0, cap - rows.length));
  // The page's one coral: To do's first act, where Need you holds none.
  let primaryLeft = !taken;
  const verbKind: VerbKind = () => {
    const k = primaryLeft ? "primary" : "ghost";
    primaryLeft = false;
    return k;
  };
  const ctx: NeedYouExtrasCtx = {
    nav: (to) => appNavigate(to),
    verbKind,
    may: canDo("approve"),
    tz: workspaceClock()?.zone() ?? DEFAULT_TIMEZONE,
    flash,
    keep: (row) => setKept((was) => keptWith(was, row, rows)),
    unkeep: (row) => setKept((was) => keptWithout(was, row)),
    kept: new Set([...Object.keys(kept), ...keptReviews.map((r) => `q-r-${r.id}`)]),
    focus: null,
    open: () => undefined,
    word,
    stepDone: (r) =>
      void stepDone(r, flash, {
        hide: (noteId) => setDone((was) => [...was, noteId]),
        show: (noteId) => setDone((was) => was.filter((id) => id !== noteId)),
      }),
    keepReview: (review) => setKeptReviews((was) => (was.some((r) => r.id === review.id) ? was : [...was, review])),
  };
  const drawn = [...needYouRows(rows, ctx), ...reviewRows(reviews, ctx)];
  const holds = !taken && !primaryLeft;
  useLayoutEffect(() => {
    holdsCoral("todo", holds);
  }, [holds]);
  useLayoutEffect(() => () => holdsCoral("todo", false), []);
  // What the foot says is left out counts only the rows drawn that the read still holds: a row acted on is no to-do now,
  // and must not hide one that is.
  const held = (r: TodayQueueRowVM) => read.some((x) => x.id === r.id);
  const shown = (kind: TodayQueueRowVM["kind"]) => rows.filter((r) => r.kind === kind && held(r)).length;
  const reviewsHeld = reviews.filter((v) => answering.some((a) => a.id === v.id)).length;
  const door =
    steps && steps.count > shown("step")
      ? steps.to
      : visits && visits.count > shown("visit")
        ? visits.to
        : answering.length > reviewsHeld
          ? lensRoute("reviews")
          : null;
  const cut = Math.max(0, count - (rows.filter(held).length + reviewsHeld));
  const left = Math.max(0, count - rows.filter(held).length);
  const walk = { rows, kept: ctx.kept, keep: ctx.keep, unkeep: ctx.unkeep, stepDone: ctx.stepDone };
  return { drawn, walk, count, cut, left, door, toast: toastNode };
}
