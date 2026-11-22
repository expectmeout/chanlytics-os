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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  addressOf,
  DEFAULT_TIMEZONE,
  HELD_WORDS,
  isPersonRow,
  NEED_YOU_WORDS as W,
  type TodayQueueRowVM,
  type TodayTheirsVM,
  type TodayVM,
} from "@chanlytics/contracts";
import { routeDoor } from "../../frame-verbs";
import { holdLineOf, useHandsBusy } from "../calm/held";
import { heldActsOf } from "../need-you/held-acts";
import { goFromToday } from "../over/open";
import { TODAY_LINE_WORDS, TODAY_NAMED_MAX, type TodayAlsoCounts } from "../model/lines";
import { FailedRead } from "../../kit/empty/empty";
import { todayAskOf, useTodayAsks } from "../calm/asks";
import { needsYouActed } from "../../needs-you";
import { surfaceValue } from "../../surface-values";
import { usePartShown } from "../../use-surface";
import { broadcastsRead, useRunsActing } from "../../waits/run-acts";
import { waitParts, type VerbKind, type WaitPart } from "../../waits/wait-rows";
import { useDraftsMoved, wantDrafts, type DraftWant } from "../need-you/drafts";
import type { NeedYouRowsCtx } from "../need-you/people-rows";
import { clearRowStates } from "../need-you/row-state";
import { draftWantsOf, useNeedYouModel, type NeedYouModel } from "../need-you-model";
import { keptWith, keptWithout, type Kept } from "./kept";
import { useToDoRows } from "./to-do";
import { appNavigate, canDo, surfaceFailed, useMoved, useToast, workspaceClock } from "../shell";
import { useTodayWord } from "./day-vm";
import { AlsoLine, type AlsoDoors } from "../calm/also";
import { LeadCleared, LeadGone } from "../calm/lead";
import type { ClearedBeat } from "../calm/cleared";
import { cardPressed, cardPressedLately, useFoldsIn } from "../calm/motion";
import { CalmList, CalmRow, type CalmLine } from "../calm/lines";
import type { TodayCard } from "../calm/lead";
import { ActedLine, QueueLead, queueLine } from "../calm/queue";
import { WaitLead, waitLine } from "../calm/wait";

/** The list, once Today has been read: the page is READY when it is drawn (client/page-speed.ts). */
export const NeedYou = ({
  card,
  evening = false,
  beat = null,
}: {
  card: TodayCard;
  evening?: boolean;
  /** The celebration, while the page owes it (calm/cleared.ts): it stands where the card stood. */
  beat?: ClearedBeat;
}) => {
  useMoved("today");
  const vm = surfaceValue("today");
  usePartShown("today", "queue", !!vm);
  const model = useNeedYouModel(vm ?? null);
  return vm && model ? <NeedYouList vm={vm} model={model} card={card} evening={evening} beat={beat} /> : null;
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

/** To do's rows as the list draws them (to-do.tsx). */
type ToDo = ReturnType<typeof useToDoRows>;

/** The runs an approval can still send, each in its parts (the rows the Inbox's Needs you draws). */
type Waits = ReturnType<typeof waitParts>;

/** One of who waits, as a line: its key, the kind it is counted as once past the named, and the line. */
interface Entry {
  key: string;
  as: LeftAs;
  line: CalmLine;
}

/**
 * How a row is worked here, which its line and its card share. The rows acted on this visit (a reply sent, a thread
 * snoozed) are kept in their place, and the row the member pressed open is the model's, in the rows' store, so the page
 * and the head read them as the list does.
 */
function useRowsCtx(model: NeedYouModel, card: TodayCard, flash: NeedYouRowsCtx["flash"]): NeedYouRowsCtx {
  const { rows, kept, setKept, setOpened } = model;
  const word = useTodayWord();
  return {
    nav: (to) => appNavigate(to),
    // The card is the page's one coral (Today, calm, D1): the row it holds is the only one whose act is drawn at all.
    coral: card?.holder === "queue" ? card.id : null,
    may: canDo("approve"),
    tz: workspaceClock()?.zone() ?? DEFAULT_TIMEZONE,
    flash,
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
}

/** A row in the card: the row, which part's it is, and how it is worked there. */
interface CardRow {
  row: TodayQueueRowVM;
  holder: "queue" | "todo";
  ctx: NeedYouRowsCtx;
}

/** The row the page names for the card (`card`), where it is this part's. */
function cardRowOf(
  card: TodayCard,
  order: readonly TodayQueueRowVM[],
  ctx: NeedYouRowsCtx,
  todo: ToDo,
): CardRow | null {
  if (card?.holder === "queue") {
    const row = order.find((r) => r.id === card.id);
    return row ? { row, holder: "queue", ctx } : null;
  }
  if (card?.holder === "todo") {
    const row = todo.rows.find((r) => r.id === card.id);
    return row ? { row, holder: "todo", ctx: todo.ctx } : null;
  }
  return null;
}

/**
 * The row the card holds, as the page names it, and the one it held a moment ago, finished by a press in it (D6): that one
 * stays in the card, saying what became of it, for a beat before the next thing takes the card. Only where the next is
 * this part's too, or nothing is left: another part's card (setting up, what AI found) is the page's to draw at once, and
 * two cards never stand together.
 */
function useCardRows(card: TodayCard, order: readonly TodayQueueRowVM[], ctx: NeedYouRowsCtx, todo: ToDo) {
  const lead = cardRowOf(card, order, ctx, todo);
  const cardRow = lead?.row.id ?? null;
  const [shown, setShown] = useState<CardRow | null>(lead);
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
  if (!heldLead && (shown?.row.id ?? null) !== cardRow) setShown(lead);
  useEffect(() => {
    if (!held) return undefined;
    const timer = setTimeout(() => setLetGo(held), DONE_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [held]);
  return { lead, heldLead, cardRow };
}

/** A row finished on this visit says what became of it, with its Undo, as a line of its own over the lines. */
const actedLines = (order: readonly TodayQueueRowVM[], ctx: NeedYouRowsCtx, todo: ToDo, leadId: string | null) => [
  ...order.filter((r) => ctx.kept.has(r.id) && r.id !== leadId).map((r) => <ActedLine key={r.id} row={r} ctx={ctx} />),
  ...todo.rows
    .filter((r) => todo.ctx.kept.has(r.id) && r.id !== leadId)
    .map((r) => <ActedLine key={r.id} row={r} ctx={todo.ctx} />),
];

/**
 * Who waits, in the page's order: the people, what waits for an OK, then the team's to-dos. Three are named (D16), and
 * what is past them is counted by its kind in the one line under them.
 */
const entriesOf = (order: readonly TodayQueueRowVM[], waits: Waits, todo: ToDo, ctx: NeedYouRowsCtx): Entry[] => [
  ...order
    .filter((r) => !ctx.kept.has(r.id))
    // Held, a line offers its acts without opening (W11).
    .map((r) => ({
      key: r.id,
      as: "waiting" as const,
      line: { ...queueLine(r, ctx), hold: holdLineOf(heldActsOf(r, ctx)) },
    })),
  ...waits.parts.map((x) => ({ key: x.key, as: "waiting" as const, line: waitLine(x) })),
  ...todo.rows
    .filter((r) => !todo.ctx.kept.has(r.id))
    .map((r) => ({
      key: r.id,
      as: r.kind === "visit" ? ("toMark" as const) : ("toDo" as const),
      line: { ...queueLine(r, todo.ctx), hold: holdLineOf(heldActsOf(r, todo.ctx)) },
    })),
];

/**
 * Nothing moves under your hands (W23): while a line is held or a sheet is open over Today, someone new is not placed among
 * the lines. They are said once, "1 new · placed when you're done", and placed as the hand is free. What leaves (a reply
 * sent, a line done) still leaves: that is the hand's own doing.
 */
function useHeldArrivals(entries: Entry[], flash: NeedYouRowsCtx["flash"]): Entry[] {
  const busy = useHandsBusy();
  // The lines there as the hand got busy, kept as the page draws (React's own way to keep what an earlier draw held).
  const there = useRef<ReadonlySet<string> | null>(null);
  if (!busy) there.current = null;
  else there.current ??= new Set(entries.map((x) => x.key));
  const keys = there.current;
  const shown = keys ? entries.filter((x) => keys.has(x.key)) : entries;
  const arrived = entries.length - shown.length;
  const arrivedSeen = useRef({ arrived: 0, flash });
  arrivedSeen.current.flash = flash;
  useEffect(() => {
    if (arrived > arrivedSeen.current.arrived)
      arrivedSeen.current.flash({ msg: <>{TODAY_LINE_WORDS.held.arrived(arrived)}</> });
    arrivedSeen.current.arrived = arrived;
  }, [arrived]);
  return shown;
}

/**
 * The conversations a teammate has (W19), a quiet line each under who waits on you: in no count, saying whose they are,
 * each opening over Today, where it can be taken back. Three at most, as the named lines are.
 */
function theirsLines(theirs: readonly TodayTheirsVM[]) {
  if (!theirs.length) return null;
  return (
    <div className="calm-theirs">
      <CalmList label={HELD_WORDS.theirs.pill} testid="today-theirs">
        {theirs.slice(0, TODAY_NAMED_MAX).map((their) => (
          <CalmRow
            key={their.conversationId}
            first={{ face: { person: { name: their.who, initials: their.initials } } }}
            name={their.who}
            // Whose it is first, then what they said: one line under the name.
            facts={their.said ? [HELD_WORDS.theirs.pill, their.said] : [HELD_WORDS.theirs.pill]}
            door={routeDoor(addressOf({ kind: "conversation", id: their.conversationId }), goFromToday)}
            testid="today-theirs-line"
          />
        ))}
      </CalmList>
    </div>
  );
}

/**
 * What is left past the named lines, by kind (calm/also.tsx), as it will stand once the card has handed off, so the count
 * never moves twice, and the door to each. What To do holds past the rows it handed the page is its own counts (the
 * read's), less the rows it drew that the read still holds: one kept in its place after the read let it go (a visit
 * marked, a step done) is in no count, and counting it hid the one past the three (a visit left out was said nowhere once
 * another was marked).
 */
function alsoLeftOf(parts: { entries: Entry[]; next: string | null; model: NeedYouModel; waits: Waits; todo: ToDo }) {
  const { groups, drawn } = parts.model;
  const { steps, visits, answering, read } = parts.model.todo;
  const past = (as: LeftAs) =>
    parts.entries
      .filter((x) => x.key !== parts.next)
      .slice(TODAY_NAMED_MAX)
      .filter((x) => x.as === as).length;
  const fromRead = new Set(read.map((r) => r.id));
  const drew = (kind: TodayQueueRowVM["kind"]) =>
    parts.todo.rows.filter((r) => r.kind === kind && fromRead.has(r.id)).length;
  const beyond = (count: number, kind: TodayQueueRowVM["kind"]) => Math.max(0, count - drew(kind));
  const setAside = surfaceValue("reply_drafts")?.setAside ?? [];
  const left: TodayAlsoCounts = {
    waiting:
      past("waiting") +
      Math.max(0, groups.waiting.length - drawn.waiting.length) +
      Math.max(0, groups.ok.length - drawn.ok.length) +
      parts.waits.cut,
    toDo: past("toDo") + beyond(steps?.count ?? 0, "step") + beyond(answering.length, "review"),
    toMark: past("toMark") + beyond(visits?.count ?? 0, "visit"),
    older: groups.old.length,
    setAside: setAside.length,
  };
  const doors: AlsoDoors = {
    waiting: "inbox",
    // The Inbox's Needs you lists whoever has waited past a week under who waits, with Mark all done.
    older: "inbox",
    toDo: steps?.to ?? parts.todo.door,
    // The first visit the rows do not name: its sheet's Next walks on through the rest.
    toMark: visits ? (visits.items.at(drew("visit"))?.to ?? visits.to) : null,
    setAside: setAside[0] ? `inbox/th-${setAside[0]}` : null,
  };
  return { left, doors };
}

/**
 * The card, where this part holds it: a row finished a moment ago, the row it holds, or the run; the celebration, for
 * its beat, where the last who waited was answered here (W6); and where nothing holds it, the room it stood in folds shut.
 */
function cardIn(at: {
  heldLead: CardRow | null;
  lead: CardRow | null;
  waitLead: WaitPart | null;
  card: TodayCard;
  beat: ClearedBeat;
}) {
  if (at.heldLead) return <QueueLead row={at.heldLead.row} ctx={at.heldLead.ctx} holder={at.heldLead.holder} done />;
  if (at.lead) return <QueueLead row={at.lead.row} ctx={at.lead.ctx} holder={at.lead.holder} />;
  if (at.waitLead) return <WaitLead part={at.waitLead} />;
  if (at.beat) return <LeadCleared live={at.beat === "on"} />;
  return at.card === null ? <LeadGone /> : null;
}

const NeedYouList = ({
  vm,
  model,
  card,
  evening,
  beat,
}: {
  vm: TodayVM;
  model: NeedYouModel;
  card: TodayCard;
  evening: boolean;
  beat: ClearedBeat;
}) => {
  const [toastNode, ppFlash] = useToast();
  const { groups, drawn, order, kept } = model;
  useEffect(() => () => clearRowStates(), []);
  // The runs with an Approve or a Cancel on its way: their buttons wait for the server (S9-10).
  const acting = useRunsActing();
  // What AI set aside lands as a draft does, and is counted again as one does.
  useDraftsMoved();
  const ctx = useRowsCtx(model, card, ppFlash);
  // The runs an approval can still send: the first holds the card where the page says so, the others are lines.
  const waits = waitParts(
    { nav: ctx.nav, flash: ppFlash, verbKind: QUIET, acting, phone: true, late: false },
    Number.POSITIVE_INFINITY,
  );
  // Only the rows drawn are drafted (decision 0071): the five waiting, not those past them. Older's only as one is opened:
  // nobody counts them, most are let go unread, and a draft is a model's turn.
  const olderOpen = groups.old.filter((r) => r.id === model.opened);
  useDraftsAhead(draftWantsOf([...groups.next, ...drawn.waiting, ...olderOpen]));
  const todo = useToDoRows({
    model: model.todo,
    open: ctx.open,
    focus: model.opened,
    coral: card?.holder === "todo" ? card.id : null,
  });
  // How many need you is the one count, which hears what was acted on here.
  useActedTold(kept);
  // AI is handed who waits first (D10), in the card's own order: the first person still waiting, then the first run.
  const firstWaiting = order.find((r) => isPersonRow(r) && !ctx.kept.has(r.id)) ?? null;
  const firstRun = waits.parts.find((x) => x.question) ?? null;
  useTodayAsks("waits", [
    firstWaiting ? todayAskOf(TODAY_LINE_WORDS.asks.person(firstWaiting.who)) : null,
    firstRun?.question ? todayAskOf(firstRun.question) : null,
  ]);
  const { lead, heldLead, cardRow } = useCardRows(card, order, ctx, todo);
  // The run in the card: the one the page named, else the first that waits (the runs moved since the page read them).
  const waitLead =
    card?.holder === "wait" ? (waits.parts.find((x) => x.key === card.id) ?? waits.parts[0] ?? null) : null;
  const acted = actedLines(order, ctx, todo, heldLead?.row.id ?? cardRow);
  // Once the day is over the to-dos wait for morning, in the page's one line for it (calm/evening.tsx, W5): only who
  // truly needs you stands here.
  const all = entriesOf(order, waits, todo, ctx);
  const entries = useHeldArrivals(evening ? all.filter((x) => x.as === "waiting") : all, ppFlash);
  // Every one of them keeps its line while the page is open. The card's own is folded shut, and so is one past the three
  // named: a line folds or opens where it stands as the card hands off, and nothing under it jumps (D6). While a finished
  // row still holds the card, the next one keeps its line.
  const next = cardRow ?? waitLead?.key ?? null;
  const inCard = heldLead ? null : next;
  const free = entries.filter((x) => x.key !== inCard);
  const named = new Set(free.slice(0, TODAY_NAMED_MAX).map((x) => x.key));
  // Someone new folds into their place (W7): a person or an ask the day's own read brings, which Today hears live. A
  // to-do or a run's line comes with a later read of its own as the page opens, and stands at once (D14).
  const people = new Set(order.map((r) => r.id));
  const arriving = useFoldsIn(entries.flatMap((x) => (people.has(x.key) ? [x.key] : [])));
  const also = alsoLeftOf({ entries, next, model, waits, todo });
  const { doors } = also;
  const left = evening ? { ...also.left, toDo: 0, toMark: 0 } : also.left;
  const callsUnread = vm.callsRead === false;
  // A read that failed is said where its rows would stand.
  const rest = callsUnread || (!broadcastsRead() && surfaceFailed("broadcasts"));
  return (
    <>
      {cardIn({ heldLead, lead, waitLead, card, beat })}
      {/* What was finished here opens at the top of the list, where the next thing's line shuts as it rises into the
          card (the second look, M1): the two cross where they stand. */}
      {acted.length ? (
        <CalmList label={TODAY_LINE_WORDS.doneHere} testid="today-acted">
          {acted}
        </CalmList>
      ) : null}
      {entries.length ? (
        <CalmList label={W.title} testid="today-queue">
          {entries.map((x) => (
            <CalmRow
              key={x.key}
              {...x.line}
              folded={!named.has(x.key) || arriving.has(x.key)}
              top={x.key === free[0]?.key}
            />
          ))}
        </CalmList>
      ) : null}
      {theirsLines(vm.theirs)}
      {rest ? (
        <section className="tq today-queue tz-need calm-rest" data-testid="today-queue-rest" aria-label={W.title}>
          <div className="tq-list ny-groups">{readsFailed(callsUnread)}</div>
        </section>
      ) : null}
      <AlsoLine left={left} doors={doors} word={ctx.word} keptAll={todo.keptAll} />
      {todo.toast}
      {toastNode}
    </>
  );
};
