/**
 * The sheet that walks Need you on a phone (the phone canvas, 28 Oct 2026; docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md
 * §4): the rows the page draws, one at a time, from the one pressed. Each is the row's own work (rows.tsx workOf) with the
 * same props, unclamped, its presses in the sheet's foot (parts.tsx WorkProps `foot`); across is the next or the one before, as the
 * lead sheet walks its pile; once the one in view is acted on, the next open one comes after a beat, and with none left it
 * says so. What a row came to is kept by the row (row-state.ts, sends.ts, drafts.ts), so the page's row says the same once
 * the sheet is closed, with its receipt and its undo.
 *
 * Change it with Ask stands under Ask's own draft here: one press for the asks made most, or the member's own words, and
 * the draft is written again in its place (drafts.ts rewriteDraft). The receptionist's held reply keeps its own.
 */
import { useEffect, useRef, useState } from "react";
import { NEED_YOU_WORDS as W, type AppointmentWord, type TodayQueueRowVM } from "@chanlytics/contracts";
import { Button, Field, Panel, Sheet } from "../../kit";
import { Icon } from "../../kit/icon/icon";
import { touchSwipe } from "../../legacy-verbs";
import { gate } from "../shell";
import { rewriteDraft, useDraft } from "./drafts";
import { Note, type WorkProps } from "./parts";
import { replyWant } from "./reply-work";
import { useRowState } from "./row-state";
import { workOf } from "./rows";
import { undoSend, useSend } from "./sends";

/** How long the one acted on stays in view before the next comes: long enough to see that it took. */
const NEXT_AFTER_MS = 700;

/** Where the sheet stands: on a row, by its id; on the end (WALK_END), everyone answered; or closed. */
export type WalkAt = string | null;

/** The end of the walk, said where a row's id would be. */
const WALK_END = "end";

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
  /** To do's rows, which the end offers to go on to. */
  todos: number;
  onToDo: () => void;
}

/** The next row still open after `from`, in the page's order, else the first still open before it; the end with none. */
function nextOpen(rows: readonly TodayQueueRowVM[], kept: ReadonlySet<string>, from: string): WalkAt {
  const at = rows.findIndex((r) => r.id === from);
  const open = (r: TodayQueueRowVM) => !kept.has(r.id) && r.id !== from;
  return (rows.slice(at + 1).find(open) ?? rows.slice(0, Math.max(0, at)).find(open))?.id ?? WALK_END;
}

/**
 * Change it with Ask, under Ask's own draft for a reply: the asks made most as one press each, or the member's words, and
 * Ask writes the draft again where it stood. Not while the member writes their own words, nor once the reply is on its way.
 */
function ChangeWithAsk({ row, may }: { row: TodayQueueRowVM; may: boolean }) {
  const want = replyWant(row);
  const draft = useDraft(want, may);
  const [editing, setEditing] = useRowState(row.id, "editing", false);
  const [, setMine] = useRowState<string | null>(row.id, "mine", null);
  const { s: send } = useSend(row.id);
  const [how, setHow] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  if (!want || !may || editing || send || draft?.state !== "ready") return null;
  const ask = async (instruction: string) => {
    if (!instruction.trim()) return;
    setBusy(true);
    setWhy(null);
    const r = await rewriteDraft(want, instruction.trim());
    setBusy(false);
    if (!r.ok) return setWhy(r.why);
    setHow("");
    setMine(null);
    setEditing(false);
  };
  return (
    <div className="ny-change" data-testid="walk-change">
      <span className="ny-by">
        <span className="ny-three" data-live={busy || undefined} aria-hidden="true">
          <Icon name="three" size={14} />
        </span>
        <span className="ny-by-words">{busy ? W.walk.rewriting : W.held.change}</span>
      </span>
      <div className="ny-picks">
        {W.walk.quick.map((q) => (
          <Button
            key={q}
            size="sm"
            disabled={busy}
            onClick={() => void ask(q)}
            {...gate("approve", "rewrite the reply")}
          >
            {q}
          </Button>
        ))}
      </div>
      <Field label={W.held.changeLabel} rows={2} value={how} onValueChange={setHow} placeholder={W.held.changeHint} />
      {why ? <Note tone="danger">{why}</Note> : null}
      {how.trim() ? (
        <div className="ny-acts">
          <span className="ny-room" />
          <Button disabled={busy} aria-busy={busy || undefined} onClick={() => void ask(how)}>
            {W.held.rewrite}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** A send still counting down from the row before, held at the sheet's top with its Undo while the walk goes on. */
function LastSend({ row }: { row: TodayQueueRowVM }) {
  const { s, seconds } = useSend(row.id);
  if (s?.state !== "going") return null;
  return (
    <div className="ny-walk-last" data-testid="walk-last">
      <span className="ny-walk-last-words">
        {W.sendingIn(seconds)} {W.sendingTo(row.who, row.writes?.wire ?? row.channel)}
      </span>
      <Button variant="quiet" size="sm" onClick={() => void undoSend(row.id)}>
        {W.undo}
      </Button>
    </div>
  );
}

export function WalkSheet({ rows, at, onAt, kept, work, word, todos, onToDo }: WalkSheetProps) {
  const [footEl, setFootEl] = useState<HTMLElement | null>(null);
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
  if (!row) {
    const handled = rows.filter((r) => kept.has(r.id));
    return (
      <Sheet
        open
        onClose={() => onAt(null)}
        title={W.walk.clear}
        sub={W.walk.clearSub}
        close={close}
        foot={
          <div className="ny-acts">
            {todos > 0 ? (
              <Button variant="quiet" onClick={onToDo}>
                {W.walk.todos(todos)}
              </Button>
            ) : null}
            <span className="ny-room" />
            <Button onClick={() => onAt(null)}>{W.walk.back}</Button>
          </div>
        }
        className="ny-walk"
        testid="today-walk"
      >
        {lastRow ? <LastSend row={lastRow} /> : null}
        <ul className="ny-walk-done" data-testid="walk-clear">
          {handled.map((r) => (
            <li key={r.id}>
              <Icon name="check" size={14} />
              <b>{r.who}</b>
            </li>
          ))}
        </ul>
      </Sheet>
    );
  }
  const where = [W.walk.of(i + 1, steps.length), row.channel, row.when].filter(Boolean).join(" · ");
  return (
    <Sheet
      open
      onClose={() => onAt(null)}
      title={row.who}
      sub={where}
      close={close}
      tools={
        steps.length > 1 ? (
          <div className="ny-walk-pager">
            <Button
              variant="quiet"
              size="sm"
              iconOnly
              aria-label={W.walk.before}
              disabled={i <= 0}
              onClick={() => go(-1)}
            >
              <Icon name="chevron" size={14} className="ny-walk-back" />
            </Button>
            <span className="ny-walk-dots" aria-hidden="true">
              {steps.map((r) => (
                <i key={r.id} data-on={r.id === row.id || undefined} />
              ))}
            </span>
            <Button
              variant="quiet"
              size="sm"
              iconOnly
              aria-label={W.walk.next}
              disabled={i >= steps.length - 1}
              onClick={() => go(1)}
            >
              <Icon name="chevron" size={14} />
            </Button>
          </div>
        ) : undefined
      }
      foot={<div ref={setFootEl} className="ny-walk-foot" />}
      className="ny-walk"
      testid="today-walk"
    >
      {lastRow && lastRow.id !== row.id ? <LastSend row={lastRow} /> : null}
      <div className="ny-walk-body" key={row.id} {...swipe}>
        {row.sentence ? (
          <Panel variant="inset" size="sm" className="ny-draft ny-their">
            <span className="ny-by">
              <span className="ny-by-words">{W.walk.their}</span>
            </span>
            <span className="ny-words">{row.quoted ? `“${row.sentence}”` : row.sentence}</span>
          </Panel>
        ) : null}
        {workOf(row, { ...work, main: "primary", foot: footEl }, { word, stepDone: () => undefined })}
        <ChangeWithAsk row={row} may={work.may} />
      </div>
    </Sheet>
  );
}
