/**
 * Inbox List Rail — perfectionist refinement (moved from pages/inbox-list.jsx, decision 0015, step 3).
 * Improvements:
 *   - Search input at the top
 *   - P1 threads sort to top within each bucket
 *   - P1 gets a left edge stripe (bigger affordance than just the avatar ring)
 *   - Drop "NEEDS YOU" pill in the needs bucket (it's redundant)
 *   - Saved views are collapsed by default behind a single chip-row toggle
 *   - Bulk actions stay; checkbox visible on hover only
 *   - The rows are a listbox: Tab reaches the open one, arrows and J/K open the row on screen,
 *     Enter opens, Space picks it for a bulk act
 *
 * The person who has a thread a teammate is answering (ixAnswerer) is answerer.ts, where the member was in the list
 * (ixPlace) is place.ts, a row, with the words of confidence, is list-rows.tsx, and the pick -- the boxes, the bar
 * of acts over it, its keys -- is pick.tsx, which Conversations draws too.
 */
import { useCallback, useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { Search } from "../../kit/search/search";
import { useRowsArrive } from "../../kit/motion/use-rows-arrive";
import { useSwapMotion } from "../../kit/motion/use-swap-motion";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { ixKeepPlace, ixPlace } from "../place";
import { useNeedsYouParts } from "../../needs-you";
import type { Flash } from "../../shell-doors";
import { InboxRunsWaiting } from "./inbox-runs";
import { threadRows, useShownThreads } from "./list-rows";
import { pickAll, pickArchiveAsk, pickBar, pickKeys } from "./pick";
import { askOnScreenKey, demoSession, setAskOnScreen, surfaceState } from "../shell";
import { inboxData } from "../store";
import type { InboxBucket, InboxView, Thread } from "../types";

/** How much of a row the desk draws: the phone ignores it. */
export type Density = "compact" | "medium" | "rich";

/** What a bucket's chips over the rows say about the Needs you bucket: how many decisions, the dollars, the oldest wait. */
interface Stake {
  count: number;
  dollars: number;
  oldest: number;
}

interface InboxListProps {
  threads: Thread[];
  allThreads?: Thread[];
  buckets: InboxBucket[];
  views: InboxView[];
  activeView?: string | null;
  onViewChange?: (id: string) => void;
  activeBucket: string;
  onBucketChange: (id: string) => void;
  activeThreadId: string | undefined;
  onSelectThread: (id: string) => void;
  selected: string[];
  onToggleSelect: (id: string) => void;
  onClearSelection: () => void;
  onBulkApprove?: () => void;
  onBulkSnooze?: () => unknown;
  onBulkArchive?: () => unknown;
  /** The reader's mark over what is picked, as the page worked it out: which way, and its press. None, none offered. */
  bulkMark?: { seen: boolean; press: () => void } | null;
  /** The bulk act running on real threads, "snooze" or "archive", for the bar to say so. */
  bulkBusy?: string | null;
  stake?: Stake | null;
  density?: Density;
  /** Seconds until a thread's own reply goes out, or null: the row says them where its time would be. */
  sendingIn?: (id: string) => number | null;
  /** A sequence's replies the address names (inbox-from.tsx): their line above the rows, which says what is not here. */
  fromLine?: ReactNode;
  /** Needs you's To send open under its row (`inbox/to-send`, inbox-runs.tsx). */
  toSendOpen?: boolean;
  /** The page's toast: what an Approve on a run's row says, with its Stop (inbox-runs.tsx). */
  flash?: (flash: Flash) => void;
}

/** The props with what the caller left out filled in: what the destructuring's defaults did in the JSX. */
function listProps({
  threads,
  allThreads = [],
  buckets,
  views,
  activeView = null,
  onViewChange = () => {},
  activeBucket,
  onBucketChange,
  activeThreadId,
  onSelectThread,
  selected,
  onToggleSelect,
  onClearSelection,
  onBulkApprove = () => {},
  onBulkSnooze = () => {},
  onBulkArchive = () => {},
  bulkMark = null,
  bulkBusy = null,
  stake = null,
  density = "medium",
  sendingIn = () => null,
  fromLine = null,
  toSendOpen = false,
  flash = () => undefined,
}: InboxListProps) {
  return {
    threads,
    allThreads,
    buckets,
    views,
    activeView,
    onViewChange,
    activeBucket,
    onBucketChange,
    activeThreadId,
    onSelectThread,
    selected,
    onToggleSelect,
    onClearSelection,
    onBulkApprove,
    onBulkSnooze,
    onBulkArchive,
    bulkMark,
    bulkBusy,
    stake,
    density,
    sendingIn,
    fromLine,
    toSendOpen,
    flash,
  };
}

/** What the list's parts share: the props, the words in the search, and what the rows show. */
export interface ListCtx extends ReturnType<typeof listProps> {
  query: string;
  setQuery: (v: string) => void;
  showViews: boolean;
  setShowViews: (v: boolean) => void;
  askArchive: boolean;
  setAskArchive: (v: boolean) => void;
  visible: Thread[];
  searching: boolean;
  multipleAgents: boolean;
  inNeedsBucket: boolean;
  tabStopId: string | undefined;
  onRowKey: (e: KeyboardEvent<HTMLDivElement>, i: number) => void;
}

/**
 * The rows the list draws. A non-empty search spans ALL threads (so results surface across buckets); otherwise the
 * parent already scoped `threads` to bucket/view. Then P1 → P2 → P3 within bucket.
 */
function visibleRows(p: { query: string; allThreads: Thread[]; threads: Thread[] }): Thread[] {
  const { query, allThreads, threads } = p;
  let visible = query.trim() ? allThreads : threads;
  if (query.trim()) {
    const q = query.toLowerCase();
    visible = visible.filter(
      (t) =>
        t.who.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.preview.toLowerCase().includes(q) ||
        // What they asked, which a row where a person is needed shows in place of the last message.
        (t.ask && t.ask.text ? t.ask.text.toLowerCase().includes(q) : false) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }

  // Priority-sort: P1 → P2 → P3 within bucket
  const priorityRank = { P1: 0, P2: 1, P3: 2 };
  return [...visible].sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9));
}

/** The threads picked, in the order they were picked. */
const pickedThreads = (L: Pick<ListCtx, "selected" | "allThreads">): Thread[] =>
  L.selected.flatMap((id) => L.allThreads.find((t) => t.id === id) ?? []);

export function InboxList(props: InboxListProps) {
  const base = listProps(props);
  const { threads, allThreads, activeView, activeBucket, activeThreadId, selected, onSelectThread, onToggleSelect } =
    base;
  // The rows swap in with a rise as the bucket changes (kit/motion).
  const swap = useSwapMotion(activeBucket);
  // The words in the search come back after a refresh or a trip to another page, in this tab (the Inbox's place).
  const [query, setQueryNow] = useState(() => {
    const p = ixPlace();
    return typeof p.q === "string" ? p.q : "";
  });
  const setQuery = (v: string) => {
    setQueryNow(v);
    ixKeepPlace({ q: v });
  };
  const [showViews, setShowViews] = useState(false);
  // Archiving real threads cannot be undone, so the bar asks first; a cleared selection drops the question.
  const [askArchive, setAskArchive] = useState(false);
  useEffect(() => {
    if (!selected.length) setAskArchive(false);
  }, [selected.length]);

  // Filter: a non-empty search spans ALL threads (so results surface across
  // buckets); otherwise the parent already scoped `threads` to bucket/view.
  const visible = visibleRows({ query, allThreads, threads });
  const shown = useShownThreads(visible, activeThreadId ?? null, base.density);
  // The first rows rise in as the list arrives, as People's do (kit/motion/use-rows-arrive.ts); the rows the window
  // draws after, as the list is scrolled, come as they are. One ref on the rows' element gives it to the kit and to the
  // window.
  const arrive = useRowsArrive<HTMLDivElement>(":scope > .ix-thread");
  const { listRef } = shown;
  const rowsRef = useCallback(
    (el: HTMLDivElement | null) => {
      arrive(el);
      listRef(el);
    },
    [arrive, listRef],
  );

  // The agent name is only worth a row if the threads differ on it. This was
  // computed INSIDE the row map — one Set built per rendered row, so 100
  // threads meant 100 allocations and ~10,000 steps on every keystroke of the
  // search box and every realtime reseed. It is constant for the whole list.
  const multipleAgents = new Set(threads.map((x) => x.agent && x.agent.name)).size > 1;
  const inNeedsBucket = activeBucket === "needs";
  // The badge's runs, which the list's threads do not hold: rows of Needs you over its threads (inbox-runs.tsx).
  const runsWaiting = useNeedsYouParts()?.runs ?? 0;
  // The list's head is a line of its own only when it says what the chips and the rows don't: what a search found,
  // what a saved view holds, or what is picked. It said the chip's number again, "3 need you · 1 being answered"
  // under Needs you 3 and over rows whose pills say whose, and once "3 threads" under a chip counting 1 (I2).
  const searching = !!query.trim();
  // A search finds threads: the runs stand aside while one is typed, and Needs you with a run in it is not empty.
  const runRows = activeBucket === "escalated" && !searching && !activeView;
  // What Ask is told is on screen (legacy-bridge/ask/context.ts): the rows this list draws, in its order, forty at most,
  // and what chose them -- a search, a saved view or the bucket. The list is the one place that knows its order.
  const askRows = visible.slice(0, 40);
  // No deps array, as the JSX drew it: what Ask is told follows every draw.
  useEffect(() => {
    setAskOnScreen({
      key: "inbox",
      ids: askRows.map((t) => String(t.id).replace(/^th-/, "")),
      labels: askRows.map((t) => t.who || ""),
      view: searching ? "search" : activeView || activeBucket || null,
    });
    // Taken back when the list goes: its rows are no longer on screen.
    return () => {
      if (askOnScreenKey() === "inbox") setAskOnScreen(null);
    };
  });

  const tabStopId = visible.some((t) => t.id === activeThreadId) ? activeThreadId : visible[0]?.id;
  // One tab stop, on the open row; arrows and J/K open the row on screen -- the page's own J/K walks its bucket, not
  // the rows a search shows. Enter opens; Space picks the row for a bulk act (pick.tsx).
  const onRowKey = pickKeys({
    rows: visible,
    onOpen: onSelectThread,
    onToggle: onToggleSelect,
    attr: "data-thread-id",
  });
  const L: ListCtx = {
    ...base,
    query,
    setQuery,
    showViews,
    setShowViews,
    askArchive,
    setAskArchive,
    visible,
    searching,
    multipleAgents,
    inNeedsBucket,
    tabStopId,
    onRowKey,
  };

  return (
    <div className={`ix-list ${L.density} ${selected.length > 0 ? "picking" : ""}`}>
      {bucketTabs(L)}
      {searchBox(L)}
      {viewChips(L)}
      {stakeLine(L)}
      {listHead(L)}
      {archiveAsk(L)}
      {/* Threads */}
      <div className="ix-threads" ref={swap}>
        {L.fromLine}
        {!L.fromLine && runRows && <InboxRunsWaiting flash={L.flash} />}
        {!L.fromLine && unreadEscalated()}
        {visible.length === 0 && !L.fromLine && !(runRows && runsWaiting > 0) && emptyThreads(L)}
        {visible.length > 0 && (
          <div
            ref={rowsRef}
            className="ix-thread-rows"
            role="listbox"
            aria-label="Conversations"
            aria-multiselectable="true"
          >
            {threadRows(L, shown)}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- the parts --------------------------------- */

/**
 * Buckets, the kit's sub-tabs. A real workspace has three, and they sit in one line of words, with no glyph: the glyph
 * said again what the label says, and a grid of two took two rows with the third alone on the second. Six seeded
 * buckets keep theirs. The canvases count a bucket only where there is something to count ("Snoozed" stands alone,
 * I1), and on a phone only the bucket that needs you says its figure.
 */
function bucketTabs(L: ListCtx) {
  const { buckets, activeBucket, onBucketChange } = L;
  return (
    <SubTabs
      label="Conversations by status"
      className="ix-buckets"
      quietCounts
      value={activeBucket}
      onSelect={onBucketChange}
      tabs={buckets.map((b) => ({
        id: b.id,
        label: b.label,
        hint: b.hint,
        tone: b.accent ? ("warn" as const) : undefined,
        glyph: buckets.length > 3 ? <Icon name={b.icon} size={13} /> : undefined,
        count: (b.count ?? 0) > 0 ? b.count : undefined,
      }))}
    />
  );
}

/**
 * Search + saved-views toggle row. The select-all box leads it, over the rows' own boxes: it sat on the list's
 * head, a 38px line of its own beside a count the chip already said. The search is the kit's, People's capsule: the
 * field, a press on it the first word's place.
 */
function searchBox(L: ListCtx) {
  const { visible, allThreads, query, setQuery, views, showViews, setShowViews } = L;
  return (
    <div className="ix-search-row">
      {visible.length > 0 &&
        pickAll({
          ids: visible.map((t) => t.id),
          selected: L.selected,
          onToggle: L.onToggleSelect,
          onClear: L.onClearSelection,
        })}
      <Search
        className="ix-lookup"
        label={allThreads.some((t) => t.real) ? "Search by name or message" : "Search threads, clients, tags"}
        value={query}
        onChange={setQuery}
        testid="inbox-search"
      />
      {views.some((v) => v.count > 0) && (
        <button
          className={`ix-views-toggle ${showViews ? "open" : ""}`}
          onClick={() => setShowViews(!showViews)}
          title="Saved views"
          aria-label="Saved views"
          aria-expanded={showViews}
        >
          <Icon name="filter" size={12} />
        </button>
      )}
    </div>
  );
}

function viewChips(L: ListCtx) {
  const { showViews, views, activeView, onViewChange } = L;
  return (
    showViews && (
      <div className="ix-views">
        <div className="ix-views-row">
          {views.map((v) => (
            <button
              key={v.id}
              className={`ix-view-chip ${activeView === v.id ? "active" : ""}`}
              onClick={() => onViewChange(v.id)}
            >
              <Icon name={v.icon} size={11} />
              <span>{v.label}</span>
              <span className="tabular ix-view-count">{v.count}</span>
            </button>
          ))}
        </div>
      </div>
    )
  );
}

/** Needs-bucket stake summary */
function stakeLine(L: ListCtx) {
  const { inNeedsBucket, query, activeView, stake } = L;
  return (
    inNeedsBucket &&
    !query.trim() &&
    !activeView &&
    stake &&
    stake.count > 0 && (
      <div className="ix-stake">
        <span className="ix-stake-main">
          <b>{stake.count}</b> decision{stake.count === 1 ? "" : "s"} · <b>${stake.dollars.toLocaleString()}</b> at
          stake
        </span>
        {stake.oldest > 0 && (
          <span className={`ix-stake-oldest ${stake.oldest > 30 ? "warn" : ""}`}>oldest {stake.oldest}m</span>
        )}
      </div>
    )
  );
}

/**
 * What is picked: the count, and the acts over it (pick.tsx). The server has no unarchive, so a real pick is asked
 * first, where the demo's Undo is the mockup's.
 */
function bulkBar(L: ListCtx) {
  const { selected, threads, onBulkApprove, onBulkSnooze, bulkMark, onClearSelection, bulkBusy } = L;
  return pickBar({
    count: selected.length,
    busy: bulkBusy,
    approve: threads.some((t) => t.approval) ? onBulkApprove : null,
    mark: bulkMark,
    snooze: onBulkSnooze,
    archive: () => (pickedThreads(L).some((t) => t.real) ? L.setAskArchive(true) : L.onBulkArchive()),
    clear: onClearSelection,
  });
}

/** What a search found: how many, and the words. */
function searchSaid(L: ListCtx) {
  const { visible, searching, query } = L;
  return (
    <span className="ix-list-said">
      <span className="ix-list-count tabular">
        {visible.length}{" "}
        {searching
          ? visible.length === 1
            ? "match"
            : "matches"
          : visible.length === 1
            ? "thread in view"
            : "threads in view"}
      </span>
      {searching && <span className="ix-search-hint">in "{query}"</span>}
    </span>
  );
}

/** The list's head: what is picked, what a search found, or what a saved view holds -- never the chip's count again. */
function listHead(L: ListCtx) {
  const headed = L.selected.length > 0 || L.searching || !!L.activeView;
  return headed && <div className="ix-list-head">{L.selected.length > 0 ? bulkBar(L) : searchSaid(L)}</div>;
}

function archiveAsk(L: ListCtx) {
  const { selected, askArchive, setAskArchive, bulkBusy, onBulkArchive } = L;
  return (
    selected.length > 0 &&
    askArchive &&
    pickArchiveAsk({
      // A pick the list no longer holds is still asked about, by its count.
      picked: selected.map((id) => L.allThreads.find((t) => t.id === id) ?? {}),
      busy: bulkBusy,
      onYes: () => Promise.resolve(onBulkArchive()).finally(() => setAskArchive(false)),
      onNo: () => setAskArchive(false),
    })
  );
}

/**
 * Escalated threads outside the newest page are fetched one by one;
 * one that failed is a waiting customer nobody can see, so the list
 * says so instead of listing fewer.
 */
function unreadEscalated() {
  const n = inboxData().UNREAD_ESCALATED || 0;
  return n > 0 ? (
    <FailedRead
      kind="line"
      title={`Couldn't read ${n} escalated conversation${n === 1 ? "" : "s"}`}
      body="Someone may be waiting in them."
      surface="inbox"
      testid="inbox-unread-escalated"
    />
  ) : null;
}

/** What an empty bucket, or an empty saved view, says. */
interface EmptyWords {
  icon: string;
  title: string;
  body: string;
  cta?: { label: string; to: string };
}

/**
 * The words of each empty bucket: a real workspace's, or the mockup's. Needs you with a campaign run waiting is not empty:
 * the run is its row (inbox-runs.tsx), and nothing says "Nobody's waiting" over it.
 */
function emptyWords(isReal: boolean): Record<string, EmptyWords> {
  return {
    done: isReal
      ? {
          icon: "check",
          title: "No conversations yet",
          body: "Messages to your WhatsApp number show up here once they arrive.",
          cta: { label: "Open Conversations", to: "conversations" },
        }
      : {
          icon: "check",
          title: "48 resolved this week",
          body: "Handled threads archive after 7 days — every transcript stays in Conversations.",
          cta: { label: "Open Conversations", to: "conversations" },
        },
    snoozed: isReal
      ? {
          icon: "clock",
          title: "Nothing snoozed",
          body: "Snooze hides a thread from your queue. The receptionist keeps answering it.",
        }
      : {
          icon: "clock",
          title: "7 snoozed, all sleeping",
          body: "They come back when they wake. Next: Elena's win-back, tomorrow 10:00.",
        },
    needs: {
      icon: "check",
      title: "Nothing needs you",
      body: "Threads the receptionist pauses for a human land here first.",
    },
    watching: { icon: "eye", title: "Nothing in flight", body: "Threads your agents are actively working show here." },
    drafts: { icon: "edit", title: "No drafts waiting", body: "Agent-written replies queue here for your review." },
    escalated: isReal
      ? {
          icon: "check",
          title: "Nobody's waiting on you",
          body: "The receptionist is answering on its own. Anything it can't handle lands here.",
        }
      : { icon: "flag", title: "No escalations", body: "Sensitive threads that need a human land here." },
  };
}

function emptyThreads(L: ListCtx) {
  const { threads, activeView, activeBucket, query, setQuery } = L;
  // "Is this a real workspace?" must come from the surface
  // classification, not from the array being inspected: an EMPTY
  // thread list made `threads.some(t => t.real)` false, so precisely
  // when the empty state showed, it showed the mockup's copy — an
  // empty Snoozed bucket reading "7 snoozed… Elena's win-back".
  const surface = surfaceState("inbox");
  const isReal = surface !== undefined ? surface === "real" && !demoSession() : threads.some((t) => t.real);
  const meta: EmptyWords = emptyWords(isReal)[activeView ? "view" : activeBucket] || {
    icon: "filter",
    title: "Nothing in this view",
    body: "No threads match this saved view right now.",
  };
  return (
    <EmptyState
      kind="card"
      className="ix-empty-mini"
      glyph={query ? "search" : meta.icon || "check"}
      tone={query ? null : "ok"}
      title={query ? `No matches for "${query}"` : meta.title || "All clear"}
      body={
        query
          ? "Try a different term — search spans every bucket."
          : meta.body || "The receptionist surfaces anything that needs you."
      }
      action={
        query
          ? { label: "Clear search", onClick: () => setQuery("") }
          : meta.cta
            ? { label: meta.cta.label, to: meta.cta.to }
            : null
      }
    />
  );
}
