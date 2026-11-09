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
 * To do took it, To do's first act. Every other row is drawn short, its verb at its right with Ask's mark where Ask
 * prepared it, and opens itself. Need you is one pane under its name, on a desk and a phone alike.
 */
import { useEffect, useLayoutEffect, useState, type ReactElement, type ReactNode } from "react";
import {
  DEFAULT_TIMEZONE,
  NEED_YOU_CAPS,
  NEED_YOU_WORDS as W,
  clockIsNear,
  needYouGroupsOf,
  needYouSay,
  verbForRoute,
  waitingRunsDoor,
  type NeedYouGroups,
  type TodayQueueRowVM,
  type TodayVM,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { needsYouActed } from "../../needs-you";
import { surfaceValue } from "../../surface-values";
import { usePartShown } from "../../use-surface";
import { broadcastsRead, runsPending, useRunsActing } from "../../waits/run-acts";
import { waitRows, type Nav, type VerbKind } from "../../waits/wait-rows";
import { TODAY_HELPERS } from "../helpers";
import { useDraftCounts, useDraftsMoved, wantDrafts, type DraftWant } from "../need-you/drafts";
import { NeedYouGroup, handBackAll, handedBackWords, type HandedBack } from "../need-you/groups";
import { tellHeadSay } from "../need-you/head-say";
import { OlderGroup } from "../need-you/older";
import { needYouRows, type NeedYouRowsCtx } from "../need-you/people-rows";
import { draftWantOf, opensToWork, worksInPlace } from "../need-you/rows";
import { clearRowStates } from "../need-you/row-state";
import { WalkSheet, type WalkAt, type WalkOlder } from "../need-you/sheet/walk-sheet";
import { useTodayOnPhone } from "../phone";
import { keptWith, keptWithout, withKept, type Kept } from "./kept";
import { useToDoRows, type ToDoRows } from "./to-do";
import { queueHoldsCoral, zoneDrawn } from "../queue-coral";
import { sectionDoor } from "./section-door";
import { appNavigate, canDo, doorGlyph, surfaceFailed, useMoved, useToast, workspaceClock } from "../shell";
import { useTodayWord } from "./day-vm";

/** The list, once Today has been read: the page is READY when it is drawn (client/page-speed.ts). */
export const NeedYou = () => {
  useMoved("today");
  const vm = surfaceValue("today");
  usePartShown("today", "queue", !!vm);
  return vm ? <NeedYouList vm={vm} /> : null;
};

/** The drafts these rows read (rows.tsx draftWantOf): a reply, or a call back's read. */
const draftWantsOf = (rows: readonly TodayQueueRowVM[]) => rows.map(draftWantOf).filter((w): w is DraftWant => !!w);

/** The drafts the drawn rows read, asked for once per set, where the page's first reads did not hold them. */
function useDraftsAhead(wants: readonly DraftWant[]) {
  const key = wants.map((w) => `${w.conversationId}:${w.kind}:${w.forMessageId ?? ""}`).join("|");
  useEffect(() => {
    if (wants.length) void wantDrafts(wants);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asked for by its key: a row drawn again with the same threads and messages asks nothing
  }, [key]);
}

/**
 * What the head says after how many need you: what Ask prepared for the rows still open, then the one thing that cannot
 * wait, a reply that goes on its own or the first window to shut within two hours. Told as the rows draw; the head says
 * nothing of it once the list goes.
 */
function useTellHead(open: readonly TodayQueueRowVM[]) {
  // A reply outside WhatsApp's window goes only as a template: Ask's words for it are not said as ready (the 10/10 read,
  // 2 Nov 2026: "Ask drafted a reply" over a card whose one press was Choose a template).
  const counts = useDraftCounts(
    draftWantsOf(open.filter((r) => r.writes?.window_open !== false && r.kind !== "callback")),
  );
  const held = open.find((r) => r.kind === "held") ?? null;
  // The window that cannot wait is another person's: a held reply's own is said on its row, a day away, and the
  // receptionist is already answering them.
  const shuts = open.find((r) => r.kind !== "held" && clockIsNear(r) && r.writes?.window_closes) ?? null;
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

/**
 * On a phone (the phone canvas, 28 Oct 2026): a row opened walks the list in a sheet. What each row came to is kept by the
 * row for the visit (row-state.ts): it goes as Today does.
 */
function usePhoneWalk() {
  const phone = useTodayOnPhone();
  const [walk, setWalk] = useState<WalkAt>(null);
  useEffect(() => () => clearRowStates(), []);
  return { phone, walk, setWalk };
}

/** The walk through the rows the card draws, on a phone: the sheet, and To do's to-dos for its end. Called, not drawn. */
function listWalk(
  order: readonly TodayQueueRowVM[],
  {
    walk,
    setWalk,
    more,
    older,
  }: {
    walk: WalkAt;
    setWalk: (at: WalkAt) => void;
    more: { count: number; to: string } | null;
    older: WalkOlder | null;
  },
  ctx: NeedYouRowsCtx,
  todo: ToDoRows,
) {
  // To do's rows are kept, let go and done by To do, so a row acted on in the sheet stays in its group and the walk goes on.
  const mine = new Set(todo.walk.rows.map((r) => r.id));
  const keep = (row: TodayQueueRowVM) => (mine.has(row.id) ? todo.walk.keep(row) : ctx.keep(row));
  const unkeep = (row: TodayQueueRowVM) => (mine.has(row.id) ? todo.walk.unkeep(row) : ctx.unkeep(row));
  return (
    <WalkSheet
      rows={order.filter(worksInPlace)}
      at={walk}
      onAt={setWalk}
      kept={new Set([...ctx.kept, ...todo.walk.kept])}
      work={{ may: ctx.may, tz: ctx.tz, flash: ctx.flash, keep, unkeep }}
      word={ctx.word}
      stepDone={todo.walk.stepDone}
      todos={todo.left}
      more={more}
      older={older}
      onToDo={() => {
        setWalk(null);
        document.querySelector('[data-testid="today-group-todo"]')?.scrollIntoView({ block: "start" });
      }}
    />
  );
}

/**
 * Where the head's door goes: the Inbox while a person waits, else, when only runs wait, the run (one), To send (every one
 * waiting waits for its owner to send its emails) or Needs you (contracts waitingRunsDoor).
 */
function listDoorOf(people: number, runs: number): { to: string; label: string } {
  const to = people === 0 && runs > 0 ? waitingRunsDoor(runsPending().waiting) : "inbox";
  return { to, label: to === "inbox" ? W.door : (verbForRoute(to) ?? W.door) };
}

/** Need you's head: its name, how many the team dealt with today, and the door. Called, not drawn. */
function needYouHead(door: { to: string; label: string }, done: number, toDo: number | null) {
  return (
    <div className="tq-head tz-head">
      <h2 className="tq-title tz-name" id="today-queue-title">
        {toDo !== null ? W.group.todo : "Need you"}
      </h2>
      {toDo !== null ? (
        <span className="tz-fact">{toDo}</span>
      ) : done > 0 ? (
        <span className="tz-fact" data-testid="today-done">
          {W.doneToday(done)}
        </span>
      ) : null}
      {sectionDoor(door.to, door.label, "today-queue-door")}
    </div>
  );
}

/** How many a group could not hold, as the press at its foot says them, and where they are; none where it held them all. */
const cutDoor = (say: (n: number) => string, cut: number, to = "inbox") => (cut > 0 ? { label: say(cut), to } : null);

/** The old rows handed back this visit, kept for the visit with what they came to: the next read has none of them. */
type OlderHanded = { rows: readonly TodayQueueRowVM[]; handed: HandedBack };

/** The groups above To do, as drawn: Up next, the five waiting, and what waits for your OK with its runs. */
type Drawn = Pick<NeedYouGroups<TodayQueueRowVM>, "next" | "waiting" | "ok">;

/** A verb that never takes the coral. */
const QUIET: VerbKind = () => "ghost";

/**
 * The groups above To do, each under its small head, in the page's order, so the coral goes to the first act drawn: Up
 * next (whose row drawn short is the focus put aside, never the coral), who waits on you, and what waits for your OK with
 * its runs. Each says how many of its rows are still open, which falls as they are worked, as the head's count does; none
 * once all are. Called, not drawn; a group with no rows is null.
 */
function groupsAbove(
  {
    groups,
    drawn,
    runs,
  }: {
    groups: NeedYouGroups<TodayQueueRowVM>;
    drawn: Drawn;
    runs: { drawn: readonly ReactElement[]; count: number; cut: number };
  },
  ctx: NeedYouRowsCtx,
) {
  const G = W.group;
  const open = (rows: readonly TodayQueueRowVM[]) => rows.filter((r) => !ctx.kept.has(r.id)).length;
  const waiting = open(groups.waiting);
  const ok = open(groups.ok) + runs.count;
  return [
    drawn.next.length ? (
      <NeedYouGroup key="next" title={G.next} count={null} testid="today-group-next">
        {needYouRows(drawn.next, { ...ctx, shortKind: QUIET })}
      </NeedYouGroup>
    ) : null,
    drawn.waiting.length ? (
      <NeedYouGroup
        key="waiting"
        title={G.waiting}
        count={waiting || null}
        more={cutDoor(W.cut.waiting, groups.waiting.length - drawn.waiting.length)}
        testid="today-group-waiting"
      >
        {needYouRows(drawn.waiting, ctx)}
      </NeedYouGroup>
    ) : null,
    drawn.ok.length || runs.drawn.length ? (
      <NeedYouGroup
        key="ok"
        title={G.ok}
        count={ok || null}
        more={cutDoor(W.cut.ok, groups.ok.length - drawn.ok.length + runs.cut)}
        testid="today-group-ok"
      >
        {[...needYouRows(drawn.ok, ctx), ...runs.drawn]}
      </NeedYouGroup>
    ) : null,
  ];
}

/** To do's group: its rows, three at most, how many there are, and the press to the rest; null with none. Called, not drawn. */
function todoGroup(todo: ToDoRows, bare: boolean) {
  return todo.drawn.length ? (
    <NeedYouGroup
      key="todo"
      title={W.group.todo}
      count={todo.count}
      bare={bare}
      more={cutDoor(W.cut.todo, todo.cut, todo.door ?? "inbox")}
      testid="today-group-todo"
    >
      {todo.drawn}
    </NeedYouGroup>
  ) : null;
}

/**
 * The threads set aside as not a customer's (decision 0093), one quiet line under the list: they wait on nobody, so nothing
 * counts them, and the line is where a wrong one is found. Heard as a draft lands.
 */
function SetAsideLine({ nav }: { nav: (to: string) => void }) {
  useDraftsMoved();
  const held = surfaceValue("reply_drafts");
  const first = held?.setAside?.[0];
  if (!first) return null;
  const words = held.drafts.find((d) => d.conversation_id === first && d.kind === "reply")?.words.pitch ?? null;
  return (
    <div className="tq-foot" data-testid="today-set-aside">
      <span>{W.setAside(held.setAside.length, words)}</span>
      <Button variant="quiet" size="sm" className="tq-open" onClick={() => nav(`inbox/th-${first}`)}>
        {W.setAsideOpen}
        <Icon name={doorGlyph()} size={11} />
      </Button>
    </div>
  );
}

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

/**
 * One coral on the page: the first act asked for takes it and every other is quiet; `taken`, once the rows are drawn, says
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

/** A verb that never takes the coral, for a row nobody counts. */
const OLDER_QUIET = { verbKind: QUIET, shortKind: QUIET };

/** Whether Need you took the coral, told to To do, the setup card and Ask found as the list draws (queue-coral.ts). */
function useCoralTold(holds: boolean) {
  useLayoutEffect(() => {
    queueHoldsCoral(holds);
  }, [holds]);
  useLayoutEffect(() => () => queueHoldsCoral(false), []);
}

/** Whether Need you draws a pane at all, told to the page as the list draws: where it draws none, Ask found leads. */
function useDrawnTold(drawn: boolean) {
  useLayoutEffect(() => {
    zoneDrawn("need-you", drawn);
  }, [drawn]);
  useLayoutEffect(() => () => zoneDrawn("need-you", false), []);
}

/** The rows of a group still open: the ones nobody acted on this visit. */
const stillOpen = (rows: readonly TodayQueueRowVM[], kept: Kept) => rows.filter((r) => !kept[r.id]);

/**
 * The walk through Older (his call D7): no part of the morning's, it starts from its own row or the morning's end, and is over as
 * the sheet closes. What the morning's end offers of it, and Mark all done's press.
 */
function useOldWalk(walkTo: (at: WalkAt) => void) {
  const [walkingOld, setWalkingOld] = useState(false);
  const [marking, setMarking] = useState(false);
  const setWalk = (at: WalkAt) => {
    if (at === null) setWalkingOld(false);
    walkTo(at);
  };
  const endOf = (rows: readonly TodayQueueRowVM[], said: (back: HandedBack) => void): WalkOlder | null =>
    rows.length
      ? {
          count: rows.length,
          busy: marking,
          go: () => {
            setWalkingOld(true);
            setWalk(rows[0]?.id ?? null);
          },
          markAll: () => {
            setMarking(true);
            void handBackAll(rows).then((back) => {
              setMarking(false);
              if (back.done) setWalk(null);
              said(back);
            });
          },
        }
      : null;
  return { walkingOld, setWalkingOld, setWalk, endOf };
}

const NeedYouList = ({ vm }: { vm: TodayVM }) => {
  // The runs (Sent's), the reviews and the people move the parts of the list; the replies to a reach-out move a row read
  // as that reply's (contracts withReplies). Today owns those reads, so this redraws and reads nothing.
  useMoved(["broadcasts", "people", "calendar", "reach_out_replies", "google", "settings"]);
  const [toastNode, ppFlash] = useToast();
  // The rows acted on this visit (a reply sent, a thread snoozed), kept in their place.
  const [kept, setKept] = useState<Kept>({});
  // The row a desk has open: Up next until the member opens another (undefined), or none where they closed it (null).
  const [opened, setOpened] = useState<string | null | undefined>(undefined);
  const [older, setOlder] = useState<OlderHanded | null>(null);
  const { phone, walk, setWalk: walkTo } = usePhoneWalk();
  const oldWalk = useOldWalk(walkTo);
  const { walkingOld, setWalkingOld, setWalk } = oldWalk;
  // The runs with an Approve or a Cancel on its way: their buttons wait for the server (S9-10).
  const acting = useRunsActing();
  const nav: Nav = (to) => appNavigate(to);
  const may = canDo("approve");
  const word = useTodayWord();
  // A handoff whose thread's reply to a reach-out was read is that reply's row (contracts withReplies, PR 8).
  const rows = withKept(TODAY_HELPERS.withReplies(vm.queue.rows), kept);
  const groups = needYouGroupsOf(rows);
  const drawn: Drawn = {
    next: groups.next,
    waiting: groups.waiting.slice(0, NEED_YOU_CAPS.waiting),
    ok: groups.ok.slice(0, NEED_YOU_CAPS.ok),
  };
  // What waits for your OK: the searches drawn, then the runs an approval can still send, three in all.
  const runs = waitRows(
    { nav, flash: ppFlash, verbKind: QUIET, acting, phone, late: false },
    Math.max(0, NEED_YOU_CAPS.ok - drawn.ok.length),
  );
  const order = [...drawn.next, ...drawn.waiting, ...drawn.ok];
  // The focus: the first row still open that opens to be worked, on a phone always; on a desk until another is opened. A
  // reply that goes on its own is one (the canvas's shift moment): drawn as its card, it leaves the first waiting row
  // short, holding the coral, and once it is stopped the next open row rises.
  const first = order.find((r) => !kept[r.id] && (opensToWork(r) || r.kind === "held"))?.id ?? null;
  const focus = phone || opened === undefined ? first : opened;
  const focusRow = order.find((r) => r.id === focus) ?? null;
  // Whether the focus's own act takes the coral: a reply that goes on its own takes none (its press is Stop).
  const focusTakes = !!focusRow && !kept[focusRow.id] && focusRow.kind !== "held";
  const coral = oneCoral();
  // Only the rows drawn are drafted (decision 0071): the five waiting, not those past them. Older's only as one is opened:
  // nobody counts them, most are let go unread, and a draft is a model's turn.
  const olderOpen = groups.old.filter((r) => r.id === walk || r.id === focus);
  useDraftsAhead(draftWantsOf([...groups.next, ...drawn.waiting, ...olderOpen]));
  const ctx: NeedYouRowsCtx = {
    nav,
    verbKind: coral.verbKind,
    shortKind: focusTakes ? QUIET : coral.verbKind,
    may,
    tz: workspaceClock()?.zone() ?? DEFAULT_TIMEZONE,
    flash: ppFlash,
    keep: (row) => setKept((was) => keptWith(was, row, rows)),
    unkeep: (row) => setKept((was) => keptWithout(was, row)),
    kept: new Set(Object.keys(kept)),
    focus,
    open: (id) => {
      if (!phone) return setOpened((was) => (was === id ? null : id));
      // A row of Older walks Older; any other walks the morning.
      setWalkingOld(groups.old.some((r) => r.id === id));
      walkTo(id);
    },
    word,
    stepDone: () => undefined,
    phone: phone ? { walk: setWalk } : null,
  };
  const door = listDoorOf(groups.next.length + groups.waiting.length, runs.count);
  const above = groupsAbove({ groups, drawn, runs }, ctx);
  // Every row above To do has asked for its act by now: whether one took the coral, which To do hears.
  const holds = coral.taken();
  const todo = useToDoRows({ cap: NEED_YOU_CAPS.todo, queueHolds: holds, open: ctx.open, focus: phone ? null : focus });
  // Older never takes the coral, and has no say in how the page is laid out: nobody counts it, and an old number in it left
  // Finish setting up quiet and Ask found under an empty day (8 Nov 2026).
  useCoralTold(holds);
  // Ask's line over the people still waiting and drawn; how many need you is the one count, which hears what was acted on
  // here.
  useTellHead(stillOpen([...groups.next, ...drawn.waiting], kept));
  useActedTold(kept);
  const olderRows = groups.old.length ? groups.old : (older?.rows ?? []);
  // Nobody waiting, only your own to-dos: the pane is To do, under "Nothing needs you", where "Need you" over them read as wrong.
  const onlyToDo = !above.some(Boolean) && todo.drawn.length > 0;
  const workDrawn = [...above, todoGroup(todo, onlyToDo)];
  const onlyOlder = !workDrawn.some(Boolean) && vm.callsRead !== false;
  const olderGroup = olderRows.length ? (
    <OlderGroup
      key="old"
      rows={olderRows}
      ctx={{ ...ctx, ...OLDER_QUIET }}
      handed={older?.handed ?? null}
      onHanded={(h) => setOlder(h ? { rows: olderRows, handed: h } : null)}
      bare={onlyOlder}
    />
  ) : null;
  useDrawnTold(!onlyOlder);
  return (
    <ListBody
      phone={phone}
      onlyOlder={onlyOlder}
      groups={[...workDrawn, olderGroup]}
      head={onlyOlder ? null : needYouHead(door, vm.done_today ?? 0, onlyToDo ? todo.count : null)}
      foot={<SetAsideLine nav={nav} />}
      callsUnread={vm.callsRead === false}
      walk={
        phone
          ? listWalk(
              // Whoever has waited past a week is no part of the morning (his call D7): their own walk starts from the Older
              // row, or from the walk's end.
              walkingOld ? groups.old : [...order, ...todo.walk.rows],
              {
                walk,
                setWalk,
                more:
                  groups.waiting.length > drawn.waiting.length
                    ? { count: groups.waiting.length - drawn.waiting.length, to: "inbox" }
                    : null,
                older: walkingOld
                  ? null
                  : oldWalk.endOf(groups.old, (back) => {
                      if (!back.done) return ppFlash({ tone: "danger", msg: <>{handedBackWords(back)}</> });
                      setOlder({ rows: groups.old, handed: back });
                      ppFlash({ tone: "ok", msg: <>{handedBackWords(back)}</> });
                    }),
              },
              ctx,
              todo,
            )
          : null
      }
      toasts={
        <>
          {todo.toast}
          {toastNode}
        </>
      }
    />
  );
};

/**
 * The list drawn, one pane under its head on a desk and a phone alike: its groups, the reads that failed and its foot.
 * Nothing to draw is no pane at all: the head has said so.
 */
function ListBody({
  phone,
  onlyOlder,
  groups,
  head,
  foot,
  callsUnread,
  walk,
  toasts,
}: {
  phone: boolean;
  /** Nothing drawn but Older: no name over it, and it stands at the page's end, past the day (zones.css). */
  onlyOlder: boolean;
  groups: ReadonlyArray<ReactElement | null>;
  head: ReactElement | null;
  foot: ReactNode;
  callsUnread: boolean;
  walk: ReactElement | null;
  toasts: ReactElement;
}) {
  if (!groups.some(Boolean) && !callsUnread) return toasts;
  return (
    <section
      className="tq today-queue tz-need"
      data-testid="today-queue"
      data-phone={phone || undefined}
      data-only-older={onlyOlder || undefined}
      aria-labelledby={onlyOlder ? undefined : "today-queue-title"}
      aria-label={onlyOlder ? W.group.old : undefined}
    >
      {head}
      <div className="tq-list ny-groups">
        {groups}
        {readsFailed(callsUnread)}
      </div>
      {foot}
      {walk}
      {toasts}
    </section>
  );
}
