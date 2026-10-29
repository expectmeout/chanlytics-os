/**
 * To do on a phone (decision 0076): the owner's own to-dos, in Need you's pane under who waits on them, apart and never in
 * their count. A person's next step whose day has come (0007: queue-steps.tsx, Done or Not now that moves its day),
 * yesterday's visits nobody has said whether they came to (0047: queue-visits.tsx, Kept or Missed and Ask's rebook), and
 * the reviews to answer (0071's, need-you/review-work.tsx: Ask's draft, posted with its grace), as a desk draws them, with
 * their caps and their row for the rest from contracts (withSteps, withVisitsAsked). The same derivations, the same rows and
 * presses (need-you/people-rows.tsx); it takes the page's coral only where Need you holds none.
 */
import { useLayoutEffect, useState } from "react";
import {
  DEFAULT_TIMEZONE,
  TODAY_PHONE_WORDS,
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
import { useDayVm } from "./day";
import { dueSteps, stepDone } from "./queue-steps";
import { askedVisits } from "./queue-visits";

/**
 * How many to-dos there are, the steps due, the visits to mark and the reviews to answer: whether the page is busy, and the
 * day opens by itself.
 */
export function useToDoCount(): number {
  useMoved(["people", "calendar", "google"]);
  const word: AppointmentWord = useDayVm()?.word ?? "appointment";
  const reviews = reviewsToAnswer(useSurface("google")).length;
  return (dueSteps()?.count ?? 0) + (askedVisits(word)?.count ?? 0) + reviews;
}

/** The group's id, which its rows are named by. */
const TODO_TITLE_ID = "today-todo-title";

/**
 * To do, drawn in Need you's pane (queue.tsx). `queueHolds`: whether Need you's rows above it took the coral, said by the
 * queue as it draws; drawn alone (a test), it hears the queue's word instead.
 */
export function TodayToDo({ queueHolds }: { queueHolds?: boolean }) {
  // People's rows are the steps', the Calendar's blocks the visits', Google's the reviews': each moves this.
  useMoved(["people", "calendar", "google"]);
  const [toastNode, flash] = useToast();
  const [done, setDone] = useState<readonly string[]>([]);
  const [kept, setKept] = useState<Record<string, { row: TodayQueueRowVM; at: number }>>({});
  // A review answered or set aside leaves the next read: it keeps its place for the visit.
  const [keptReviews, setKeptReviews] = useState<readonly GoogleReviewDto[]>([]);
  const heard = useCoralHeld("queue");
  const taken = queueHolds ?? heard;
  const word: AppointmentWord = useDayVm()?.word ?? "appointment";
  const answering = reviewsToAnswer(useSurface("google"));
  const steps = dueSteps();
  const visits = askedVisits(word);
  const read = TODAY_HELPERS.withVisitsAsked(TODAY_HELPERS.withSteps([], steps), visits);
  // A row acted on keeps its place for the visit, with its receipt and its undo; a step marked done goes at once.
  const rows = [
    ...read.filter((r) => !(r.step && done.includes(r.step.note_id))),
    ...Object.values(kept)
      .filter(({ row }) => !read.some((r) => r.id === row.id))
      .map(({ row }) => row),
  ];
  const reviews = [...keptReviews, ...answering.filter((r) => !keptReviews.some((k) => k.id === r.id))];
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
    keep: (row) =>
      setKept((was) => ({ ...was, [row.id]: { row, at: was[row.id]?.at ?? rows.findIndex((r) => r.id === row.id) } })),
    kept: new Set([...Object.keys(kept), ...keptReviews.map((r) => `q-r-${r.id}`)]),
    expanded: new Set(),
    expand: () => undefined,
    word,
    stepDone: (r) =>
      void stepDone(r, flash, {
        hide: (noteId) => setDone((was) => [...was, noteId]),
        show: (noteId) => setDone((was) => was.filter((id) => id !== noteId)),
      }),
    keepIdea: () => undefined,
    keepReview: (review) => setKeptReviews((was) => (was.some((r) => r.id === review.id) ? was : [...was, review])),
  };
  const drawn = [...needYouRows(rows, ctx), ...reviewRows(reviews, ctx)];
  const holds = !taken && !primaryLeft;
  useLayoutEffect(() => {
    holdsCoral("todo", holds);
  }, [holds]);
  useLayoutEffect(() => () => holdsCoral("todo", false), []);
  if (!drawn.length) return toastNode;
  const due = (steps ? steps.count - done.length : 0) + (visits ? visits.count : 0) + answering.length;
  return (
    <div className="today-todo" data-testid="today-todo" role="group" aria-labelledby={TODO_TITLE_ID}>
      <div className="tq-head">
        <span className="tq-title" id={TODO_TITLE_ID}>
          {TODAY_PHONE_WORDS.todo}
        </span>
        {due > 0 ? <span className="tq-count tabular">{due}</span> : null}
      </div>
      <div className="tq-list">{drawn}</div>
      {toastNode}
    </div>
  );
}
