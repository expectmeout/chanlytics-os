/**
 * Need you (Today in three zones, 2 Nov 2026, over decisions 0071 and 0076): one list of everything that waits on you, in
 * groups, each row in the kit's one grammar (AttnRow) with what Ask prepared for it. Up next first, the one thing to do now
 * (contracts need-you/groups.ts); who else waits on you, five drawn, a reply that never reached them first; what waits for
 * your OK, three drawn (a search's question, and the runs an approval can still send, the very rows the Inbox's Needs you
 * draws, surfaces/waits/wait-rows.tsx; a run too late to approve is the sweep's to skip); your own to-dos, three drawn
 * and never counted (to-do.tsx); and whoever has waited past a week, one row at the end with Mark all done, never
 * counted. What is past the caps is a press at its group's foot. How many need you is every row above To do still open, the
 * one count (needs-you.ts), told what was acted on here so it falls as the rows are worked; how many the team dealt with
 * today stands by the door.
 *
 * One row is the focus and draws its work in place: on a phone the card, the first row still open, whose words open the
 * sheet that walks the list; on a desk the one opened, Up next until another is. Its act is the page's one coral; where it
 * takes none (a reply that goes on its own, whose press is Stop), the first row waiting takes it, and where nothing above
 * To do took it, To do's first act. Which row that is, which rows are drawn and whether the list draws a pane at all is
 * its model's (need-you-model.ts), which the page and the head read too, so none of them learns it from the list a frame
 * late. Every other row is drawn short, its verb at its right with Ask's mark where Ask prepared it, and opens itself.
 * Need you is one pane under its name, on a desk and a phone alike.
 *
 * Today, calm (19 Nov 2026, D15 to D17) draws these as the page's card and its lines: the card holds the first of them (a
 * person, then a run waiting for a word, then a to-do), three more are named, a line each, and everything past them is
 * one line that counts it by kind and opens a door to each (calm/also.tsx): who else waits, the to-dos, the visits to
 * mark, whoever has waited past a week, what AI set aside.
 */
import { useEffect, useLayoutEffect, useState } from "react";
import {
  DEFAULT_TIMEZONE,
  NEED_YOU_WORDS as W,
  TODAY_LINE_WORDS,
  TODAY_NAMED_MAX,
  type TodayAlsoCounts,
  type TodayQueueRowVM,
  type TodayVM,
} from "@chanlytics/contracts";
import { FailedRead } from "../../kit/empty/empty";
import { needsYouActed } from "../../needs-you";
import { surfaceValue } from "../../surface-values";
import { usePartShown } from "../../use-surface";
import { broadcastsRead, useRunsActing } from "../../waits/run-acts";
import { waitParts, type Nav, type VerbKind } from "../../waits/wait-rows";
import { useDraftsMoved, wantDrafts, type DraftWant } from "../need-you/drafts";
import type { NeedYouRowsCtx } from "../need-you/people-rows";
import { clearRowStates } from "../need-you/row-state";
import { draftWantsOf, useNeedYouModel, type NeedYouModel } from "../need-you-model";
import { keptWith, keptWithout, type Kept } from "./kept";
import { useToDoRows } from "./to-do";
import { appNavigate, canDo, surfaceFailed, useMoved, useToast, workspaceClock } from "../shell";
import { useTodayWord } from "./day-vm";
import { AlsoLine } from "../calm/also";
import { LeadGone } from "../calm/lead";
import { cardPressed, cardPressedLately } from "../calm/motion";
import { CalmList, CalmRow, type CalmLine } from "../calm/lines";
import type { TodayCard } from "../calm/lead";
import { ActedLine, QueueLead, queueLine } from "../calm/queue";
import { WaitLead, waitLine } from "../calm/wait";

/** The list, once Today has been read: the page is READY when it is drawn (client/page-speed.ts). */
export const NeedYou = ({ card }: { card: TodayCard }) => {
  useMoved("today");
  const vm = surfaceValue("today");
  usePartShown("today", "queue", !!vm);
  const model = useNeedYouModel(vm ?? null);
  return vm && model ? <NeedYouList vm={vm} model={model} card={card} /> : null;
};

/** The drafts the drawn rows read, asked for once per set, where the page's first reads did not hold them. */
function useDraftsAhead(wants: readonly DraftWant[]) {
  const key = wants.map((w) => `${w.conversationId}:${w.kind}:${w.forMessageId ?? ""}`).join("|");
  useEffect(() => {
    if (wants.length) void wantDrafts(wants);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asked for by its key: a row drawn again with the same threads and messages asks nothing
  }, [key]);
}

/**
 * The rows acted on this visit, told to the one count as they are kept (needs-you.ts needsYouActed): the head, the badge
 * and the tabs leave a row the moment it is pressed, as the list does. None once the list goes.
 */
function useActedTold(kept: Kept) {
  useLayoutEffect(() => {
    needsYouActed(Object.values(kept).map((k) => k.row));
  }, [kept]);
  useLayoutEffect(() => () => needsYouActed([]), []);
}

/** A run's verb, which is never the coral: the coral is the card's. */
const QUIET: VerbKind = () => "ghost";

/**
 * The borrowed reads that failed, said where their rows would stand, the rows above them current: the runs that may be
 * waiting, and the calls (a call back's). Called, not drawn.
 */
function readsFailed(callsUnread: boolean) {
  return (
    <>
      {!broadcastsRead() && surfaceFailed("broadcasts") && (
        <FailedRead
          kind="line"
          className="tq-failed"
          what="the campaign runs"
          body="The rows above are current."
          surface="broadcasts"
          testid="today-runs-failed"
        />
      )}
      {callsUnread && (
        <FailedRead
          kind="line"
          className="tq-failed"
          what="the phone line's calls"
          body="The day's other numbers are current."
          surface="today"
          testid="today-calls-failed"
        />
      )}
    </>
  );
}

/** How long a row finished in the card stays there, saying what became of it, before the next thing takes the card. */
const DONE_SHOWN_MS = 560;

/** What is left past the named lines is one of these kinds (contracts TodayAlsoCounts). */
type LeftAs = "waiting" | "toDo" | "toMark";

const NeedYouList = ({ vm, model, card }: { vm: TodayVM; model: NeedYouModel; card: TodayCard }) => {
  const [toastNode, ppFlash] = useToast();
  // The rows acted on this visit (a reply sent, a thread snoozed), kept in their place, and the row the member pressed
  // open: the model's, kept in the rows' store, so the page and the head read them as the list does.
  const { rows, groups, drawn, order, kept, setKept, setOpened } = model;
  useEffect(() => () => clearRowStates(), []);
  // The runs with an Approve or a Cancel on its way: their buttons wait for the server (S9-10).
  const acting = useRunsActing();
  // What AI set aside lands as a draft does, and is counted again as one does.
  useDraftsMoved();
  const nav: Nav = (to) => appNavigate(to);
  const may = canDo("approve");
  const word = useTodayWord();
  // The runs an approval can still send, each in its parts (the rows the Inbox's Needs you draws): the first holds the
  // card where the page says so, the others are lines.
  const waits = waitParts(
    { nav, flash: ppFlash, verbKind: QUIET, acting, phone: true, late: false },
    Number.POSITIVE_INFINITY,
  );
  // Only the rows drawn are drafted (decision 0071): the five waiting, not those past them. Older's only as one is opened:
  // nobody counts them, most are let go unread, and a draft is a model's turn.
  const olderOpen = groups.old.filter((r) => r.id === model.opened);
  useDraftsAhead(draftWantsOf([...groups.next, ...drawn.waiting, ...olderOpen]));
  const ctx: NeedYouRowsCtx = {
    nav,
    // The card is the page's one coral (Today, calm, D1): the row it holds is the only one whose act is drawn at all.
    coral: card?.holder === "queue" ? card.id : null,
    may,
    tz: workspaceClock()?.zone() ?? DEFAULT_TIMEZONE,
    flash: ppFlash,
    keep: (row) => setKept((was) => keptWith(was, row, rows)),
    unkeep: (row) => setKept((was) => keptWithout(was, row)),
    kept: new Set(Object.keys(kept)),
    focus: model.focus,
    // A line pressed rises into the card, on a phone and a desk alike.
    open: (id) => {
      cardPressed();
      setOpened(() => id);
    },
    word,
    stepDone: () => undefined,
    phone: null,
  };
  const todo = useToDoRows({
    model: model.todo,
    open: ctx.open,
    focus: model.opened,
    coral: card?.holder === "todo" ? card.id : null,
  });
  // How many need you is the one count, which hears what was acted on here.
  useActedTold(kept);
  const lead =
    card?.holder === "queue"
      ? { row: order.find((r) => r.id === card.id) ?? null, ctx }
      : card?.holder === "todo"
        ? { row: todo.rows.find((r) => r.id === card.id) ?? null, ctx: todo.ctx }
        : null;
  // The run in the card: the one the page named, else the first that waits (the runs moved since the page read them).
  const waitLead =
    card?.holder === "wait" ? (waits.parts.find((x) => x.key === card.id) ?? waits.parts[0] ?? null) : null;
  // The row the card held, finished a moment ago (D6): it stays in the card, saying what became of it, for a beat before
  // the next thing takes the card. Only where the next is this part's too, or nothing is left: another part's card
  // (setting up, what AI found) is the page's to draw at once, and two cards never stand together.
  const cardRow = lead?.row?.id ?? null;
  const cardNow = lead?.row
    ? { row: lead.row, holder: card?.holder === "todo" ? ("todo" as const) : ("queue" as const) }
    : null;
  const [shown, setShown] = useState(cardNow);
  const [letGo, setLetGo] = useState<string | null>(null);
  const ours = card === null || card.holder === "queue" || card.holder === "wait" || card.holder === "todo";
  // Still waiting: among the rows drawn and not acted on. A row kept says what became of it; a to-do done leaves its list.
  const waiting = (id: string) =>
    order.some((r) => r.id === id && !ctx.kept.has(id)) || todo.rows.some((r) => r.id === id && !todo.ctx.kept.has(id));
  const heldLead =
    ours && shown && shown.row.id !== cardRow && letGo !== shown.row.id && !waiting(shown.row.id) && cardPressedLately()
      ? { ...shown, ctx: shown.holder === "todo" ? todo.ctx : ctx }
      : null;
  const held = heldLead?.row.id ?? null;
  // What the card held is kept as it is drawn (React's own way to keep what an earlier draw held).
  if (!heldLead && (shown?.row.id ?? null) !== cardRow) setShown(cardNow);
  useEffect(() => {
    if (!held) return undefined;
    const timer = setTimeout(() => setLetGo(held), DONE_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [held]);
  const leadId = held ?? cardRow;
  // A row finished on this visit says what became of it, with its Undo, as a line of its own under the lines.
  const acted = [
    ...order
      .filter((r) => ctx.kept.has(r.id) && r.id !== leadId)
      .map((r) => <ActedLine key={r.id} row={r} ctx={ctx} />),
    ...todo.rows
      .filter((r) => todo.ctx.kept.has(r.id) && r.id !== leadId)
      .map((r) => <ActedLine key={r.id} row={r} ctx={todo.ctx} />),
  ];
  // Who waits, in the page's order: the people, what waits for an OK, then the team's to-dos. Three are named (D16), and
  // what is past them is counted by its kind in the one line under them.
  const all: Array<{ key: string; as: LeftAs; line: CalmLine }> = [
    ...order
      .filter((r) => !ctx.kept.has(r.id))
      .map((r) => ({ key: r.id, as: "waiting" as const, line: queueLine(r, ctx) })),
    ...waits.parts.map((x) => ({ key: x.key, as: "waiting" as const, line: waitLine(x) })),
    ...todo.rows
      .filter((r) => !todo.ctx.kept.has(r.id))
      .map((r) => ({
        key: r.id,
        as: r.kind === "visit" ? ("toMark" as const) : ("toDo" as const),
        line: queueLine(r, todo.ctx),
      })),
  ];
  // Every one of them keeps its line while the page is open. The card's own is folded shut, and so is one past the three
  // named: a line folds or opens where it stands as the card hands off, and nothing under it jumps (D6). While a finished
  // row still holds the card, the next one keeps its line.
  const next = cardRow ?? waitLead?.key ?? null;
  const inCard = heldLead ? null : next;
  const free = all.filter((x) => x.key !== inCard);
  const named = new Set(free.slice(0, TODAY_NAMED_MAX).map((x) => x.key));
  // What is past the named is counted as it will stand once the card has handed off, so the count never moves twice.
  const past = (as: LeftAs) =>
    all
      .filter((x) => x.key !== next)
      .slice(TODAY_NAMED_MAX)
      .filter((x) => x.as === as).length;
  // What To do holds past the rows it handed the page, by kind: its own counts, less the rows it drew.
  const { steps, visits, answering } = model.todo;
  const drew = (kind: TodayQueueRowVM["kind"]) => todo.rows.filter((r) => r.kind === kind).length;
  const beyond = (count: number, kind: TodayQueueRowVM["kind"]) => Math.max(0, count - drew(kind));
  const setAside = surfaceValue("reply_drafts")?.setAside ?? [];
  const left: TodayAlsoCounts = {
    waiting:
      past("waiting") +
      Math.max(0, groups.waiting.length - drawn.waiting.length) +
      Math.max(0, groups.ok.length - drawn.ok.length) +
      waits.cut,
    toDo: past("toDo") + beyond(steps?.count ?? 0, "step") + beyond(answering.length, "review"),
    toMark: past("toMark") + beyond(visits?.count ?? 0, "visit"),
    older: groups.old.length,
    setAside: setAside.length,
  };
  const callsUnread = vm.callsRead === false;
  // A read that failed is said where its rows would stand.
  const rest = callsUnread || (!broadcastsRead() && surfaceFailed("broadcasts"));
  return (
    <>
      {heldLead ? (
        <QueueLead row={heldLead.row} ctx={heldLead.ctx} holder={heldLead.holder} done />
      ) : lead?.row ? (
        <QueueLead row={lead.row} ctx={lead.ctx} holder={card?.holder === "todo" ? "todo" : "queue"} />
      ) : waitLead ? (
        <WaitLead part={waitLead} />
      ) : card === null ? (
        <LeadGone />
      ) : null}
      {all.length ? (
        <CalmList label={W.title} testid="today-queue">
          {all.map((x) => (
            <CalmRow key={x.key} {...x.line} folded={!named.has(x.key)} top={x.key === free[0]?.key} />
          ))}
        </CalmList>
      ) : null}
      {acted.length ? (
        <CalmList label={TODAY_LINE_WORDS.doneHere} testid="today-acted">
          {acted}
        </CalmList>
      ) : null}
      {rest ? (
        <section className="tq today-queue tz-need calm-rest" data-testid="today-queue-rest" aria-label={W.title}>
          <div className="tq-list ny-groups">{readsFailed(callsUnread)}</div>
        </section>
      ) : null}
      <AlsoLine
        left={left}
        doors={{
          waiting: "inbox",
          // The Inbox's Needs you lists whoever has waited past a week under who waits, with Mark all done.
          older: "inbox",
          toDo: steps?.to ?? todo.door,
          // The first visit the rows do not name: its sheet's Next walks on through the rest.
          toMark: visits ? (visits.items.at(drew("visit"))?.to ?? visits.to) : null,
          setAside: setAside[0] ? `inbox/th-${setAside[0]}` : null,
        }}
        word={word}
        keptAll={todo.keptAll}
      />
      {todo.toast}
      {toastNode}
    </>
  );
};
