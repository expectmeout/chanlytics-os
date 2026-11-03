/**
 * Need you (Today in three zones, 2 Nov 2026, over decisions 0071 and 0076): one list of everything that waits on you, in
 * groups, each row in the kit's one grammar (AttnRow) with what Ask prepared for it. Up next first, the one thing to do now
 * (contracts need-you-groups.ts); who else waits on you, five drawn, a reply that never reached them first; what waits for
 * your OK, three drawn (a search's question, and the runs an approval can still send, the very rows the Inbox's Needs you
 * draws, surfaces/waits/wait-rows.tsx; a run too late to approve is the sweep's to skip); your own to-dos, three drawn
 * and never counted (to-do.tsx); and whoever has waited past a week, one row at the end with Mark all done, never
 * counted. What is past the caps is said at the foot with the door to the Inbox. How many need you is every row above To
 * do still open, the one count (needs-you.ts), told what was acted on here so it falls as the rows are worked; how many
 * the team dealt with today stands by the door.
 *
 * One row is the focus and draws its work in place: on a phone the card, the first row still open, whose words open the
 * sheet that walks the list; on a desk the one opened, Up next until another is. Its act is the page's one coral; where it
 * takes none (a reply that goes on its own, whose press is Stop), the first row waiting takes it, and where nothing above
 * To do took it, To do's first act. Every other row is drawn short, its verb at its right with Ask's mark where Ask
 * prepared it, and opens itself. On a desk Need you is one pane under its name; on a phone each group is a pane of its
 * own under its name, and the page's head says what the pane's would.
 */
import { useEffect, useLayoutEffect, useState, type ReactElement } from "react";
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
import { AttnRow } from "../../kit/attention/attn-row";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { needsYouActed } from "../../needs-you";
import { surfaceValue } from "../../surface-values";
import { usePartShown } from "../../use-surface";
import { broadcastsRead, runsPending, useRunsActing } from "../../waits/run-acts";
import { waitRows, type Nav, type VerbKind } from "../../waits/wait-rows";
import { TODAY_HELPERS } from "../helpers";
import { useDraftCounts, wantDrafts, type DraftWant } from "../need-you/drafts";
import { NeedYouGroup, handBackAll, handedBackWords, type HandedBack } from "../need-you/groups";
import { tellHeadSay } from "../need-you/head-say";
import { Done } from "../need-you/parts";
import { needYouRows, type NeedYouRowsCtx } from "../need-you/people-rows";
import { draftWantOf, opensToWork, worksInPlace } from "../need-you/rows";
import { clearRowStates } from "../need-you/row-state";
import { WalkSheet, type WalkAt } from "../need-you/walk-sheet";
import { useTodayOnPhone } from "../phone";
import { keptWith, keptWithout, withKept, type Kept } from "./kept";
import { useToDoRows, type ToDoRows } from "./to-do";
import { queueHoldsCoral, zoneDrawn } from "../queue-coral";
import {
  appNavigate,
  canDo,
  doorGlyph,
  gate,
  surfaceFailed,
  useMoved,
  useToast,
  workspaceClock,
  type Flash,
} from "../shell";
import { useTodayWord } from "./day-vm";

/** The list, once Today has been read: the page is READY when it is drawn (client/page-speed.ts). */
export const NeedYou = () => {
  useMoved("today");
  const vm = surfaceValue("today");
  usePartShown("today", "queue", !!vm);
  return vm ? <NeedYouList vm={vm} /> : null;
};

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
 * What the head says after how many need you: what Ask prepared for the rows still open, then the one thing that cannot
 * wait, a reply that goes on its own or the first window to shut within two hours. Told as the rows draw; the head says
 * nothing of it once the list goes.
 */
function useTellHead(open: readonly TodayQueueRowVM[], may: boolean) {
  // A reply outside WhatsApp's window goes only as a template: Ask's words for it are not said as ready (the 10/10 read,
  // 2 Nov 2026: "Ask drafted a reply" over a card whose one press was Choose a template).
  const counts = useDraftCounts(draftWantsOf(open.filter((r) => r.writes?.window_open !== false)), may);
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
  { walk, setWalk }: { walk: WalkAt; setWalk: (at: WalkAt) => void },
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

/** Need you's head on a desk: its name, how many the team dealt with today, and the door. Called, not drawn. */
function needYouHead(door: { to: string; label: string }, done: number, nav: Nav) {
  return (
    <div className="tq-head">
      <h2 className="tq-title" id="today-queue-title">
        Need you
      </h2>
      <span className="tq-end">
        {done > 0 ? (
          <span className="tq-done" data-testid="today-done">
            {W.doneToday(done)}
          </span>
        ) : null}
        <Button
          variant="quiet"
          size="sm"
          className="tq-open"
          onClick={() => nav(door.to)}
          data-testid="today-queue-door"
        >
          {door.label}
          <Icon name={doorGlyph()} size={11} />
        </Button>
      </span>
    </div>
  );
}

/** The old rows handed back this visit, kept for the visit with what they came to: the next read has none of them. */
type OlderHanded = { rows: readonly TodayQueueRowVM[]; handed: HandedBack };

/** A second press's hand-back joined to the first's: what went in all, what the second refused, one Undo for both. */
function handedBoth(first: HandedBack, then: HandedBack): HandedBack {
  const undos = [first.undo, then.undo].filter((u): u is () => Promise<void> => !!u);
  return {
    done: first.done + then.done,
    refused: then.refused,
    undo: undos.length
      ? async () => {
          for (const u of undos) await u();
        }
      : null,
  };
}

/**
 * Whoever has waited past a week, one row at the end (the canvas of 2 Nov 2026): how many, and who, with Mark all done,
 * which hands each back to the receptionist, says what it came to in place and keeps one Undo for all of them. Only for a
 * member who acts, and only where a row has a thread to hand back; never counted.
 */
function OlderRow({
  rows,
  handed,
  onHanded,
  kind,
  flash,
}: {
  rows: readonly TodayQueueRowVM[];
  handed: HandedBack | null;
  onHanded: (h: HandedBack | null) => void;
  kind: "primary" | "ghost";
  flash: (f: Flash) => void;
}) {
  const [busy, setBusy] = useState(false);
  const may = rows.some((r) => !!r.conversationId) && canDo("approve");
  // Refused whole, it says why and the press stays to try again; refused in part, it says what went and offers the press
  // again for the rest, whose Undo joins the first's.
  const markAll = async () => {
    setBusy(true);
    const h = await handBackAll(rows);
    setBusy(false);
    if (!h.done) return flash({ tone: "danger", msg: <>{handedBackWords(h)}</> });
    onHanded(handed ? handedBoth(handed, h) : h);
  };
  const undoAll = handed?.undo;
  const undo = undoAll
    ? async () => {
        setBusy(true);
        await undoAll();
        setBusy(false);
        onHanded(null);
      }
    : null;
  return (
    <AttnRow
      glyph="clock"
      initials=""
      name={W.older.row(rows.length)}
      via={{ glyph: "clock", words: W.group.old }}
      sentence={rows.map((r) => r.who).join(", ")}
      tone=""
      testid="queue-older"
      ctaTestid="today-old-done"
      cta={
        may && (!handed || handed.refused > 0)
          ? { label: W.oldDone.act, kind, busy, onClick: () => void markAll(), gate: gate("approve", "mark them done") }
          : null
      }
      work={
        handed ? (
          <Done
            words={handedBackWords(handed)}
            act={undo ? { label: "Undo", onPress: () => void undo(), busy } : null}
          />
        ) : null
      }
    />
  );
}

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
  groups: NeedYouGroups<TodayQueueRowVM>,
  drawn: Drawn,
  runs: { drawn: readonly ReactElement[]; count: number },
  ctx: NeedYouRowsCtx,
) {
  const G = W.group;
  const pane = !!ctx.phone;
  const open = (rows: readonly TodayQueueRowVM[]) => rows.filter((r) => !ctx.kept.has(r.id)).length;
  const waiting = open(groups.waiting);
  const ok = open(groups.ok) + runs.count;
  return [
    drawn.next.length ? (
      <NeedYouGroup key="next" title={G.next} count={null} pane={pane} testid="today-group-next">
        {needYouRows(drawn.next, { ...ctx, shortKind: QUIET })}
      </NeedYouGroup>
    ) : null,
    drawn.waiting.length ? (
      <NeedYouGroup key="waiting" title={G.waiting} count={waiting || null} pane={pane} testid="today-group-waiting">
        {needYouRows(drawn.waiting, ctx)}
      </NeedYouGroup>
    ) : null,
    drawn.ok.length || runs.drawn.length ? (
      <NeedYouGroup key="ok" title={G.ok} count={ok || null} pane={pane} testid="today-group-ok">
        {[...needYouRows(drawn.ok, ctx), ...runs.drawn]}
      </NeedYouGroup>
    ) : null,
  ];
}

/** To do's group: its rows, three at most, and how many there are; null with none. Called, not drawn. */
function todoGroup(todo: ToDoRows, pane: boolean) {
  return todo.drawn.length ? (
    <NeedYouGroup key="todo" title={W.group.todo} count={todo.count} pane={pane} testid="today-group-todo">
      {todo.drawn}
    </NeedYouGroup>
  ) : null;
}

/**
 * What the list could not hold, said with the door to it: the people past the five, what waits for your OK past its three,
 * the to-dos past theirs. See all opens the Inbox, or, where only to-dos were left out, where they are (To do's `door`).
 * Nothing where nothing was cut.
 */
function listFoot(cut: { waiting: number; ok: number; todo: number }, todoDoor: string | null, nav: Nav) {
  const parts = [
    cut.waiting > 0 ? W.cut.waiting(cut.waiting) : "",
    cut.ok > 0 ? W.cut.ok(cut.ok) : "",
    cut.todo > 0 ? W.cut.todo(cut.todo) : "",
  ].filter(Boolean);
  if (!parts.length) return null;
  const to = cut.waiting > 0 || cut.ok > 0 ? "inbox" : (todoDoor ?? "inbox");
  return (
    <div className="tq-foot" data-testid="today-queue-foot">
      <span>{parts.join(" · ")}</span>
      <Button variant="quiet" size="sm" className="tq-open" onClick={() => nav(to)}>
        {W.seeAll}
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
  const { phone, walk, setWalk } = usePhoneWalk();
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
  // Only the rows drawn are drafted (decision 0071): the five waiting, not those past them. Older's rows on a phone, whose
  // walk steps into them; a desk draws Older as one row of names.
  useDraftsAhead(draftWantsOf([...groups.next, ...drawn.waiting, ...(phone ? groups.old : [])]), may);
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
    open: (id) => (phone ? setWalk(id) : setOpened((was) => (was === id ? null : id))),
    word,
    stepDone: () => undefined,
    phone: phone ? { walk: setWalk } : null,
  };
  const above = groupsAbove(groups, drawn, runs, ctx);
  // Every row above To do has asked for its act by now: whether one took the coral, which To do hears.
  const holds = coral.taken();
  const todo = useToDoRows({ cap: NEED_YOU_CAPS.todo, queueHolds: holds });
  // Older's Mark all done takes the coral where nothing above it did, and only while it is drawn to be pressed: told with
  // the list's own, so the setup card and Ask found go quiet beside it (one coral on the page).
  const olderRows = groups.old.length ? groups.old : (older?.rows ?? []);
  const olderActs = olderRows.some((r) => !!r.conversationId) && may && (!older?.handed || older.handed.refused > 0);
  const olderCoral = olderActs && !holds && !todo.drawn.length;
  useCoralTold(holds || olderCoral);
  // Ask's line over the people still waiting and drawn; how many need you is the one count, which hears what was acted on
  // here.
  useTellHead(stillOpen([...groups.next, ...drawn.waiting], kept), may);
  useActedTold(kept);
  const olderGroup = olderRows.length ? (
    <NeedYouGroup key="old" title={W.group.old} count={null} pane={phone} testid="today-group-old">
      <OlderRow
        rows={olderRows}
        handed={older?.handed ?? null}
        onHanded={(h) => setOlder(h ? { rows: olderRows, handed: h } : null)}
        kind={olderCoral ? "primary" : "ghost"}
        flash={ppFlash}
      />
    </NeedYouGroup>
  ) : null;
  const groupsDrawn = [...above, todoGroup(todo, phone), olderGroup];
  useDrawnTold(groupsDrawn.some(Boolean) || vm.callsRead === false);
  return (
    <ListBody
      phone={phone}
      groups={groupsDrawn}
      head={needYouHead(listDoorOf(groups.next.length + groups.waiting.length, runs.count), vm.done_today ?? 0, nav)}
      foot={listFoot(
        {
          waiting: groups.waiting.length - drawn.waiting.length,
          ok: groups.ok.length - drawn.ok.length + runs.cut,
          todo: todo.cut,
        },
        todo.door,
        nav,
      )}
      callsUnread={vm.callsRead === false}
      walk={phone ? listWalk([...order, ...todo.walk.rows, ...groups.old], { walk, setWalk }, ctx, todo) : null}
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
 * The list drawn: on a desk one pane under its head, its groups, the reads that failed and its foot; on a phone the groups
 * as panes of their own and the foot under them. Nothing to draw is no pane at all: the head has said so.
 */
function ListBody({
  phone,
  groups,
  head,
  foot,
  callsUnread,
  walk,
  toasts,
}: {
  phone: boolean;
  groups: ReadonlyArray<ReactElement | null>;
  head: ReactElement;
  foot: ReactElement | null;
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
      aria-labelledby={phone ? undefined : "today-queue-title"}
      aria-label={phone ? "Need you" : undefined}
    >
      {phone ? null : head}
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
