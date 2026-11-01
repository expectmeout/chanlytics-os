/**
 * Today's Need you (the redesign of 1 Nov 2026, over decision 0071): everything that waits on you, in groups, each row in
 * the kit's one grammar (AttnRow) with what Ask prepared for it. Up next first, the one thing to do now (contracts
 * need-you-groups.ts: a reply your receptionist sends on its own, then a reply window that shuts within two hours, else
 * the oldest wait under a week); who else waits on you, oldest first; what waits for your OK (the runs waiting for a word,
 * the very rows the Inbox's Needs you draws, surfaces/waits/wait-rows.tsx, and a search's question); and whoever has
 * waited past a week, folded at the end with Mark all done. Chips over them cut them by what each asks of you (Reply,
 * Call, Approve) where more than one does. On a phone Need you has no pane of its own: each group's name stands over a
 * pane of its own, and To do and Ask found are one pane of two rows (the canvas of 1 Nov 2026). At the foot, a line each that opens in place: To do, your own to-dos, and Ask
 * found, what is worth a look and waits on nobody (need-you/groups.tsx). What Ask prepared and the one thing that cannot
 * wait are said by the head's sentence (need-you/head-say.ts), which said the count again over a second line here.
 *
 * One row is the focus and draws its work in place: on a phone the card, the first row still open, whose words open the
 * sheet that walks the list; on a desk the one opened, Up next until another is. Its act is the page's one coral. Every
 * other row is drawn short, its verb at its right with Ask's mark where Ask prepared it, and opens itself.
 */
import { useEffect, useLayoutEffect, useState, type ReactElement } from "react";
import {
  DEFAULT_TIMEZONE,
  NEED_YOU_WORDS,
  clockIsNear,
  needYouGroupsOf,
  needYouSay,
  needYouVerbOf,
  needsYouCount,
  verbForRoute,
  waitingRunsDoor,
  type NeedYouGroups,
  type NeedYouVerb,
  type TodayQueueRowVM,
  type TodayVM,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { Panel } from "../../kit/panel/panel";
import { SubTabs, type SubTab } from "../../kit/sub-tabs/sub-tabs";
import { needsYouOnToday, useNeedsYouParts } from "../../needs-you";
import { surfaceValue } from "../../surface-values";
import { usePartShown } from "../../use-surface";
import { queueHoldsCoral } from "../queue-coral";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, canDo, doorGlyph, surfaceFailed, useMoved, useToast, workspaceClock } from "../shell";
import { useDayVm } from "./day";
import { broadcastsRead, runsPending, useRunsActing } from "../../waits/run-acts";
import { waitRows, type Nav, type VerbKind } from "../../waits/wait-rows";
import { useDraftCounts, wantDrafts, type DraftWant } from "../need-you/drafts";
import { AskFoundLine, NeedYouGroup, OldDone, ToDoLine } from "../need-you/groups";
import { tellHeadSay } from "../need-you/head-say";
import { needYouRows, type NeedYouRowsCtx } from "../need-you/people-rows";
import { draftWantOf, opensToWork, worksInPlace } from "../need-you/rows";
import { clearRowStates } from "../need-you/row-state";
import { WalkSheet, type WalkAt } from "../need-you/walk-sheet";
import { useTodayOnPhone } from "../phone";
import { useToDoCount } from "../phone/to-do";

export const AgentCommand = () => {
  useMoved("today");
  const vm = surfaceValue("today");
  // Today's first part: the page is READY when its queue is drawn (client/page-speed.ts).
  usePartShown("today", "queue", !!vm);
  return vm ? <TodayQueue vm={vm} /> : null;
};

/** How many runs Your OK draws: the rest wait in the Inbox's Needs you, the whole list, and the foot says how many. */
const RUNS_ROOM = 3;

/** A row acted on this visit, and where it stood: it keeps its place whatever the next read says. */
type Kept = Record<string, { row: TodayQueueRowVM; at: number }>;

/**
 * The rows as read, with each one acted on this visit as it was kept (a held reply stopped reads "Held for you") and,
 * where the read no longer has it, put back where it stood: its receipt and its undo stay there. A thread kept under one
 * row stands for itself for the visit: the read's other row of it (a held reply stopped reads again as its closing window)
 * is not drawn a second time.
 */
function withKept(rows: readonly TodayQueueRowVM[], kept: Kept): TodayQueueRowVM[] {
  const threads = new Set(Object.values(kept).flatMap(({ row }) => (row.conversationId ? [row.conversationId] : [])));
  const out = rows.flatMap((r) => {
    const k = kept[r.id];
    if (k) return [k.row];
    return r.conversationId && threads.has(r.conversationId) ? [] : [r];
  });
  for (const { row, at } of Object.values(kept).sort((x, y) => x.at - y.at)) {
    if (!out.some((r) => r.id === row.id)) out.splice(Math.min(at, out.length), 0, row);
  }
  return out;
}

/** The drafts these rows want written ahead (rows.tsx draftWantOf): a reply, or a call back's brief. */
const draftWantsOf = (rows: readonly TodayQueueRowVM[]) => rows.map(draftWantOf).filter((w): w is DraftWant => !!w);

/** The drafts the drawn rows want, asked for once per set: kept ones read, missing ones written by a member who acts. */
function useDraftsAhead(wants: readonly DraftWant[], may: boolean) {
  const key = wants.map((w) => `${w.conversationId}:${w.kind}:${w.forMessageId ?? ""}`).join("|");
  useEffect(() => {
    if (wants.length) void wantDrafts(wants, may);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asked for by its key: a row drawn again with the same threads and messages asks nothing
  }, [key, may]);
}

/**
 * What the head says after how many need you (need-you/head-say.ts): what Ask prepared for the rows still open, then the
 * one thing that cannot wait, a reply that goes on its own or the first window to shut within two hours. Told as the rows
 * draw; the head says nothing of it once the queue goes.
 */
function useHeadSay(open: readonly TodayQueueRowVM[], may: boolean) {
  const counts = useDraftCounts(draftWantsOf(open), may);
  const held = open.find((r) => r.kind === "held") ?? null;
  const shuts = open.find((r) => clockIsNear(r) && r.writes?.window_closes) ?? null;
  const line = needYouSay({
    ...counts,
    held: held ? { who: held.who } : null,
    firstWindow: shuts?.writes?.window_closes ? { who: shuts.who, at: shuts.writes.window_closes } : null,
  });
  useLayoutEffect(() => {
    tellHeadSay(line);
  }, [line]);
  useLayoutEffect(() => () => tellHeadSay(null), []);
}

/** What the strip may cut Need you to: everything, or what asks one thing of you. */
type Cut = "all" | NeedYouVerb;

/**
 * The strip over the rows: All and each verb that has rows, where more than one does; nothing where one alone. All says no
 * figure: how many need you is the head's, the badge's number, and a window closing or a search is a row it does not
 * count, so a figure beside All read as a second answer to the head's question.
 */
function cutTabs(counts: Record<NeedYouVerb, number>): SubTab[] | null {
  const verbs = (["reply", "call", "approve"] as const).filter((v) => counts[v] > 0);
  if (verbs.length < 2) return null;
  return [
    { id: "all", label: NEED_YOU_WORDS.filter.all, testid: "today-cut-all" },
    ...verbs.map((v) => ({ id: v, label: NEED_YOU_WORDS.filter[v], count: counts[v], testid: `today-cut-${v}` })),
  ];
}

/**
 * What the queue could not hold, said with the door to it: the people past the rows, the replies counting down (which
 * have no row) and the runs past Your OK. Nothing where nothing was cut: the head's door is the Inbox.
 */
function queueFoot(cut: { rows: number; runs: number; sends: number }, nav: Nav) {
  const sends = TODAY_HELPERS.draftsSub(cut.sends);
  const parts = [
    cut.rows > 0 ? NEED_YOU_WORDS.more(cut.rows) : "",
    sends ? `${sends} in the Inbox` : "",
    cut.runs > 0 ? `${cut.runs} more run${cut.runs === 1 ? "" : "s"} in the Inbox` : "",
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <div className="tq-foot" data-testid="today-queue-foot">
      <span>{parts.join(" · ")}</span>
      <Button variant="quiet" size="sm" onClick={() => nav("inbox")}>
        {NEED_YOU_WORDS.seeAll}
      </Button>
    </div>
  );
}

/**
 * On a phone (the phone canvas, 28 Oct 2026): a row opened walks the list in a sheet. What each row came to is kept by the
 * row for the visit (row-state.ts): it goes as Today does.
 */
function usePhoneQueue() {
  const phone = useTodayOnPhone();
  const [walk, setWalk] = useState<WalkAt>(null);
  const toDo = useToDoCount();
  useEffect(() => () => clearRowStates(), []);
  return { phone, walk, setWalk, toDo };
}

/** The walk through the rows the card draws, on a phone: the sheet, and To do's to-dos for its end. Called, not drawn. */
function queueWalk(
  shown: readonly TodayQueueRowVM[],
  { walk, setWalk }: { walk: WalkAt; setWalk: (at: WalkAt) => void },
  ctx: NeedYouRowsCtx,
  todos: number,
) {
  return (
    <WalkSheet
      rows={shown.filter(worksInPlace)}
      at={walk}
      onAt={setWalk}
      kept={ctx.kept}
      work={{ may: ctx.may, tz: ctx.tz, flash: ctx.flash, keep: ctx.keep }}
      word={ctx.word}
      todos={todos}
      onToDo={() => {
        setWalk(null);
        document.querySelector('[data-testid="today-todo-line"]')?.scrollIntoView({ block: "start" });
      }}
    />
  );
}

/** The head on a desk: the name, the door to where what waits is, and the strip under them where there is one. */
function deskHead(door: { to: string; label: string }, nav: Nav) {
  return (
    <div className="tq-head">
      <h2 className="tq-title" id="today-queue-title">
        Need you
      </h2>
      <Button variant="quiet" size="sm" className="tq-open" onClick={() => nav(door.to)} data-testid="today-queue-door">
        {door.label}
        <Icon name={doorGlyph()} size={11} />
      </Button>
    </div>
  );
}

/** Need you's groups as the strip lets them through. */
type Shown = Pick<NeedYouGroups<TodayQueueRowVM>, "next" | "waiting" | "ok" | "old">;

/**
 * The rows the strip lets through, by group, Your OK's runs among them, and the strip itself: what each row asks of you,
 * counted among the people and Your OK. The cut in force is one the strip still offers, else everything.
 */
function cutOf(groups: NeedYouGroups<TodayQueueRowVM>, runs: readonly ReactElement[], cut: Cut) {
  const people = [...groups.next, ...groups.waiting, ...groups.old];
  const tabs = cutTabs({
    reply: people.filter((r) => needYouVerbOf(r) === "reply").length,
    call: people.filter((r) => needYouVerbOf(r) === "call").length,
    approve: groups.ok.length + runs.length,
  });
  const by: Cut = tabs && tabs.some((t) => t.id === cut) ? cut : "all";
  const shows = (r: TodayQueueRowVM) => by === "all" || needYouVerbOf(r) === by;
  const shown: Shown = {
    next: groups.next.filter(shows),
    waiting: groups.waiting.filter(shows),
    ok: groups.ok.filter(shows),
    old: groups.old.filter(shows),
  };
  return { tabs, by, shown, runs: by === "all" || by === "approve" ? runs : [] };
}

/**
 * To do and Ask found at Need you's foot: on a phone one pane of the two, a row each (the canvas of 1 Nov 2026); on a desk
 * a line each, side by side. Called, not drawn.
 */
function footLines(phone: boolean, lines: ReactElement) {
  return phone ? (
    <Panel size="flush" className="ny-foot-lines ny-pane">
      {lines}
    </Panel>
  ) : (
    <div className="ny-foot-lines">{lines}</div>
  );
}

/** The strip over the rows, where there is one: the kit's sub-tabs as chips (the canvas of 1 Nov 2026). Called, not drawn. */
function cutStrip(tabs: SubTab[] | null, by: Cut, onCut: (cut: Cut) => void) {
  return tabs ? (
    <SubTabs
      look="chips"
      label={NEED_YOU_WORDS.filter.label}
      value={by}
      tabs={tabs}
      onSelect={(id) => onCut(id as Cut)}
      className="ny-cuts"
    />
  ) : null;
}

/**
 * Need you's groups, each under its small head, in the page's order, so the coral goes to the first act drawn: Up next, who
 * waits on you, Your OK with its runs, and Over a week with Mark all done. Called, not drawn; a group with no rows is null.
 */
function groupsDrawn(shown: Shown, runs: readonly ReactElement[], ctx: NeedYouRowsCtx) {
  const W = NEED_YOU_WORDS.group;
  const ok = shown.ok.length + runs.length;
  // On a phone each group is a pane of its own under its name (the canvas of 1 Nov 2026); on a desk, rows in Need you's.
  const pane = !!ctx.phone;
  return [
    shown.next.length ? (
      <NeedYouGroup key="next" title={W.next} count={null} pane={pane} testid="today-group-next">
        {needYouRows(shown.next, ctx)}
      </NeedYouGroup>
    ) : null,
    shown.waiting.length ? (
      <NeedYouGroup
        key="waiting"
        title={W.waiting}
        count={shown.waiting.length}
        pane={pane}
        testid="today-group-waiting"
      >
        {needYouRows(shown.waiting, ctx)}
      </NeedYouGroup>
    ) : null,
    ok ? (
      <NeedYouGroup key="ok" title={W.ok} count={ok} pane={pane} testid="today-group-ok">
        {[...needYouRows(shown.ok, ctx), ...runs]}
      </NeedYouGroup>
    ) : null,
    shown.old.length ? (
      <NeedYouGroup
        key="old"
        title={W.old}
        count={shown.old.length}
        act={<OldDone rows={shown.old} flash={ctx.flash} />}
        pane={pane}
        testid="today-group-old"
      >
        {needYouRows(shown.old, ctx)}
      </NeedYouGroup>
    ) : null,
  ];
}

/**
 * Where the head's door goes: the Inbox while a person waits, else, when only runs wait, the run (one), To send (every one
 * waiting waits for its owner to send its emails) or Needs you (contracts waitingRunsDoor).
 */
function queueDoorOf(parts: { holds: number; sends: number; runs: number }): { to: string; label: string } {
  const to = parts.holds + parts.sends === 0 && parts.runs > 0 ? waitingRunsDoor(runsPending().waiting) : "inbox";
  return { to, label: to === "inbox" ? NEED_YOU_WORDS.door : (verbForRoute(to) ?? NEED_YOU_WORDS.door) };
}

/**
 * The borrowed reads that failed, said where their rows would stand, the rows above them current: the runs that may be
 * waiting, and the calls (a call back's, one worth a listen). Called, not drawn.
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

/**
 * What an empty queue means: a sentence about the wires, so contracts says it (a dark line, no line, a line the
 * receptionist does not answer, or the receptionist holding the floor). Called, not drawn.
 */
const queueEmpty = (vm: TodayVM) => (
  <EmptyState
    kind="line"
    glyph={vm.queue.empty.glyph}
    tone={vm.queue.empty.tone || undefined}
    title={vm.queue.empty.title}
    testid={vm.queue.empty.testid}
  />
);

/** What Ask found holds: its morning's ideas, the calls worth a listen and the leads who tried, drawn or not. */
function foundCount(found: number, calls: number): number {
  const morning = surfaceValue("ask_morning")?.dto;
  return (morning?.offered ? morning.cards.length : 0) + found + calls;
}

/**
 * One coral on the page: the first act asked for takes it and every other is quiet; `taken`, once every row is drawn, says
 * whether one did.
 */
function oneCoral(): { verbKind: VerbKind; taken: () => boolean } {
  let left = true;
  return {
    verbKind: () => {
      const k = left ? "primary" : "ghost";
      left = false;
      return k;
    },
    taken: () => !left,
  };
}

/** Whether Need you took the coral, told to To do and the setup card as the queue draws (queue-coral.ts). */
function useCoralTold(holds: boolean) {
  useLayoutEffect(() => {
    queueHoldsCoral(holds);
  }, [holds]);
  useLayoutEffect(() => () => queueHoldsCoral(false), []);
}

const TodayQueue = ({ vm }: { vm: TodayVM }) => {
  // The runs (Sent's), Ask's morning and Google's reviews move the parts at the queue's foot; the replies to a reach-out
  // move a row read as that reply's (contracts withReplies). Today owns those reads, so this redraws and reads nothing.
  useMoved(["broadcasts", "people", "calendar", "reach_out_replies", "ask_morning", "google"]);
  // What needs you, by its parts, as the badge counts them: null until the Inbox has been read (redrawn when a part moves).
  const live = useNeedsYouParts();
  const [toastNode, ppFlash] = useToast();
  // The rows acted on this visit (a reply sent, a thread snoozed), kept in their place.
  const [kept, setKept] = useState<Kept>({});
  // The row a desk has open: Up next until the member opens another (undefined), or none where they closed it (null).
  const [opened, setOpened] = useState<string | null | undefined>(undefined);
  const [cut, setCut] = useState<Cut>("all");
  const { phone, walk, setWalk, toDo } = usePhoneQueue();
  // The runs with an Approve or a Cancel on its way: their buttons wait for the server (S9-10).
  const acting = useRunsActing();
  const nav: Nav = (to) => appNavigate(to);
  const may = canDo("approve");
  const word = useDayVm()?.word ?? "appointment";
  // A handoff whose thread's reply to a reach-out was read is that reply's row (contracts withReplies, PR 8). The steps
  // due and yesterday's visits to mark are To do's, at the foot (need-you/groups.tsx), on a desk as on a phone.
  const rows = withKept(TODAY_HELPERS.withReplies(vm.queue.rows), kept);
  const groups = needYouGroupsOf(rows);
  const people = [...groups.next, ...groups.waiting, ...groups.old];
  const coral = oneCoral();
  // Your OK's runs, first those waiting for a word, then those too late to approve; each act its own, quiet.
  const runs = waitRows({ nav, flash: ppFlash, verbKind: () => "ghost", acting, phone }, RUNS_ROOM);
  const view = cutOf(groups, runs.drawn, cut);
  const order = [...view.shown.next, ...view.shown.waiting, ...view.shown.ok, ...view.shown.old];
  // The focus: the first row still open that opens to be worked, on a phone always; on a desk until another is opened.
  const first = order.find((r) => !kept[r.id] && opensToWork(r))?.id ?? null;
  const open = people.filter((r) => !kept[r.id]);
  // The drafts the rows want, written ahead (asked for once per set, by their key), and Ask's line told to the head.
  useDraftsAhead(draftWantsOf(people), may);
  useHeadSay(open, may);
  const ctx: NeedYouRowsCtx = {
    nav,
    verbKind: coral.verbKind,
    may,
    tz: workspaceClock()?.zone() ?? DEFAULT_TIMEZONE,
    flash: ppFlash,
    keep: (row) =>
      setKept((was) => ({ ...was, [row.id]: { row, at: was[row.id]?.at ?? rows.findIndex((r) => r.id === row.id) } })),
    kept: new Set(Object.keys(kept)),
    focus: phone || opened === undefined ? first : opened,
    open: (id) => (phone ? setWalk(id) : setOpened((was) => (was === id ? null : id))),
    word,
    stepDone: () => undefined,
    phone: phone ? { walk: setWalk } : null,
  };
  const drawn = groupsDrawn(view.shown, view.runs, ctx);
  // Every row has asked for its act by now: whether the focus took the coral.
  const holdsCoral = coral.taken();
  useCoralTold(holdsCoral);
  const parts = needsYouOnToday(vm, live);
  // A reply counting down has a row (decision 0071): the foot says only those it does not draw.
  const sendsUndrawn = Math.max(0, parts.sends - open.filter((r) => r.kind === "held").length);
  const drawnAny = drawn.some(Boolean);
  const callsUnread = vm.callsRead === false;
  // On a phone, nothing to draw is no pane at all: the head has said so.
  if (phone && !drawnAny && !callsUnread && toDo === 0 && foundCount(groups.found.length, vm.queue.calls) === 0)
    return toastNode;
  // The empty line, on a desk, where nobody waits (the badge's number) and To do's rows, which are the work then, are none.
  const empty = !phone && !drawnAny && needsYouCount(parts) === 0 && toDo === 0;
  return (
    <section
      className="tq today-queue"
      data-testid="today-queue"
      data-phone={phone || undefined}
      aria-labelledby={phone ? undefined : "today-queue-title"}
      aria-label={phone ? "Need you" : undefined}
    >
      {!phone && deskHead(queueDoorOf(parts), nav)}
      {cutStrip(view.tabs, view.by, setCut)}
      <div className="tq-list ny-groups">
        {drawn}
        {readsFailed(callsUnread)}
        {empty ? queueEmpty(vm) : null}
      </div>
      {queueFoot({ rows: vm.queue.more_people, runs: runs.cut, sends: sendsUndrawn }, nav)}
      {footLines(
        phone,
        <>
          {/* Nothing waits: To do is the work, open from the start. */}
          <ToDoLine word={word} startOpen={!drawnAny} queueHolds={holdsCoral} />
          <AskFoundLine found={groups.found} calls={vm.queue.calls} ctx={ctx} />
        </>,
      )}
      {phone ? queueWalk(order, { walk, setWalk }, ctx, toDo) : null}
      {toastNode}
    </section>
  );
};
