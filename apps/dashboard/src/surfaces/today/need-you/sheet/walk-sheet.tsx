/**
 * The sheet that walks Need you on a phone (the phone canvas, 28 Oct 2026; one sheet, 9 Nov 2026): the rows the page draws, one
 * at a time, from the one pressed, today's and no older (his call D7). Every row is the same five parts: who, where it stands
 * among the rest and the arrows; what was said; the answer; what to tell Ask; and the presses held still in a flat foot. It
 * stands as tall as what it holds and pulls up for the whole conversation (his call D12). Across is the next or the one
 * before; once the one in view is acted on, the next open one comes after a beat, and with none left it says what is left.
 * What a row came to is kept by the row (row-state.ts, sends.ts, drafts.ts), so the page's row says the same once the sheet is
 * closed, with its receipt and its undo.
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
import { NEED_YOU_WORDS as W, type AppointmentWord, type TodayQueueRowVM } from "@chanlytics/contracts";
import { Button, Sheet } from "../../../kit";
import { Icon } from "../../../kit/icon/icon";
import type { SheetRest } from "../../../kit/sheet/rests";
import { routeDoor, touchSwipe } from "../../../frame-verbs";
import { appNavigate } from "../../shell";
import { sheetSubOf } from "./moment";
import type { WorkProps } from "../parts";
import { workOf } from "../rows";
import { undoSend, useSend } from "../sends";

/** How long the one acted on stays in view before the next comes: long enough to see that it took. */
const NEXT_AFTER_MS = 700;

/** Where the sheet stands: on a row, by its id; on the end (WALK_END), everyone answered; or closed. */
export type WalkAt = string | null;

/** The end of the walk, said where a row's id would be. */
const WALK_END = "end";

/** What the walk's end offers beside Back to Today: who has waited past a week, which is no part of the morning. */
export interface WalkOlder {
  count: number;
  /** Their own walk, from the first of them. */
  go: () => void;
  /** Every one of them let go, with one Undo. */
  markAll: () => void;
  busy: boolean;
}

interface WalkSheetProps {
  /** The rows the page draws that are worked in place, in its order. */
  rows: readonly TodayQueueRowVM[];
  at: WalkAt;
  onAt: (at: WalkAt) => void;
  /** The rows acted on this visit: the walk passes over them. */
  kept: ReadonlySet<string>;
  /** What every row's work is handed, as the page hands it. */
  work: Omit<WorkProps, "row" | "main">;
  word: AppointmentWord;
  /** A step's Done, as To do marks it (zones/to-do.tsx): its toast and its Undo are the page's. */
  stepDone: (row: TodayQueueRowVM) => void;
  /** The to-dos past those the walk steps into, which the end offers to go on to. */
  todos: number;
  onToDo: () => void;
  /** What waits past the groups' caps: the end says how many, and the door goes there. */
  more: { count: number; to: string } | null;
  older: WalkOlder | null;
}

/** The next row still open after `from`, in the page's order, else the first still open before it; the end with none. */
function nextOpen(rows: readonly TodayQueueRowVM[], kept: ReadonlySet<string>, from: string): WalkAt {
  const at = rows.findIndex((r) => r.id === from);
  const open = (r: TodayQueueRowVM) => !kept.has(r.id) && r.id !== from;
  return (rows.slice(at + 1).find(open) ?? rows.slice(0, Math.max(0, at)).find(open))?.id ?? WALK_END;
}

/** A send still counting down from the row before, held at the sheet's top with its Undo while the walk goes on. */
function LastSend({ row, unkeep }: { row: TodayQueueRowVM; unkeep: (row: TodayQueueRowVM) => void }) {
  const { s, seconds } = useSend(row.id);
  if (s?.state !== "going") return null;
  return (
    <div className="ny-walk-last" data-testid="walk-last">
      <span className="ny-walk-last-words">
        {W.sendingIn(seconds)} {W.sendingTo(row.who, row.writes?.wire ?? row.channel)}
      </span>
      <Button variant="quiet" size="sm" onClick={() => void undoSend(row.id).then((r) => r.ok && unkeep(row))}>
        {W.undo}
      </Button>
    </div>
  );
}

/** Where a row stands among the rest, in the head's line: the one before, "2 of 10", the next. Called, not drawn. */
function pagerOf(step: number, steps: number, go: (by: number) => void) {
  if (steps < 2) return undefined;
  return (
    <div className="ny-walk-pager">
      <Button variant="quiet" size="sm" iconOnly aria-label={W.walk.before} disabled={step <= 1} onClick={() => go(-1)}>
        <Icon name="chevron" size={14} className="ny-walk-back" />
      </Button>
      <span className="ny-walk-of">{W.walk.of(step, steps)}</span>
      <Button
        variant="quiet"
        size="sm"
        iconOnly
        aria-label={W.walk.next}
        disabled={step >= steps}
        onClick={() => go(1)}
      >
        <Icon name="chevron" size={14} />
      </Button>
    </div>
  );
}

/** The walk's end: how many went, what is left of today's, and the older ones if there are any. Called, not drawn. */
function walkEndOf(p: WalkSheetProps, lastRow: TodayQueueRowVM | null, close: { label: string; glyph: ReactElement }) {
  const handled = p.rows.filter((r) => p.kept.has(r.id)).length;
  const { older, more, todos } = p;
  return (
    <Sheet
      open
      onClose={() => p.onAt(null)}
      title={W.walk.clear}
      close={close}
      flatFoot
      foot={
        <div className="ny-walk-stack">
          {older ? (
            <>
              <Button onClick={older.go}>{W.walk.older.go}</Button>
              <Button variant="secondary" disabled={older.busy} onClick={older.markAll}>
                {W.oldDone.act}
              </Button>
            </>
          ) : todos > 0 ? (
            <Button onClick={p.onToDo}>{W.walk.todos(todos)}</Button>
          ) : (
            <Button onClick={() => p.onAt(null)}>{W.walk.back}</Button>
          )}
        </div>
      }
      className="ny-walk"
      testid="today-walk"
    >
      {lastRow ? <LastSend row={lastRow} unkeep={p.work.unkeep} /> : null}
      <div className="ny-walk-end" data-testid="walk-clear">
        <span className="ny-walk-end-tick">
          <Icon name="check" size={18} />
        </span>
        <b>{W.walk.doneCount(handled)}</b>
        {older ? <span>{W.walk.older.says(older.count)}</span> : null}
        {more ? (
          <a className="ny-walk-end-door" {...routeDoor(more.to)}>
            {W.cut.waiting(more.count)}
            <Icon name="chevron" size={11} />
          </a>
        ) : null}
      </div>
    </Sheet>
  );
}

export function WalkSheet(p: WalkSheetProps) {
  const { rows, at, onAt, kept, work, word, stepDone } = p;
  const [footEl, setFootEl] = useState<HTMLElement | null>(null);
  const [rest, setRest] = useState<SheetRest>("half");
  // The row before the one in view, where the walk moved on from it: its send counts down at the top.
  const [last, setLast] = useState<string | null>(null);
  // The walk: the rows still open, and the one in view though it was just acted on (it stays a beat).
  const steps = rows.filter((r) => !kept.has(r.id) || r.id === at);
  const i = steps.findIndex((r) => r.id === at);
  const row = i >= 0 ? steps[i] : null;
  const done = !!row && kept.has(row.id);
  // Acted on: a beat to see it took, then the next one still open, or the end. The page draws its rows again as its reads
  // move, so the beat is timed from the act alone and reads the rows as they stand when it ends.
  const now = useRef({ rows, kept, onAt });
  now.current = { rows, kept, onAt };
  const rowId = row ? row.id : null;
  useEffect(() => {
    if (!rowId || !done) return undefined;
    const id = setTimeout(() => {
      setLast(rowId);
      now.current.onAt(nextOpen(now.current.rows, now.current.kept, rowId));
    }, NEXT_AFTER_MS);
    return () => clearTimeout(id);
  }, [rowId, done]);
  // Each row starts at rest: a pull up was for the one it was pulled on.
  useEffect(() => setRest("half"), [rowId]);
  if (at === null) return null;
  const go = (step: number) => {
    const to = steps[i + step];
    if (to) onAt(to.id);
  };
  const swipe = touchSwipe({
    onLeft: i >= 0 && i < steps.length - 1 ? () => go(1) : null,
    onRight: i > 0 ? () => go(-1) : null,
    onDown: null,
  });
  const lastRow = last ? (rows.find((r) => r.id === last) ?? null) : null;
  const close = { label: W.walk.close, glyph: <Icon name="x" size={13} /> };
  if (!row) return walkEndOf(p, lastRow, close);
  const pulled = rest === "full";
  return (
    <Sheet
      open
      onClose={() => onAt(null)}
      title={
        <>
          {row.who}
          <Icon name="chevron" size={12} className="ny-walk-door" />
        </>
      }
      opens={{ label: W.walk.openWhole(row.who), press: () => appNavigate(row.cta.to) }}
      sub={sheetSubOf(row)}
      close={close}
      tools={pagerOf(i + 1, steps.length, go)}
      toolsInLine
      flatFoot
      rest={{ at: rest, onRest: setRest, turn: { up: W.walk.pullUp, down: W.walk.pullDown }, fit: true }}
      foot={<div ref={setFootEl} className="ny-walk-foot" />}
      className="ny-walk"
      testid="today-walk"
    >
      {lastRow && lastRow.id !== row.id ? <LastSend row={lastRow} unkeep={work.unkeep} /> : null}
      <div className="ny-walk-body" key={row.id} {...swipe}>
        {workOf(
          row,
          { ...work, main: "primary", foot: footEl, whole: true, pulled },
          {
            word,
            // A step marked done leaves the rows at once, as on the page: the walk goes on to the next one still open first,
            // never to its end while rows follow.
            stepDone: () => {
              onAt(nextOpen(rows, kept, row.id));
              stepDone(row);
            },
          },
        )}
        {pulled && row.conversationId ? (
          <a className="ny-walk-whole" {...routeDoor(row.cta.to)}>
            {W.walk.openInbox}
            <Icon name="chevron" size={11} />
          </a>
        ) : null}
      </div>
    </Sheet>
  );
}
