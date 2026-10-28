/**
 * Inbox — composition layer + decide engine (moved from pages/inbox.jsx, decision 0015, step 3).
 * Three columns: list rail (320px) | thread pane (flex) | agent context rail (300px, the mockup's: a seeded thread only).
 * Decisions are REAL here: approve/decline/snooze move threads, append timeline
 * events, update counts (the badge is a selector, needs-you.ts, told when this page's count moves), offer undo,
 * and auto-advance to the next decision. Keyboard: A approve · D decline · E edit.
 *
 * The page is one record (`ix`) made by parts, in the order the page always made them (inbox-state.tsx, inbox-acts.tsx,
 * inbox-bulk.tsx and here): what is on screen, the keys, a bucket picked, the counts, and the page drawn. The hooks are
 * called in the order the page always called them, so every hook keeps its cell. The rules of what waits on you and where
 * a thread sits are rules.ts; holding every draft still counting down is hold-all.ts.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { EmptyState } from "../../kit/empty/empty";
import { usePartShown, useSurface } from "../../use-surface";
import { InboxAgentRail } from "./agent-rail";
import { SequenceRepliesLine, onlyThreadsOf, type SequenceRepliesRead } from "./inbox-from";
import { ixHoldAll } from "./hold-all";
import { inboxBulkActs, inboxRealBulk, type InboxRealBulk } from "./inbox-bulk";
import { inboxDecide, inboxReply, inboxThreadActs, type InboxActs } from "./inbox-acts";
import { InboxList, type Density } from "./inbox-list";
import {
  inboxMoves,
  inboxVerdict,
  IX_VIEW_FILTERS,
  useInboxAutoSend,
  useInboxState,
  useInboxVeto,
  type InboxSoFar,
} from "./inbox-state";
import { ixKeyLeft } from "../keys";
import { ixKeepPlace } from "../place";
import { ixBucketOf, ixOnPhone, ixRank } from "../rules";
import { useNeedsYouParts } from "../../needs-you";
import { threadReading, threadWhose, useSeeOpen, useSeen } from "../../seen";
import { canDo, gate, presenceAway } from "../shell";
import { inboxData } from "../store";
import { ThreadPane } from "../thread/thread-pane";
import type { InboxSurface, Thread } from "../types";
import { cancelSend } from "../verbs";
import { Button } from "../../kit/button/button";
import { useHeldList } from "../../kit/motion/held-list";
import { ixGoing } from "../thread/thread";

/** The record once the bulk bar's acts are in: what is on screen is read from it. */
type AfterBulk = InboxSoFar & InboxActs & InboxRealBulk & ReturnType<typeof inboxBulkActs>;

/** What is on screen: the bucket's rows, the thread open beside them, and whether the one a link asked for is missing. */
const inboxOnScreen = (
  { threads, listedHere, activeThreadId, keepOpenId, shownRef }: AfterBulk,
  initialThreadId: string | null,
  only: ReadonlySet<string> | null = null,
) => {
  // The bucket's rows, in the one order (ixRank): a reply about to send, then what needs you, then the threads you
  // have, then a teammate's. A thread whose own reply is on its way out stands in Needs you while it counts down. A
  // sequence's replies the address names are the rows in place of the bucket's (inbox-from.tsx).
  const visible = threads.filter((t) => (only ? only.has(t.id) : listedHere(t))).sort((a, b) => ixRank(a) - ixRank(b));
  // Scoped to the VISIBLE list: an id left over from another bucket used to
  // keep a customer (with a live Snooze button) on screen beside a list that
  // said "0 threads".
  // A thread a re-read moved out of this bucket stays on screen (keepOpenId): the pane used to fall
  // to the first thread in the list, another customer's, and a half-written reply went with it.
  const activeThread: Thread | undefined =
    visible.find((t) => t.id === activeThreadId) ||
    (keepOpenId && keepOpenId === activeThreadId ? threads.find((t) => t.id === keepOpenId) : undefined) ||
    visible[0];
  // A deep link (People → "Open thread") to a thread outside the newest
  // hundred must not open someone else's thread in silence. Loaded is the test,
  // not listed: a thread the Inbox holds in another bucket is not missing.
  const requestedMissing =
    !!initialThreadId &&
    activeThreadId === initialThreadId &&
    visible.length > 0 &&
    !threads.some((t) => t.id === initialThreadId);
  // The thread on screen, for the next re-read to compare with; none while a link's notice stands.
  shownRef.current = requestedMissing ? null : activeThread || null;
  return { visible, activeThread, requestedMissing };
};

type InboxOnScreen = ReturnType<typeof inboxOnScreen>;

/** Keyboard: J/K or the arrows walk the list; A approves the plan, D declines it, E goes to the composer. */
const useInboxKeys = ({
  threads,
  activeThreadId,
  visible,
  planParams,
  selectThread,
  decide,
}: AfterBulk & InboxOnScreen) => {
  // Keyboard: A approve recommended · D decline · E focus composer
  useEffect(
    () => {
      const onKey = (e: KeyboardEvent) => {
        if (ixKeyLeft(e)) return;
        const k = e.key.toLowerCase();
        if (k === "j" || k === "k" || e.key === "ArrowDown" || e.key === "ArrowUp") {
          if (!visible.length) return;
          e.preventDefault();
          const dir = k === "j" || e.key === "ArrowDown" ? 1 : -1;
          const idx = visible.findIndex((t) => t.id === activeThreadId);
          const next = visible[Math.min(visible.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + dir))];
          if (next) selectThread(next.id);
          return;
        }
        const t = threads.find((x) => x.id === activeThreadId);
        if (!t || !t.approval || t.state === "done") return;
        if (k === "a") {
          e.preventDefault();
          const p = t.approval.plan && t.approval.plan.param;
          const idx = planParams[t.id] || 0;
          decide(t.id, t.approval.recommended, p ? { param: p.options[idx]?.label } : {});
        } else if (k === "d") {
          e.preventDefault();
          decide(t.id, "Decline");
        } else if (k === "e") {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("inbox:focus-composer"));
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: the listener is rebound when what it walks changes, not when a handler is made again
    [threads, activeThreadId, visible, planParams],
  );
};

/** A bucket picked, and a row's box ticked. */
const inboxBucketMoves = ({
  threads,
  activeThread,
  setActiveBucket,
  setActiveView,
  setSelected,
  setKeepOpenId,
  setPhoneThreadOpen,
  setActiveThreadId,
  goTo,
}: AfterBulk & InboxOnScreen) => {
  const handleBucket = (id: string) => {
    setActiveBucket(id);
    ixKeepPlace({ bucket: id });
    setActiveView(null);
    setSelected([]);
    setKeepOpenId(null);
    // Picking a bucket is asking for its list, never for a conversation. On a phone the list and the thread take
    // turns on the screen, and a bucket that opened its first thread took the screen with it: the rows were gone,
    // a customer nobody had asked for was on the phone, and a bucket with nothing in it showed neither.
    setPhoneThreadOpen(false);
    // By the list's own rule (ixBucketOf): a reply counting down stands in Needs you whatever its state says.
    const stillVisible = activeThread && (id === "all" || ixBucketOf(activeThread) === id);
    if (!stillVisible) {
      const next = [...threads].sort((a, b) => ixRank(a) - ixRank(b)).find((t) => id === "all" || ixBucketOf(t) === id);
      // The desktop's pane beside the list shows the bucket's first thread, and the address says which, so a
      // refresh comes back to the same one. An empty bucket clears the pane: leaving the id stranded a customer --
      // with a live Snooze button -- beside a list reading "0 threads".
      setActiveThreadId(next ? next.id : null);
      goTo(next ? next.id : null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  return { handleBucket, toggleSelect };
};

type InboxBucketMoves = ReturnType<typeof inboxBucketMoves>;

/**
 * The buckets' and the views' counts, and the Needs bucket's stake. `runs` are the campaign runs waiting for your say,
 * each a row of Needs you over its threads (inbox-runs.tsx), so its chip counts them as the badge does.
 */
const inboxCounts = (
  threads: Thread[],
  {
    INBOX_BUCKETS,
    INBOX_VIEWS,
    INBOX_BASELINE,
  }: Pick<InboxSurface, "INBOX_BUCKETS" | "INBOX_VIEWS" | "INBOX_BASELINE">,
  runs: number,
) => {
  // Live bucket counts (done keeps its archive baseline of 48 resolved this week)
  // The Needs you chip counts what needs you, the badge's number (needsCount): it counted every flagged thread, yours
  // and a teammate's too, and a thread you have just answered stays flagged for the whole pause (I2). A reply about
  // to send counts here and sits in this bucket, by that same rule, and leaves Handled while it counts down.
  const bucketsWithCounts = INBOX_BUCKETS.map((b) => ({
    ...b,
    // One rule, so the chip cannot say a number the list does not hold: `ixBucketOf`. It used to ask
    // `ixWaitsOnYou` for Needs you and the bucket for the rest, which is exactly how the two came apart.
    count:
      threads.filter((t) => ixBucketOf(t) === b.id).length +
      (b.id === "done" ? (INBOX_BASELINE?.doneThisWeek ?? 48) : 0) +
      (b.id === "escalated" ? runs : 0),
  }));
  const viewsWithCounts = INBOX_VIEWS.map((v) => ({
    ...v,
    count: IX_VIEW_FILTERS[v.id] ? threads.filter(IX_VIEW_FILTERS[v.id]).length : v.count,
  }));

  // Needs-bucket stake summary
  const needsThreads = threads.filter((t) => t.state === "needs");
  const stake = {
    count: needsThreads.length,
    dollars: needsThreads.reduce((a, t) => a + (t.value || 0), 0),
    oldest: needsThreads.reduce((a, t) => Math.max(a, t.waitingMin || 0), 0),
  };
  return { bucketsWithCounts, viewsWithCounts, stake };
};

type InboxCounts = ReturnType<typeof inboxCounts>;

/** The whole record: what the page is drawn from. */
type InboxRecord = AfterBulk & InboxOnScreen & InboxBucketMoves & InboxCounts;

/** What the page's caller sets: how much a row draws, whether the mockup's rail is, and where a person's name goes. */
interface InboxProps {
  density?: Density;
  showAgentRail?: boolean;
  onOpenClient?: (clientId: string | null | undefined) => void;
  initialThreadId?: string | null;
  /** The thread the link names is being read by its id (use-named-record.ts): say it is on its way, never that it is not here. */
  opening?: boolean;
  /** A sequence's replies the address names (inbox-from.tsx): the list holds them and nothing else, with its line. */
  replies?: SequenceRepliesRead | null;
  /** `inbox/to-send`: Needs you, with its To send open (the Campaigns wiring review's lane 4). */
  toSendOpen?: boolean;
}

/** A link to a thread outside the loaded list, while it is read by its id: say it is on its way, and open nobody else's in its place. */
function openingThread() {
  return (
    <EmptyState
      kind="page"
      glyph="inbox"
      title="Opening this conversation…"
      body="It shows here as soon as it has been read."
      testid="inbox-opening-thread"
    />
  );
}

/** A link to a thread outside the loaded list: say so in the pane, and open nobody else's conversation in its place. */
function missingThread({ setActiveThreadId, setPhoneThreadOpen }: InboxRecord) {
  return (
    <EmptyState
      kind="page"
      glyph="inbox"
      title="That conversation isn't among the newest shown here"
      body="The Inbox loads the newest threads first. Open the person in People to find this one — no other conversation opens in its place."
      action={{ label: "Open People", to: "clients" }}
      also={{
        label: "Show the Inbox",
        onClick: () => {
          setActiveThreadId(null);
          setPhoneThreadOpen(false);
        },
      }}
      testid="inbox-missing-thread"
    />
  );
}

/**
 * The one thread (thread-pane.tsx): a real thread's verbs are the pane's own, the same in Conversations. A
 * seeded thread is the mockup's, and keeps this page's handlers.
 */
function threadPane(ix: InboxRecord, onOpenClient: NonNullable<InboxProps["onOpenClient"]>) {
  const {
    activeThread,
    closeThread,
    ppFlash,
    stale,
    reconcile,
    setStale,
    decide,
    verdictDecide,
    vetoRemaining,
    vetoAct,
    snooze,
    sendReply,
    takeOver,
    wake,
    handBack,
    markUnread,
    archiveThread,
    planParams,
    setPlanParams,
  } = ix;
  return (
    <ThreadPane
      key={activeThread?.id}
      thread={activeThread}
      onBack={closeThread}
      onOpenClient={onOpenClient}
      // Nobody open: "Inbox zero" under Needs you alone; any other bucket's list says its own empty in its words.
      nothingOpen={ix.activeBucket === "escalated" && !ix.activeView ? "zero" : "quiet"}
      flash={ppFlash}
      mock={{
        stale: stale && activeThread && stale.threadId === activeThread.id ? stale : null,
        onReconcile: reconcile,
        onDismissStale: () => setStale(null),
        onDecide: decide,
        onVerdict: verdictDecide,
        veto: activeThread ? vetoRemaining(activeThread.id) : null,
        vetoPaused: presenceAway(),
        onVetoAct: vetoAct,
        onSnooze: snooze,
        onSend: sendReply,
        onTakeOver: takeOver,
        onWake: wake,
        onHandBack: handBack,
        onMarkUnread: markUnread,
        onArchive: archiveThread,
        planParam: activeThread ? planParams[activeThread.id] || 0 : 0,
        onPlanParam: (i: number) => activeThread && setPlanParams((m) => ({ ...m, [activeThread.id]: i })),
      }}
    />
  );
}

/** Two or more drafts about to send: the one act that spans them, Hold all. Nothing while fewer are counting down. */
function sendingStrip(ix: InboxRecord) {
  const { threads, vetoRemaining, VW, setVetoTick, ppFlash } = ix;
  const vetoLive = threads.filter((t) => t.veto && vetoRemaining(t.id) != null);
  if (vetoLive.length < 2) return null;

  // The same withdraw the single Hold makes, per draft (ixHoldAll): the
  // countdowns stop at once, and a draft the server refused is named.
  const holdAll = async () => {
    if (!canDo("approve")) return;
    const pending = ixHoldAll(vetoLive, { state: VW.state, cancelSend });
    setVetoTick((n) => n + 1);
    const r = await pending;
    setVetoTick((n) => n + 1);
    ppFlash(
      r.refused.length
        ? {
            tone: "danger",
            msg: (
              <>
                <b>
                  {r.held} of {vetoLive.length} drafts
                </b>{" "}
                held — {r.refused.map((x) => x.who).join(", ")} may already have gone out
              </>
            ),
          }
        : {
            msg: (
              <>
                <b>{r.held} drafts</b> held — nothing sends until you act
              </>
            ),
          },
    );
  };
  return (
    <div className="ix-sending-strip">
      <span className="ix-veto-dot"></span>
      {/* Which threads they are, and how long each has, is on their own rows now, at the top of Needs you: this
                strip is here for the one act that spans them. It said the soonest seconds and offered a Review that
                opened the row above it. */}
      {presenceAway() ? (
        <span>
          <b>{vetoLive.length} drafts</b> paused — you're away
        </span>
      ) : (
        <span>
          <b>{vetoLive.length} drafts</b> about to send
        </span>
      )}
      <Button size="sm" onClick={holdAll} {...gate("approve")}>
        Hold all
      </Button>
    </div>
  );
}

/** The page drawn: the list, the thread (or the missing link's notice), the agent rail, the sending strip, the toasts. */
const inboxPage = (
  ix: InboxRecord,
  {
    density,
    showAgentRail,
    onOpenClient,
    opening,
    replies,
    toSendOpen,
    root,
  }: {
    root: RefObject<HTMLDivElement | null>;
    density: Density;
    showAgentRail: boolean;
    onOpenClient: NonNullable<InboxProps["onOpenClient"]>;
    opening: boolean;
    replies: SequenceRepliesRead | null;
    toSendOpen: boolean;
  },
) => {
  const {
    threads,
    visible,
    bucketsWithCounts,
    viewsWithCounts,
    activeView,
    setActiveView,
    setSelected,
    activeBucket,
    handleBucket,
    activeThread,
    selectThread,
    selected,
    toggleSelect,
    bulkApproveSafe,
    bulkSnooze,
    bulkArchive,
    bulkMark,
    bulkBusy,
    stake,
    vetoRemaining,
    requestedMissing,
    phoneThreadOpen,
    toastNode,
    ppFlash,
  } = ix;
  // The agent rail is the mockup's, drawn for a seeded thread only. On a real one it invented the
  // receptionist -- an autonomy line and a voice nobody set, an Ask box answering with canned text, a
  // menu to a page this release hides (D11; the wiring audit's A3 and A17) -- and with no thread to show
  // it kept an empty column.
  const railThread = showAgentRail && !requestedMissing && activeThread && !activeThread.real ? activeThread : null;

  return (
    <div ref={root} className={`inbox ${railThread ? "with-rail" : ""}`} data-takeover={phoneThreadOpen || undefined}>
      <InboxList
        threads={visible}
        allThreads={threads}
        buckets={bucketsWithCounts}
        views={viewsWithCounts}
        activeView={activeView}
        onViewChange={(id) => {
          setActiveView((v) => (v === id ? null : id));
          setSelected([]);
        }}
        activeBucket={activeBucket}
        onBucketChange={handleBucket}
        activeThreadId={activeThread?.id}
        onSelectThread={selectThread}
        selected={selected}
        onToggleSelect={toggleSelect}
        onClearSelection={() => setSelected([])}
        onBulkApprove={bulkApproveSafe}
        onBulkSnooze={bulkSnooze}
        onBulkArchive={bulkArchive}
        bulkMark={bulkMark}
        bulkBusy={bulkBusy}
        stake={stake}
        density={density}
        sendingIn={vetoRemaining}
        fromLine={replies ? <SequenceRepliesLine read={replies} held={threads} /> : null}
        toSendOpen={toSendOpen}
        flash={ppFlash}
      />
      {ixOnPhone() && !phoneThreadOpen
        ? // On a phone the list and the thread take turns on the screen (mobile.css hides the pane until the page wears
          // data-takeover), and the pane was mounted all the same, keyed by the first thread: every bucket pressed that
          // changed the first thread drew that whole thread again behind the list, 44 call cards in a workspace of one
          // person's 44 calls, and the phone froze (8 Oct 2026). Nothing is drawn there until a tap opens a thread.
          null
        : requestedMissing
          ? // A link to a thread outside the loaded list: it is read by its id (opening), and said to be on its way; one the
            // server will not give is said missing in the pane. Nobody else's conversation opens in its place.
            opening
            ? openingThread()
            : missingThread(ix)
          : // The one thread (thread-pane.tsx): a real thread's verbs are the pane's own, the same in Conversations. A
            // seeded thread is the mockup's, and keeps this page's handlers.
            threadPane(ix, onOpenClient)}
      {railThread && <InboxAgentRail thread={railThread} />}

      {sendingStrip(ix)}

      {toastNode}
    </div>
  );
};

export const Inbox = ({
  density = "medium",
  showAgentRail = true,
  onOpenClient = () => {},
  initialThreadId = null,
  opening = false,
  replies = null,
  toSendOpen = false,
}: InboxProps) => {
  // The page draws again when the Inbox surface moves, as the frame drew it again; its list is the page's first part
  // (client/page-speed.ts), drawn once the Inbox's read is in, the empty Inbox included.
  const inboxRead = useSurface("inbox");
  usePartShown("inbox", "list", inboxRead !== undefined);
  // The pane is drawn only where it is on the screen (inboxPage, ixOnPhone): a phone turned sideways crosses the
  // breakpoint, and the pane it had no need of is drawn then.
  const [, setViewport] = useState(0);
  useEffect(() => {
    const phone = window.matchMedia ? window.matchMedia("(max-width: 720px)") : null;
    if (!phone || !phone.addEventListener) return undefined;
    const bump = () => setViewport((n) => n + 1);
    phone.addEventListener("change", bump);
    return () => phone.removeEventListener("change", bump);
  }, []);
  const { INBOX_BUCKETS, INBOX_VIEWS, THREADS, INBOX_BASELINE } = inboxData();
  // One record of the page, made in the order the page always made it: each part reads what the parts above it made.
  const ix = useInboxState(THREADS, initialThreadId, toSendOpen);
  // The page's own element, where its list is found as a thread opens over it (useHeldList, below).
  const root = useRef<HTMLDivElement | null>(null);
  const withMoves = Object.assign(ix, inboxMoves(ix));
  const withVerdict = Object.assign(withMoves, inboxVerdict(withMoves));
  const withVeto = Object.assign(withVerdict, useInboxVeto(withVerdict));
  useInboxAutoSend(withVeto);
  const withDecide = Object.assign(withVeto, inboxDecide(withVeto));
  const withThreadActs = Object.assign(withDecide, inboxThreadActs(withDecide));
  const withReply = Object.assign(withThreadActs, inboxReply(withThreadActs));
  const withRealBulk = Object.assign(withReply, inboxRealBulk(withReply));
  const withBulkActs = Object.assign(withRealBulk, inboxBulkActs(withRealBulk));
  const withScreen = Object.assign(withBulkActs, inboxOnScreen(withBulkActs, initialThreadId, onlyThreadsOf(replies)));
  useInboxKeys(withScreen);
  // The thread on screen is read (surfaces/seen.ts): beside the list on a desk, and on a phone while it is the screen.
  // A link's notice is nobody's thread. And a row opened or put back, here or in Conversations, draws the list again.
  const open =
    withScreen.activeThread && withScreen.activeThread.real && !withScreen.requestedMissing
      ? withScreen.activeThread
      : null;
  const reading = open && (!ixOnPhone() || withScreen.phoneThreadOpen) ? open : null;
  useSeeOpen(reading ? threadWhose(reading) : null, reading ? threadReading(reading) : undefined);
  useSeen();
  // Each thread opened, timed from the press that opened it: a move inside the page.
  usePartShown("inbox", "thread", !!open, open ? open.id : null);
  const withBucketMoves = Object.assign(withScreen, inboxBucketMoves(withScreen));
  const runs = useNeedsYouParts()?.runs ?? 0;
  const full = Object.assign(
    withBucketMoves,
    inboxCounts(withBucketMoves.threads, { INBOX_BUCKETS, INBOX_VIEWS, INBOX_BASELINE }, runs),
  );
  // On a phone the list stays where it was under an open thread, and is put back there as the thread goes, by any Back;
  // the thread is pushed in over it as it opens. A phone's alone, as Conversations' and Live's are: `phoneThreadOpen` is
  // set on a desk too, where held it took the list off the screen and drew the thread in its column.
  useHeldList(
    full.phoneThreadOpen && ixOnPhone(),
    () => root.current?.querySelector<HTMLElement>(":scope > .ix-list") ?? null,
    {
      page: () => root.current?.querySelector<HTMLElement>(":scope > .ix-thread-pane") ?? null,
      going: ixGoing,
    },
  );
  return inboxPage(full, { density, showAgentRail, onOpenClient, opening, replies, toSendOpen, root });
};
