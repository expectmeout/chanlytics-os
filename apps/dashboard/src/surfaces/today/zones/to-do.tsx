/**
 * To do (decision 0076): the owner's own to-dos, a group of Need you that stands open under To decide (Today in three
 * zones, 2 Nov 2026), on a desk and a phone alike, apart from who waits on them and never in their count. A person's next
 * step whose day has come (0007: queue-steps.tsx, Done or Not now that moves its day), yesterday's visits nobody has said
 * whether they came to (0047: queue-visits.tsx, Kept or Missed and Ask's rebook), and the reviews to answer (0071's,
 * need-you/review-work.tsx: Ask's draft, posted with its grace): three drawn across the three, in that order, and the
 * group's foot says the rest. The same derivations, the same rows and presses (need-you/people-rows.tsx); it takes the page's
 * coral only where Need you holds none. What it draws and which act is the coral is its model's (need-you-model.ts
 * useToDoModel), worked out with Need you's before anything draws; this draws it.
 */
import { useEffect, type ReactElement, type ReactNode } from "react";
import { DEFAULT_TIMEZONE, lensRoute, type TodayQueueRowVM } from "@chanlytics/contracts";
import { appNavigate, canDo, useToast, workspaceClock } from "../shell";
import { needYouRows, type NeedYouRowsCtx } from "../need-you/people-rows";
import { useDraftsMoved, wantDrafts } from "../need-you/drafts";
import { stepNoteWantOf } from "../need-you/step-note";
import type { ToDoModel } from "../need-you-model";
import { keptWith, keptWithout } from "./kept";
import { stepDone } from "./queue-steps";
import { KeptAll } from "../need-you/visit-work";

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
  /** Mark all kept, where two or more of yesterday's visits wait to be marked (need-you/visit-work.tsx); null otherwise. */
  keptAll: ReactNode;
  toast: ReactNode;
}

/**
 * To do's rows, drawn from its model (need-you-model.ts): the steps due, the visits to mark and the reviews to answer, in
 * that order, to the cap (Need you's group, need-you/groups.tsx), its coral the act the model chose. `open` opens a row the
 * way the list does (a phone's sheet, a desk's place), and `focus` is the one a desk has open.
 */
export function useToDoRows({
  model,
  open,
  focus = null,
}: {
  model: ToDoModel;
  open?: (rowId: string) => void;
  focus?: string | null;
}): ToDoRows {
  // The notes steps arrive with (decision 0120): kept on their threads, they land as the drafts do.
  useDraftsMoved();
  const [toastNode, flash] = useToast();
  const { read, rows, count, steps, visits, answering, word, kept, setKept, setDone } = model;
  const ctx: NeedYouRowsCtx = {
    nav: (to) => appNavigate(to),
    coral: model.coral,
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
  // The steps' notes the workspace's newest drafts did not hold, read by their threads, once each.
  const noteThreads = rows.flatMap((r) => stepNoteWantOf(r)?.conversationId ?? []).join(",");
  useEffect(() => {
    void wantDrafts(rows.flatMap((r) => stepNoteWantOf(r) ?? []));
    // The threads stand for the rows: a new step, or one with another thread, reads again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteThreads]);
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
