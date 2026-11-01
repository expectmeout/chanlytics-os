/**
 * Need you's parts around its rows (the redesign of 1 Nov 2026): each group under its own small head (Up next, Waiting on
 * you, Your OK, Over a week; contracts need-you-groups.ts), the old ones let go at once with Mark all done, asked first;
 * and at its foot, a line each that opens in place, To do (your own: the steps due, yesterday's visits to mark, the reviews
 * to answer) and Ask found (Ask's ideas from its morning, a call worth a listen, a lead who tried their preview). Neither
 * line is in the count of who needs you, and each says what it holds before it is opened, so the page stays a summary.
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import {
  NEED_YOU_WORDS as W,
  type AppointmentWord,
  type AskMorningCard,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { commitVerb, undoVerb } from "@/legacy-bridge/verbs/commit";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { Panel } from "../../kit/panel/panel";
import { surfaceValue } from "../../surface-values";
import { useSurface } from "../../use-surface";
import { askMorningOverride } from "../ask-morning-surface";
import { TODAY_HELPERS } from "../helpers";
import { dueSteps } from "../pages/queue-steps";
import { askedVisits } from "../pages/queue-visits";
import { TodayToDo } from "../phone/to-do";
import { canDo, gate, useMoved, type Flash } from "../shell";
import { ideaRows, needYouRows, type NeedYouExtrasCtx, type NeedYouRowsCtx } from "./people-rows";
import { reviewsToAnswer } from "./reviews";

/**
 * A group of Need you's rows under its small head: its words, how many, and its one act where it has one. On a phone its
 * rows are a pane of their own under the head (`pane`; the canvas of 1 Nov 2026), on a desk rows in Need you's pane.
 */
export function NeedYouGroup({
  title,
  count,
  act = null,
  pane = false,
  testid,
  children,
}: {
  title: string;
  count: number | null;
  act?: ReactNode;
  pane?: boolean;
  testid: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="ny-group" role="group" aria-labelledby={id} data-testid={testid}>
      <div className="ny-group-head">
        <span className="ny-group-title" id={id}>
          {title}
        </span>
        {count !== null ? <span className="ny-group-n tabular">{count}</span> : null}
        {act}
      </div>
      {pane ? (
        <Panel size="flush" className="tq-list ny-pane">
          {children}
        </Panel>
      ) : (
        <div className="tq-list">{children}</div>
      )}
    </div>
  );
}

/** What a hold handed back keeps for its undo, with whose it was. */
type HandedBack = { row: TodayQueueRowVM; undo: Record<string, unknown> };

/**
 * Hand each old hold back to the receptionist, one press for all of them: its hold resolved and its thread the
 * receptionist's again (core handBack, as a call back's Reached does), which answers them if they write. The surfaces
 * are read once, after the last; what was handed back is said with one Undo for all of it.
 */
async function handBackAll(rows: readonly TodayQueueRowVM[], flash: (f: Flash) => void): Promise<void> {
  const threads = rows.filter((r): r is TodayQueueRowVM & { conversationId: string } => !!r.conversationId);
  const done: HandedBack[] = [];
  let refused = 0;
  for (const [i, row] of threads.entries()) {
    const r = await commitVerb(
      "thread_verb",
      { verb: "hand_back", conversation_id: row.conversationId, who: row.who },
      { refresh: i === threads.length - 1 },
    );
    if (r.ok && r.undo) done.push({ row, undo: r.undo });
    else if (!r.ok) refused += 1;
  }
  if (refused && !done.length) {
    flash({ tone: "danger", msg: <>{W.oldDone.failed(refused)}</> });
    return;
  }
  flash({
    msg: (
      <>
        {W.oldDone.done(done.length)}
        {refused ? ` · ${W.oldDone.failed(refused)}` : ""}
      </>
    ),
    undo: done.length
      ? async () => {
          for (const d of done) await undoVerb("thread_verb", d.undo, { refresh: d === done[done.length - 1] });
        }
      : undefined,
  });
}

/**
 * Over a week's act: Mark all done, asked first in place, then each handed back to the receptionist. Only for a member
 * who acts, and only where a row has a thread to hand back.
 */
export function OldDone({ rows, flash }: { rows: readonly TodayQueueRowVM[]; flash: (f: Flash) => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const threads = rows.filter((r) => !!r.conversationId).length;
  if (!threads || !canDo("approve")) return null;
  return (
    <>
      <Button
        variant="quiet"
        size="text"
        className="ny-group-act"
        onClick={() => setAsking(true)}
        aria-expanded={asking}
        data-testid="today-old-done"
        {...gate("approve", "mark them done")}
      >
        {W.oldDone.act}
      </Button>
      {asking ? (
        <Confirm
          block
          className="ny-group-ask"
          question={W.oldDone.question(threads)}
          detail={W.oldDone.detail}
          yes={W.oldDone.yes}
          busy={busy}
          onYes={() => {
            setBusy(true);
            void handBackAll(rows, flash).finally(() => {
              setBusy(false);
              setAsking(false);
            });
          }}
          onNo={() => setAsking(false)}
          testid="today-old-done-ask"
        />
      ) : null}
    </>
  );
}

/**
 * A line at Need you's foot that opens in place: its glyph, its name over what it holds, how many, and the chevron that
 * points the way it goes. The kit's quiet button, laid out as the line by the page (need-you.css .ny-line).
 */
function FootLine({
  glyph,
  title,
  sub,
  count,
  open,
  onToggle,
  testid,
}: {
  glyph: ReactNode;
  title: string;
  sub: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  testid: string;
}) {
  return (
    <Button variant="quiet" className="ny-line" aria-expanded={open} onClick={onToggle} data-testid={testid}>
      <span className="ny-line-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="ny-line-words">
        <b>{title}</b>
        <span>{sub}</span>
      </span>
      <span className="ny-line-n tabular">{count}</span>
      <Icon name={open ? "chevron-up" : "chevron-down"} size={13} />
    </Button>
  );
}

/** How many to-dos there are and what they are, in words: the steps due, the visits to mark, the reviews to answer. */
function useToDoLine(word: AppointmentWord): { count: number; sub: string } {
  useMoved(["people", "calendar", "google"]);
  const steps = dueSteps()?.count ?? 0;
  const visits = askedVisits(word)?.count ?? 0;
  const reviews = reviewsToAnswer(useSurface("google")).length;
  const sub = [
    steps ? TODAY_HELPERS.stepsSub(steps) : "",
    visits ? TODAY_HELPERS.visitsSub(visits, word) : "",
    reviews ? W.todo.reviews(reviews) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { count: steps + visits + reviews, sub };
}

/**
 * To do, as a line at Need you's foot that opens its rows in place (phone/to-do.tsx draws them). Open from the start where
 * nobody waits on you: then it is the work. Its rows take the coral only where Need you's hold none (queue-coral.ts).
 */
export function ToDoLine({
  word,
  startOpen,
  queueHolds,
}: {
  word: AppointmentWord;
  startOpen: boolean;
  queueHolds: boolean;
}) {
  const { count, sub } = useToDoLine(word);
  const [opened, setOpened] = useState<boolean | null>(null);
  if (!count) return null;
  const open = opened ?? startOpen;
  return (
    <div className="ny-more" data-testid="today-todo-line">
      <FootLine
        glyph={<Icon name="check" size={15} />}
        title={W.todo.title}
        sub={sub}
        count={count}
        open={open}
        onToggle={() => setOpened(!open)}
        testid="today-todo-open"
      />
      {open ? <TodayToDo queueHolds={queueHolds} /> : null}
    </div>
  );
}

/** How often Ask's morning is read again while Ask writes it: a turn takes up to two minutes. */
const MORNING_POLL_MS = 8_000;

/** Ask's morning read again every few seconds while it writes; the surface stops the wait when it lands. */
function useMorningWait(writing: boolean) {
  useEffect(() => {
    if (!writing) return;
    const id = setInterval(() => void refreshSurfaces([askMorningOverride]), MORNING_POLL_MS);
    return () => clearInterval(id);
  }, [writing]);
}

/**
 * Ask found, as a line at Need you's foot that opens in place: Ask's ideas from its morning (decision 0071; each with its
 * Approve, Open in Ask and Not today, idea-work.tsx), the calls worth a listen and the leads who tried their preview (the
 * queue's rows of no work, each with its one door). An idea approved or set aside leaves the morning's next read: it is
 * kept in its place for the visit. Never in the count of who needs you, never the coral.
 */
export function AskFoundLine({
  found,
  calls,
  ctx,
}: {
  /** The queue's rows Ask found (contracts needYouGroupsOf `found`): a call worth a listen, a lead who tried. */
  found: readonly TodayQueueRowVM[];
  /** Every call worth a listen, drawn or not (TodayVM.queue.calls). */
  calls: number;
  ctx: NeedYouRowsCtx;
}) {
  useMoved(["ask_morning"]);
  const [kept, setKept] = useState<readonly AskMorningCard[]>([]);
  const [open, setOpen] = useState(false);
  const morning = surfaceValue("ask_morning")?.dto ?? null;
  useMorningWait(morning?.state === "writing");
  const read = morning?.offered ? morning.cards : [];
  const ideas = [...kept, ...read.filter((c) => !kept.some((k) => k.id === c.id))];
  const tried = found.filter((r) => r.kind === "tried").length;
  const count = ideas.length + calls + tried;
  if (!count) return null;
  const [first] = ideas;
  const sub = [
    first ? W.found.ideas(ideas.length, first.title) : "",
    calls ? W.found.calls(calls) : "",
    tried ? W.tried.part(tried) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const extras: NeedYouExtrasCtx = {
    ...ctx,
    verbKind: () => "ghost",
    kept: new Set([...ctx.kept, ...kept.map((k) => k.id)]),
    keepIdea: (card) => setKept((was) => (was.some((k) => k.id === card.id) ? was : [...was, card])),
    keepReview: () => undefined,
  };
  return (
    <div className="ny-more" data-testid="today-found-line">
      <FootLine
        glyph={<Icon name="three" size={15} />}
        title={W.found.title}
        sub={sub}
        count={count}
        open={open}
        onToggle={() => setOpen(!open)}
        testid="today-found-open"
      />
      {open ? (
        <div className="tq-list" data-testid="today-ask-found">
          {ideaRows(ideas, { messageId: morning?.message_id ?? null, threadId: morning?.thread_id ?? null }, extras)}
          {needYouRows(found, extras)}
        </div>
      ) : null}
    </div>
  );
}
