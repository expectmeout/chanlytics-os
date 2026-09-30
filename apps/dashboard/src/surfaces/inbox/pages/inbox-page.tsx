/**
 * Inbox — composition layer + decide engine (moved from pages/inbox.jsx, decision 0015, step 3).
 * Three columns: list rail (320px) | thread pane (flex) | agent context rail (300px, the mockup's: a seeded thread only).
 * Decisions are REAL here: approve/decline/snooze move threads, append timeline
 * events, update counts (sidebar badge syncs via "inbox:counts"), offer undo,
 * and auto-advance to the next decision. Keyboard: A approve · D decline · E edit.
 *
 * The page is one record (`ix`) made by parts, in the order the page always made them (inbox-state.tsx, inbox-acts.tsx,
 * inbox-bulk.tsx and here): what is on screen, the keys, a bucket picked, the counts, and the page drawn. The hooks are
 * called in the order the page always called them, so every hook keeps its cell. The rules of what waits on you and where
 * a thread sits are rules.ts; holding every draft still counting down is hold-all.ts.
 */
import { useEffect } from "react";
import { EmptyState } from "../../kit/empty/empty";
import { useSurface } from "../../use-surface";
import { InboxAgentRail } from "./agent-rail";
import { ixHoldAll } from "./hold-all";
import { inboxBulkActs, inboxRealBulk, type InboxRealBulk } from "./inbox-bulk";
import { inboxDecide, inboxReply, inboxThreadActs, type InboxActs } from "./inbox-acts";
import { InboxList, type Density } from "./inbox-list";
import {
  inboxMoves,
  inboxVerdict,
  ixKeyLeft,
  IX_VIEW_FILTERS,
  useInboxAutoSend,
  useInboxState,
  useInboxVeto,
  type InboxSoFar,
} from "./inbox-state";
import { ixKeepPlace } from "../place";
import { ixBucketOf, ixRank } from "../rules";
import { canDo, gate, presenceAway } from "../shell";
import { inboxData } from "../store";
import { ThreadPane } from "../thread/thread-pane";
import type { InboxSurface, Thread } from "../types";
import { cancelSend } from "../verbs";

/** The record once the bulk bar's acts are in: what is on screen is read from it. */
type AfterBulk = InboxSoFar & InboxActs & InboxRealBulk & ReturnType<typeof inboxBulkActs>;

/** What is on screen: the bucket's rows, the thread open beside them, and whether the one a link asked for is missing. */
const inboxOnScreen = (
  { threads, listedHere, activeThreadId, keepOpenId, shownRef }: AfterBulk,
  initialThreadId: string | null,
) => {
  // The bucket's rows, in the one order (ixRank): a reply about to send, then what needs you, then the threads you
  // have, then a teammate's. A thread whose own reply is on its way out stands in Needs you while it counts down.
  const visible = threads.filter(listedHere).sort((a, b) => ixRank(a) - ixRank(b));
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

/** The buckets' and the views' counts, and the Needs bucket's stake. */
const inboxCounts = (
  threads: Thread[],
  {
    INBOX_BUCKETS,
    INBOX_VIEWS,
    INBOX_BASELINE,
  }: Pick<InboxSurface, "INBOX_BUCKETS" | "INBOX_VIEWS" | "INBOX_BASELINE">,
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
      (b.id === "done" ? (INBOX_BASELINE?.doneThisWeek ?? 48) : 0),
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
      <button className="btn btn-sm" onClick={holdAll} {...gate("approve")}>
        Hold all
      </button>
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
  }: { density: Density; showAgentRail: boolean; onOpenClient: NonNullable<InboxProps["onOpenClient"]> },
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
    bulkBusy,
    stake,
    vetoRemaining,
    requestedMissing,
    phoneThreadOpen,
    toastNode,
  } = ix;
  // The agent rail is the mockup's, drawn for a seeded thread only. On a real one it invented the
  // receptionist -- an autonomy line and a voice nobody set, an Ask box answering with canned text, a
  // menu to a page this release hides (D11; the wiring audit's A3 and A17) -- and with no thread to show
  // it kept an empty column.
  const railThread = showAgentRail && !requestedMissing && activeThread && !activeThread.real ? activeThread : null;

  return (
    <div className={`inbox ${railThread ? "with-rail" : ""} ${phoneThreadOpen ? "phone-thread" : ""}`}>
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
        bulkBusy={bulkBusy}
        stake={stake}
        density={density}
        sendingIn={vetoRemaining}
      />
      {requestedMissing
        ? // A link to a thread outside the loaded list: say so in the pane, and
          // open nobody else's conversation in its place.
          missingThread(ix)
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
}: InboxProps) => {
  // The page draws again when the Inbox surface moves, as the frame drew it again.
  useSurface("inbox");
  const { INBOX_BUCKETS, INBOX_VIEWS, THREADS, INBOX_BASELINE } = inboxData();
  // One record of the page, made in the order the page always made it: each part reads what the parts above it made.
  const ix = useInboxState(THREADS, initialThreadId);
  const withMoves = Object.assign(ix, inboxMoves(ix));
  const withVerdict = Object.assign(withMoves, inboxVerdict(withMoves));
  const withVeto = Object.assign(withVerdict, useInboxVeto(withVerdict));
  useInboxAutoSend(withVeto);
  const withDecide = Object.assign(withVeto, inboxDecide(withVeto));
  const withThreadActs = Object.assign(withDecide, inboxThreadActs(withDecide));
  const withReply = Object.assign(withThreadActs, inboxReply(withThreadActs));
  const withRealBulk = Object.assign(withReply, inboxRealBulk(withReply));
  const withBulkActs = Object.assign(withRealBulk, inboxBulkActs(withRealBulk));
  const withScreen = Object.assign(withBulkActs, inboxOnScreen(withBulkActs, initialThreadId));
  useInboxKeys(withScreen);
  const withBucketMoves = Object.assign(withScreen, inboxBucketMoves(withScreen));
  const full = Object.assign(
    withBucketMoves,
    inboxCounts(withBucketMoves.threads, { INBOX_BUCKETS, INBOX_VIEWS, INBOX_BASELINE }),
  );
  return inboxPage(full, { density, showAgentRail, onOpenClient });
};
