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
 * (ixPlace) is place.ts, and a row, with the words of confidence, is list-rows.tsx.
 */
import { useEffect, useState, type KeyboardEvent } from "react";
import { Confirm } from "../../kit/confirm/confirm";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { ixKeepPlace, ixPlace } from "../place";
import { threadRow } from "./list-rows";
import { askOnScreenKey, demoSession, gate, setAskOnScreen, surfaceState } from "../shell";
import { inboxData } from "../store";
import type { InboxBucket, InboxView, Thread } from "../types";
import { Button } from "../../kit/button/button";

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
  /** The bulk act running on real threads, "snooze" or "archive", for the bar to say so. */
  bulkBusy?: string | null;
  stake?: Stake | null;
  density?: Density;
  /** Seconds until a thread's own reply goes out, or null: the row says them where its time would be. */
  sendingIn?: (id: string) => number | null;
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
  bulkBusy = null,
  stake = null,
  density = "medium",
  sendingIn = () => null,
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
    bulkBusy,
    stake,
    density,
    sendingIn,
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

/** Whether an event's target is an `<input>`: judged by its tag, as the row's key handler always judged it. */
const inInput = (e: KeyboardEvent<HTMLDivElement>): boolean =>
  !!e.target && "tagName" in e.target && e.target.tagName === "INPUT";

/**
 * The rows are a listbox with one tab stop: the open thread's row, or the first when none of these is
 * open. Arrows, J/K, Home and End open and focus the row on screen -- the page's own J/K walks its
 * bucket, not the rows a search shows. Enter opens; Space picks the row for a bulk act.
 */
function rowKeys(p: {
  visible: Thread[];
  onSelectThread: (id: string) => void;
  onToggleSelect: (id: string) => void;
}): (e: KeyboardEvent<HTMLDivElement>, i: number) => void {
  const { visible, onSelectThread, onToggleSelect } = p;
  return (e, i) => {
    if (e.metaKey || e.ctrlKey || e.altKey || inInput(e)) return;
    const t = visible[i];
    if (e.key === "Enter") {
      e.preventDefault();
      onSelectThread(t.id);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      onToggleSelect(t.id);
      return;
    }
    const to =
      e.key === "ArrowDown" || e.key === "j"
        ? i + 1
        : e.key === "ArrowUp" || e.key === "k"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? visible.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    const next = visible[Math.max(0, Math.min(visible.length - 1, to))];
    if (!next || next.id === t.id) return;
    onSelectThread(next.id);
    const row =
      e.currentTarget.parentNode &&
      e.currentTarget.parentNode.querySelector<HTMLElement>(`[data-thread-id="${next.id}"]`);
    if (row) row.focus();
  };
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

/** The archive question, as the bar asks it: about the one thread picked, or about how many. */
function archiveWords(p: { selected: string[]; allThreads: Thread[] }): {
  pickedOne: { who?: string } | null;
  pickedReal: boolean;
  archiveQuestion: string;
} {
  const { selected, allThreads } = p;
  // The server has no unarchive: a real pick asks first, where the demo's Undo is the mockup's.
  const pickedReal = allThreads.some((t) => t.real && selected.includes(t.id));
  const pickedOne: { who?: string } | null =
    selected.length === 1 ? allThreads.find((t) => t.id === selected[0]) || {} : null;
  const archiveQuestion = pickedOne
    ? `Archive ${pickedOne.who ? `${pickedOne.who}'s` : "this"} conversation?`
    : `Archive ${selected.length} conversations?`;
  return { pickedOne, pickedReal, archiveQuestion };
}

export function InboxList(props: InboxListProps) {
  const base = listProps(props);
  const { threads, allThreads, activeView, activeBucket, activeThreadId, selected, onSelectThread, onToggleSelect } =
    base;
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

  // The agent name is only worth a row if the threads differ on it. This was
  // computed INSIDE the row map — one Set built per rendered row, so 100
  // threads meant 100 allocations and ~10,000 steps on every keystroke of the
  // search box and every realtime reseed. It is constant for the whole list.
  const multipleAgents = new Set(threads.map((x) => x.agent && x.agent.name)).size > 1;
  const inNeedsBucket = activeBucket === "needs";
  // The list's head is a line of its own only when it says what the chips and the rows don't: what a search found,
  // what a saved view holds, or what is picked. It said the chip's number again, "3 need you · 1 being answered"
  // under Needs you 3 and over rows whose pills say whose, and once "3 threads" under a chip counting 1 (I2).
  const searching = !!query.trim();
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
  const onRowKey = rowKeys({ visible, onSelectThread, onToggleSelect });
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
      {bucketChips(L)}
      {searchBox(L)}
      {viewChips(L)}
      {stakeLine(L)}
      {listHead(L)}
      {archiveAsk(L)}
      {/* Threads */}
      <div className="ix-threads">
        {unreadEscalated()}
        {visible.length === 0 && emptyThreads(L)}
        {visible.length > 0 && (
          <div className="ix-thread-rows" role="listbox" aria-label="Conversations" aria-multiselectable="true">
            {visible.map((t, i) => threadRow(L, t, i))}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- the parts --------------------------------- */

/**
 * Buckets. A real workspace has three, and they sit in one row of words: as a grid of two they took two rows
 * with the third alone on the second, and on a phone "Needs you" wrapped to two lines.
 */
function bucketChips(L: ListCtx) {
  const { buckets, activeBucket, onBucketChange } = L;
  return (
    <div className={`ix-buckets ${buckets.length <= 3 ? "one-row" : ""}`}>
      {buckets.map((b) => (
        <button
          key={b.id}
          className={`ix-bucket ${activeBucket === b.id ? "active" : ""} ${b.accent ? "accent" : ""}`}
          onClick={() => onBucketChange(b.id)}
          aria-pressed={activeBucket === b.id}
          title={b.hint}
        >
          <Icon name={b.icon} size={13} />
          <span className="ix-bucket-label">{b.label}</span>
          <span className="ix-bucket-count tabular">{b.count}</span>
        </button>
      ))}
    </div>
  );
}

/** The select-all box, over the rows' own boxes: the list's head lost a 38px line of its own to it. */
function selectAll(L: ListCtx) {
  const { visible, selected, onToggleSelect, onClearSelection } = L;
  const allSelected = visible.length > 0 && visible.every((t) => selected.includes(t.id));
  return (
    <label className="ix-checkall" title={allSelected ? "Clear the selection" : `Select all ${visible.length}`}>
      <input
        type="checkbox"
        checked={allSelected}
        aria-label={
          allSelected
            ? "Clear the selection"
            : `Select all ${visible.length} conversation${visible.length === 1 ? "" : "s"}`
        }
        onChange={() => {
          if (allSelected) onClearSelection();
          else visible.forEach((t) => !selected.includes(t.id) && onToggleSelect(t.id));
        }}
      />
    </label>
  );
}

/**
 * Search + saved-views toggle row. The select-all box leads it, over the rows' own boxes: it sat on the list's
 * head, a 38px line of its own beside a count the chip already said.
 */
function searchBox(L: ListCtx) {
  const { visible, allThreads, query, setQuery, views, showViews, setShowViews } = L;
  return (
    <div className="ix-search-row">
      {visible.length > 0 && selectAll(L)}
      <div className="ix-search-wrap">
        <Icon name="search" size={12} />
        <input
          className="ix-search-input"
          placeholder={allThreads.some((t) => t.real) ? "Search by name or message…" : "Search threads, clients, tags…"}
          aria-label="Search conversations"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="ix-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
            <Icon name="x" size={11} />
          </button>
        )}
      </div>
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

/** What is picked: the count, and the acts over it. */
function bulkBar(L: ListCtx) {
  const { selected, threads, onBulkApprove, onBulkSnooze, onClearSelection, bulkBusy } = L;
  const pressArchive = () => (archiveWords(L).pickedReal ? L.setAskArchive(true) : L.onBulkArchive());
  return (
    <div className="ix-bulk">
      <span className="ix-bulk-count tabular">{selected.length} selected</span>
      <div className="ix-bulk-actions">
        {threads.some((t) => t.approval) && (
          <Button
            variant="primary"
            size="sm"
            onClick={onBulkApprove}
            title="Approves selected approvals with ≥80% confidence"
            {...gate("approve")}
          >
            Approve all safe
          </Button>
        )}
        <Button
          variant="quiet"
          size="sm"
          onClick={onBulkSnooze}
          aria-busy={bulkBusy === "snooze" || undefined}
          {...gate("approve")}
        >
          {bulkBusy === "snooze" ? "Snoozing…" : "Snooze"}
        </Button>
        <Button
          variant="quiet"
          size="sm"
          onClick={pressArchive}
          aria-busy={bulkBusy === "archive" || undefined}
          {...gate("approve")}
        >
          {bulkBusy === "archive" ? "Archiving…" : "Archive"}
        </Button>
        <Button variant="quiet" size="sm" onClick={onClearSelection}>
          Clear
        </Button>
      </div>
    </div>
  );
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
  const { pickedOne, archiveQuestion } = archiveWords(L);
  return (
    selected.length > 0 &&
    askArchive && (
      <Confirm
        block
        question={archiveQuestion}
        detail={
          pickedOne
            ? "It leaves the Inbox and their request is closed. If they write again, it comes back."
            : "They leave the Inbox and each request is closed. If they write again, they come back."
        }
        yes={pickedOne ? "Yes, archive" : `Yes, archive ${selected.length}`}
        no="Not now"
        busy={bulkBusy === "archive"}
        busyLabel="Archiving…"
        onYes={() => Promise.resolve(onBulkArchive()).finally(() => setAskArchive(false))}
        onNo={() => setAskArchive(false)}
        testid="ix-bulk-archive"
      />
    )
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

/** The words of each empty bucket: a real workspace's, or the mockup's. */
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
