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
 * (ixPlace) is place.ts, a row, with the words of confidence, is list-rows.tsx, the pick -- the boxes, the bar
 * of acts over it, its keys -- is pick.tsx, which Conversations draws too, and what an empty list says is list-empty.tsx.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { BAR_LINE_WORDS, NEEDS_YOU_LIST_END, type TodayQueueRowVM } from "@chanlytics/contracts";
import { ListFind, foldedLookup } from "../../kit/head/list-find";
import { UnderRow } from "../../kit/head/under-row";
import { Icon } from "../../kit/icon/icon";
import { Search } from "../../kit/search/search";
import { useRowsArrive } from "../../kit/motion/use-rows-arrive";
import { useSwapMotion } from "../../kit/motion/use-swap-motion";
import type { ShownRows } from "../../kit/rows/shown-rows";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { ixKeepPlace, ixPlace } from "../place";
import { ixSays } from "../says";
import { useNeedsYouParts } from "../../needs-you";
import { usePageSearch } from "../../kit/head/page-search";
import type { Flash } from "../../shell-doors";
import { doorRow } from "../../today/need-you/sheet/row-words";
import { InboxRunsWaiting } from "./inbox-runs";
import { threadRows, useShownThreads } from "./list-rows";
import { pickAll, pickArchiveAsk, pickBar, pickKeys } from "./pick";
import { appNavigate, askOnScreenKey, setAskOnScreen } from "../shell";
import { emptyThreads, unreadEscalated } from "./list-empty";
import { asideFold, olderFold } from "./list-folds";
import type { InboxBucket, InboxView, Thread } from "../types";

/** How much of a row the desk draws: the phone ignores it. */
export type Density = "compact" | "medium" | "rich";

/**
 * What Needs you draws beside its conversations, by the one count's rows (needs-you-list.ts ixNeedsYouOf): whoever has waited past
 * a week, folded at its foot (their conversations, and the rows of those it does not hold); the counted rows that are no
 * conversation here; and what a conversation it holds by the count alone asks of you.
 */
interface NeedsYouDrawn {
  older: Thread[];
  olderRows: readonly TodayQueueRowVM[];
  /** The counted people it holds no conversation of, over its conversations. */
  rows: readonly TodayQueueRowVM[];
  /** What waits for an OK and is no conversation, under them with the runs (inbox-runs.tsx). */
  approve: readonly TodayQueueRowVM[];
  why: (t: Thread) => string | null;
  /** The one count's row of a folded conversation: what one person past a week is drawn from (list-folds.tsx). */
  rowOf: (t: Thread) => TodayQueueRowVM | null;
}

/** No rows, and no conversations: what a list draws beside its own where the one count has given it none. */
const NONE_COUNTED: readonly TodayQueueRowVM[] = [];
const NO_THREADS: Thread[] = [];

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
  /** Needs you's line that opens the comments on the business's posts, while any has AI's answer ready (comment/list.tsx). */
  commentsDoor?: ReactNode;
  /** Needs you's To send open under its row (`inbox/to-send`, inbox-runs.tsx). */
  toSendOpen?: boolean;
  /** The page's toast: what an Approve on a run's row says, with its Stop (inbox-runs.tsx). */
  flash?: (flash: Flash) => void;
  /** What Needs you draws beside its conversations, where Today has been read (NeedsYouDrawn). */
  needsYou?: NeedsYouDrawn | null;
  /** What a reading set aside as not a customer's, folded at Handled's head (needs-you-list.ts ixSetAside). */
  aside?: Thread[];
  /** A thread, a request or a comment takes the phone's screen over the list, which is held under it (inbox-page.tsx). */
  away?: boolean;
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
  commentsDoor = null,
  toSendOpen = false,
  flash = () => undefined,
  needsYou = null,
  aside = NO_THREADS,
}: InboxListProps) {
  return {
    needsYou,
    aside,
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
    commentsDoor,
    toSendOpen,
    flash,
  };
}

/** What the list's parts share: the props, the words in the search, and what the rows show. */
export interface ListCtx extends ReturnType<typeof listProps> {
  query: string;
  setQuery: (v: string) => void;
  /** The search is the bar's line (a desk's): the row draws no box of its own. */
  inLine: boolean;
  /** The phone's search field, which the buckets' glyph puts the caret in while it rests folded. */
  findRef: RefObject<HTMLInputElement | null>;
  showViews: boolean;
  setShowViews: (v: boolean) => void;
  askArchive: boolean;
  setAskArchive: (v: boolean) => void;
  /** Whether Needs you's fold of whoever has waited past a week is open, and its press. */
  olderOpen: boolean;
  setOlderOpen: (v: boolean) => void;
  /** Whether Handled's fold of what was set aside is open, and its press. */
  asideOpen: boolean;
  setAsideOpen: (v: boolean) => void;
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
  // Who, why, the last thing said, what they asked, the tags, and "from an ad" (rules.ts ixSays).
  if (query.trim()) visible = visible.filter((t) => ixSays(t, query));

  // Priority-sort: P1 → P2 → P3 within bucket
  const priorityRank = { P1: 0, P2: 1, P3: 2 };
  return [...visible].sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9));
}

/**
 * Whether the list opens on its buckets, with no row over them: on a desk, where the search is the bar's line (page heads,
 * H2), while nothing is picked and no saved view has anything in it, so neither the select-all nor the views' toggle shows.
 */
const bareOf = (list: Pick<ListCtx, "inLine" | "views" | "selected">): boolean =>
  list.inLine && list.selected.length === 0 && !list.views.some((v) => v.count > 0);

/** The threads picked, in the order they were picked. */
const pickedThreads = (list: Pick<ListCtx, "selected" | "allThreads">): Thread[] =>
  list.selected.flatMap((id) => list.allThreads.find((t) => t.id === id) ?? []);

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
  // On a desk the search is the bar's line (page-search.ts), and the list opens on its buckets; a phone keeps its box.
  const inLine = usePageSearch({
    label: BAR_LINE_WORDS.inbox,
    value: query,
    onValue: setQuery,
    testid: "inbox-search",
  });
  const [showViews, setShowViews] = useState(false);
  const findRef = useRef<HTMLInputElement | null>(null);
  // Archiving real threads cannot be undone, so the bar asks first; a cleared selection drops the question.
  const [askArchive, setAskArchive] = useState(false);
  useEffect(() => {
    if (!selected.length) setAskArchive(false);
  }, [selected.length]);

  // Filter: a non-empty search spans ALL threads (so results surface across
  // buckets); otherwise the parent already scoped `threads` to bucket/view.
  const visible = visibleRows({ query, allThreads, threads });
  const shown = useShownThreads(visible, activeThreadId ?? null, base.density);
  const drawnAs = { openId: activeThreadId ?? null, density: base.density };
  const fold = useListFold(base.needsYou?.older, { ...drawnAs, key: "inbox-older" });
  // Open while the conversation on screen is one of its own: a link to one set aside opens on it, under its fold.
  const asideFolded = useListFold(base.aside, { ...drawnAs, key: "inbox-aside", holdsOpen: true });
  // At a desk the first rows fade in as the list arrives, as People's do; on a phone they stand whole on the first frame
  // (kit/motion/use-rows-arrive.ts). The rows the window draws after, as the list is scrolled, come as they are. One ref
  // on the rows' element gives it to the kit and to the window.
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
  // What Ask is told is on screen (bridge/ask/context.ts): the rows this list draws, in its order, forty at most,
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
  const list: ListCtx = {
    ...base,
    query,
    setQuery,
    inLine,
    findRef,
    showViews,
    setShowViews,
    askArchive,
    setAskArchive,
    olderOpen: fold.open,
    setOlderOpen: fold.setOpen,
    asideOpen: asideFolded.open,
    setAsideOpen: asideFolded.setOpen,
    visible,
    searching,
    multipleAgents,
    inNeedsBucket,
    tabStopId,
    onRowKey,
  };

  return (
    <div
      className={`ix-list ${list.density} ${selected.length > 0 ? "picking" : ""}`}
      data-bare={bareOf(list) ? "" : undefined}
    >
      {/* On a phone the buckets and the search stand in the frame's top, still as the rows scroll under them (under-row.tsx). */}
      <UnderRow className={selected.length > 0 ? "ix-under picking" : "ix-under"} away={!!props.away || inLine}>
        {bucketTabs(list)}
        {searchBox(list)}
      </UnderRow>
      {viewChips(list)}
      {stakeLine(list)}
      {listHead(list)}
      {archiveAsk(list)}
      {/* Threads */}
      <div className="ix-threads" ref={swap}>
        {threadsBody(list, { shown, olderShown: fold.shown, asideShown: asideFolded.shown, rowsRef, runsWaiting })}
      </div>
    </div>
  );
}

/**
 * A fold of the list: whether it is open, and its conversations' rows, a list of their own drawn only while it is open.
 * Whoever has waited past a week stands folded at Needs you's foot until the fold is pressed, and what a reading set aside
 * at Handled's head, which stands open too while the conversation on screen is one of its own (`holdsOpen`). The folds
 * themselves are list-folds.tsx's.
 */
function useListFold(
  rows: Thread[] | undefined,
  at: { openId: string | null; density: Density; key: string; holdsOpen?: boolean },
) {
  const [pressed, setOpen] = useState(false);
  const held = rows ?? NO_THREADS;
  const open = pressed || (!!at.holdsOpen && held.some((t) => t.id === at.openId));
  const shown = useShownThreads(open ? held : NO_THREADS, at.openId, at.density, at.key);
  return { open, setOpen, shown };
}

/**
 * The rows under the buckets: a sequence's line where the address names one; else, in Needs you, people first (decision
 * 0142): whoever the one count holds that is no conversation here, the conversations, what waits for an OK (the runs and
 * a search's question, inbox-runs.tsx), the line that says that is all of it, and the fold of whoever has waited past a
 * week. Handled opens on the fold of what was set aside, where it holds any. A search finds conversations: the rest stand
 * aside while one is typed, and Needs you with any of them in it is not empty.
 */
function threadsBody(
  list: ListCtx,
  drawn: {
    shown: ShownRows;
    olderShown: ShownRows;
    asideShown: ShownRows;
    rowsRef: (el: HTMLDivElement | null) => void;
    runsWaiting: number;
  },
) {
  const plain = !list.searching && !list.activeView;
  const whole = list.activeBucket === "escalated" && plain;
  const besides = whole && !list.fromLine;
  const people = list.needsYou?.rows ?? NONE_COUNTED;
  const approve = list.needsYou?.approve ?? NONE_COUNTED;
  const others = drawn.runsWaiting > 0 || people.length > 0 || approve.length > 0;
  const empty = list.visible.length === 0;
  return (
    <>
      {list.fromLine}
      {plain && !list.fromLine && asideFold(list, drawn.asideShown, threadRows)}
      {besides && people.length > 0 && (
        <div className="ix-runs" data-testid="inbox-people-away">
          {people.map((r) => doorRow(r, (to) => appNavigate(to)))}
        </div>
      )}
      {besides && list.commentsDoor}
      {!list.fromLine && unreadEscalated()}
      {empty && !list.fromLine && !(besides && others) && emptyThreads(list)}
      {!empty && (
        <div
          ref={drawn.rowsRef}
          className="ix-thread-rows"
          role="listbox"
          aria-label="Conversations"
          aria-multiselectable="true"
        >
          {threadRows(list, drawn.shown)}
        </div>
      )}
      {besides && <InboxRunsWaiting flash={list.flash} rows={approve} />}
      {/* Under Needs you's last row, where nothing narrows the rows: that is all of them (the thread canvas's list). */}
      {!empty && whole && (
        <p className="ix-list-end" data-testid="inbox-list-end">
          {NEEDS_YOU_LIST_END}
        </p>
      )}
      {besides && olderFold(list, drawn.olderShown, threadRows)}
    </>
  );
}

/* --------------------------------- the parts --------------------------------- */

/**
 * Buckets, the kit's sub-tabs. A real workspace has three (decision 0142), and they sit in one line of words, with no
 * glyph: the glyph said again what the label says, and a grid of two took two rows with the third alone on the second.
 * Six seeded buckets keep theirs. The canvases count a bucket only where there is something to count. A phone says each
 * tab's figure, as a desk does: with three tabs the strip has room at 320px, and Waiting said none, so nothing told a
 * phone whether it held anyone (Ruben, 19 Nov 2026; it kept Needs you's alone while there were five).
 */
function bucketTabs(list: ListCtx) {
  const { buckets, activeBucket, onBucketChange } = list;
  const tabs = (
    <SubTabs
      label="Conversations by status"
      className="ix-buckets"
      value={activeBucket}
      onSelect={onBucketChange}
      tabs={buckets.map((b) => ({
        id: b.id,
        label: b.label,
        hint: b.hint,
        tone: b.accent ? ("warn" as const) : undefined,
        // A real inbox's words alone: with glyphs, its tabs ran past a desk's list.
        glyph: buckets.length > 5 ? <Icon name={b.icon} size={13} /> : undefined,
        count: (b.count ?? 0) > 0 ? b.count : undefined,
      }))}
    />
  );
  if (list.inLine) return tabs;
  // On a phone the search rests in a glyph at the buckets' end while it holds no words, as People's does: the field stays
  // drawn, so the glyph's press puts the caret in it and a phone's keyboard with it (the phone pass, 3 Nov 2026: the
  // capsule's own row stood the first conversation at 248).
  return (
    <div className="ix-bucket-row">
      {tabs}
      {list.query ? null : (
        <ListFind
          className="ix-find"
          label={BAR_LINE_WORDS.inbox}
          onFind={() => list.findRef.current?.focus()}
          testid="inbox-find"
        />
      )}
    </div>
  );
}

/**
 * Search + saved-views toggle row. The select-all box leads it, over the rows' own boxes: it sat on the list's
 * head, a 38px line of its own beside a count the chip already said. The search is the kit's, People's capsule: the
 * field, a press on it the first word's place. On a desk the search is the bar's line, and the row holds the rest; while
 * none of it is there to see (`bare`) it takes no room until a key reaches its select-all (inbox.css), so the list opens
 * on its buckets.
 */
function searchBox(list: ListCtx) {
  const { visible, allThreads, query, setQuery, views, showViews, setShowViews, inLine } = list;
  const toggle = views.some((v) => v.count > 0);
  // A phone's empty search rests folded under the buckets' glyph (bucketTabs), open while it has the caret or words.
  const folded = !inLine && !query;
  return (
    <div className={foldedLookup("ix-find-line", folded)} data-folded={folded || undefined}>
      {visible.length > 0 &&
        pickAll({
          ids: visible.map((t) => t.id),
          selected: list.selected,
          onToggle: list.onToggleSelect,
          onClear: list.onClearSelection,
        })}
      {!inLine && (
        <Search
          className="ix-lookup"
          label={allThreads.some((t) => t.real) ? "Search by name or message" : "Search conversations, people, tags"}
          value={query}
          onChange={setQuery}
          inputRef={list.findRef}
          testid="inbox-search"
        />
      )}
      {toggle && (
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => setShowViews(!showViews)}
          data-tip="Saved views"
          aria-label="Saved views"
          aria-expanded={showViews}
        >
          <Icon name="filter" size={12} />
        </button>
      )}
    </div>
  );
}

function viewChips(list: ListCtx) {
  const { showViews, views, activeView, onViewChange } = list;
  return (
    showViews && (
      <div className="ix-views">
        <div
          className="rec-seg ix-views-row"
          role="group"
          aria-label="Saved views"
          data-look="chips-sm"
          data-wrap="true"
        >
          {views.map((v) => (
            <button
              key={v.id}
              className="rec-seg-btn"
              aria-pressed={activeView === v.id}
              onClick={() => onViewChange(v.id)}
            >
              <Icon name={v.icon} size={11} />
              <span>{v.label}</span>
              <span className="tally">{v.count}</span>
            </button>
          ))}
        </div>
      </div>
    )
  );
}

/** Needs-bucket stake summary */
function stakeLine(list: ListCtx) {
  const { inNeedsBucket, query, activeView, stake } = list;
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
function bulkBar(list: ListCtx) {
  const { selected, threads, onBulkApprove, onBulkSnooze, bulkMark, onClearSelection, bulkBusy } = list;
  return pickBar({
    count: selected.length,
    busy: bulkBusy,
    approve: threads.some((t) => t.approval) ? onBulkApprove : null,
    mark: bulkMark,
    snooze: onBulkSnooze,
    archive: () => (pickedThreads(list).some((t) => t.real) ? list.setAskArchive(true) : list.onBulkArchive()),
    clear: onClearSelection,
  });
}

/** What a search found: how many, and the words. */
function searchSaid(list: ListCtx) {
  const { visible, searching, query } = list;
  return (
    <span className="ix-list-said">
      <span className="ix-list-count tabular">
        {visible.length}{" "}
        {searching
          ? visible.length === 1
            ? "match"
            : "matches"
          : visible.length === 1
            ? "conversation in view"
            : "conversations in view"}
      </span>
      {searching && <span className="ix-find-hint">in "{query}"</span>}
    </span>
  );
}

/** The list's head: what is picked, what a search found, or what a saved view holds -- never the chip's count again. */
function listHead(list: ListCtx) {
  const headed = list.selected.length > 0 || list.searching || !!list.activeView;
  return headed && <div className="ix-list-head">{list.selected.length > 0 ? bulkBar(list) : searchSaid(list)}</div>;
}

function archiveAsk(list: ListCtx) {
  const { selected, askArchive, setAskArchive, bulkBusy, onBulkArchive } = list;
  return (
    selected.length > 0 &&
    askArchive &&
    pickArchiveAsk({
      // A pick the list no longer holds is still asked about, by its count.
      picked: selected.map((id) => list.allThreads.find((t) => t.id === id) ?? {}),
      busy: bulkBusy,
      onYes: () => Promise.resolve(onBulkArchive()).finally(() => setAskArchive(false)),
      onNo: () => setAskArchive(false),
    })
  );
}
