/**
 * PipelineScope's state: its hooks, called in the order the one function called them, and what they made
 * (moved from legacy/pages/pipeline-scope.jsx PipelineScope, decision 0015). A hook keeps the effects that set its state
 * beside it, so a setter never leaves its hook. The elements are drawn from what these return (scope-screen.tsx).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonVM, PipelineGroupKey, PipelineRowVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { askOnScreenKey, navigate, setAskOnScreen } from "../../legacy-verbs";
import type { FocusOn } from "../../kit/record/focus";
import { usePlControls } from "../hooks/use-controls";
import { usePeople } from "../hooks/use-people";
import { usePlPlace } from "../hooks/use-place";
import { peekPerson, personDetail, warmPeople, warmPerson } from "../people-detail";
import { plLoadedWords, plMatcher } from "../words";
import { pipeColumns, pipePhoneColumns } from "./columns";
import type { NewAdd } from "./new";
import { P } from "./pipe";
import type { PipelineSection } from "./pipe";
import {
  PIPE_CTX,
  PIPE_LAYOUTS,
  PIPE_PEEK_KEEPS,
  PIPE_SORT,
  pipeCanRecord,
  pipeFirstLayout,
  pipePeekFocus,
  pipeThreadRoute,
} from "./scope-bits";

/** What the frame hands the page: the door a row's press opens a person by, how the page moves the address, and the address's own part. */
export interface PipelineScopeProps {
  onOpenProfile?: (id: string) => void;
  onNavigate?: PipeNav | null;
  pipelineRoute?: string | null;
}

/** The page moves the address: a push, or a replace where the cursor walks the peek on. */
export type PipeNav = (to: string, opts?: { replace?: boolean }) => void;

/** The person the peek reads, and how the read stands: read, or failed with what it said. */
interface PeekState {
  id: string;
  person: PersonVM | null;
  failed: string | null;
}

export const EMPTY_ADD: NewAdd = { open: false, name: "", phone: "", busy: false, error: null };

/** The people People holds, the address's view and person, the workspace's clock, and the list page's controls. */
export function usePipelineFrame({ onNavigate = null, pipelineRoute = null }: PipelineScopeProps) {
  const people = usePeople();
  const nav: PipeNav = onNavigate || ((to, opts) => navigate(to, opts));
  // The view and the person the address names; the shell hands the page its param ("pipeline:v-…:p-…").
  const addr = P.parse(pipelineRoute || "clients/pipeline") || { view: "all" as const, peek: null };
  const view = addr.view;
  const addrPeek = addr.peek;
  // The workspace's zone, as every day on People is said (legacy-bridge/zone.ts).
  const tz = pageClock().zone();
  // One clock with the rows: the surface said each row's wait, its "since" and its valid-until at the moment it
  // published them (fetchedAt), so the Pipeline groups and counts at that same moment, and a proposal's "8 d" in its
  // chip and its row never disagree across midnight.
  const nowMs = people.fetchedAt || Date.now();
  // The first layout, read once: usePlControls asks for its defaults as it mounts and again as People lands.
  const [firstLayout] = useState(pipeFirstLayout);
  const controls = usePlControls({
    scope: "pipeline",
    cols: pipeColumns(),
    phoneCols: pipePhoneColumns(),
    colCtx: PIPE_CTX,
    people,
    sortFirst: PIPE_SORT,
    extraDefaults: { layout: firstLayout },
  });
  return { people, nav, view, addrPeek, tz, nowMs, controls };
}
export type PipelineFrame = ReturnType<typeof usePipelineFrame>;

/** What the page holds beside its rows: the groups opened, the peek, the board's drag, the sheets and New proposal. */
export function usePipelineUi() {
  // The groups the member opened, or folded again, by key. One they never touched is as the Pipeline starts it.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  // The peek: who is open beside the rows, and the person as read for it -- the tab's copy at once (peekPerson),
  // read again behind it (personDetail), and again after a deal is recorded on them. `peekTry` asks for the read
  // again after one failed.
  const [peekId, setPeekId] = useState<string | null>(null);
  const [peek, setPeek] = useState<PeekState | null>(null);
  const [peekTry, setPeekTry] = useState(0);
  // The board's drag: the card in hand (its row and the group it left) and the column under it.
  const [drag, setDrag] = useState<{ id: string; from: PipelineGroupKey; row: PipelineRowVM } | null>(null);
  const [over, setOver] = useState<PipelineGroupKey | null>(null);
  // A phone's lists sheet (the rail's rows), and New proposal: open, the words in its box, and someone being added.
  const [listsOpen, setListsOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newQ, setNewQ] = useState("");
  const [newAdd, setNewAdd] = useState<NewAdd>(EMPTY_ADD);
  const [newFocus, setNewFocus] = useState<FocusOn | null>(null);
  // The board's columns past their first twenty that a member asked to see whole, by key.
  const [every, setEvery] = useState<Record<string, boolean>>({});
  return {
    opened,
    setOpened,
    peekId,
    setPeekId,
    peek,
    setPeek,
    peekTry,
    setPeekTry,
    drag,
    setDrag,
    over,
    setOver,
    listsOpen,
    setListsOpen,
    newOpen,
    setNewOpen,
    newQ,
    setNewQ,
    newAdd,
    setNewAdd,
    newFocus,
    setNewFocus,
    every,
    setEvery,
  };
}
export type PipelineUi = ReturnType<typeof usePipelineUi>;

/** The whole Pipeline, the view's, and what the words in the box leave of it, in the order the member's heading picked. */
function usePipelineGroups(f: PipelineFrame) {
  const { people, view, tz, nowMs, controls } = f;
  const { q, sortBy, sortDir } = controls;
  const rows = people.rows;
  // The workspace's pace (0008, amended), as People read it: when a proposal out is waiting, and how the line says so.
  const pace = people.dealPace || null;
  // The whole Pipeline says the line over the table and the rail's counts; the view and the words in the box choose
  // only which rows show under them.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: P is the page's one object of rules, listed in the array
  const all = useMemo(() => P.of(rows, nowMs, tz, pace), [P, rows, nowMs, tz, pace]);
  const inView = useMemo(
    () => (view === "all" ? all : P.of(rows, nowMs, tz, pace, view)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: P is the page's one object of rules, listed in the array
    [P, all, rows, nowMs, tz, pace, view],
  );
  const vm = useMemo(() => {
    const match = plMatcher(q);
    return match ? P.of(rows.filter(match), nowMs, tz, pace, view) : inView;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: P is the page's one object of rules, listed in the array
  }, [P, inView, rows, nowMs, tz, pace, view, q]);
  return { rows, pace, all, inView, vm, sortBy, sortDir };
}

/** The rows the page draws, in the groups they stand in, and what it says over them. */
export function usePipelineRows(f: PipelineFrame, ui: PipelineUi) {
  const { people, view, nowMs, controls } = f;
  const { phone, q, canExport, extraView } = controls;
  const { opened, every } = ui;
  const layout = extraView && PIPE_LAYOUTS.includes(extraView.layout as string) ? (extraView.layout as string) : "list";
  const g = usePipelineGroups(f);
  const { rows, pace, all, inView, vm, sortBy, sortDir } = g;
  const rail = P.rail(all, nowMs);
  const viewCount = inView.groups.reduce((n, gr) => n + gr.count, 0);
  // Past the people People holds (its fifty pages), the line counts only the loaded, and says so in People's words.
  const loaded = people.page && people.page.has_more ? plLoadedWords(rows.length, people.page.total) : null;
  const searching = !!q.trim();
  // Who may record a deal, whether the rows are a board, and whether they select: a selection is a desk's list, where
  // x and Space pick the row under the cursor, for Mark as passed and People's own acts.
  const canRecord = pipeCanRecord();
  const board = !phone && layout === "board" && !all.empty;
  const selectable = !phone && !board && (canRecord || canExport);
  // Each group's rows in the order the member's heading picked (contracts pipelineSorted); the groups never move.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: P is the page's one object of rules, listed in the array
  const ordered = useMemo(() => P.sorted(vm, sortBy, sortDir === "desc" ? "desc" : "asc"), [P, vm, sortBy, sortDir]);
  // A search opens every group: someone looked for is someone shown.
  const sections: PipelineSection[] = ordered.groups.map((gr) => {
    const folds = gr.collapsed && !searching;
    const collapsed = folds && !opened[gr.key];
    return {
      key: gr.key,
      label: gr.label,
      meta: gr.meta,
      rows: gr.rows,
      collapsed,
      onToggle: folds ? () => ui.setOpened((o) => ({ ...o, [gr.key]: collapsed })) : null,
      toggle: collapsed ? P.words.show : P.words.hide,
    };
  });
  // The rows drawn, which the keys walk: on the board, a column's first twenty until the rest are asked for.
  const cap = board && P.boardCap ? P.boardCap : Infinity;
  const shown = sections.filter((s) => !s.collapsed).flatMap((s) => (every[s.key] ? s.rows : s.rows.slice(0, cap)));
  const ids = shown.map((r) => r.id);
  return {
    layout,
    rows,
    pace,
    all,
    inView,
    rail,
    viewCount,
    loaded,
    searching,
    canRecord,
    board,
    selectable,
    sections,
    cap,
    shown,
    ids,
    view,
  };
}
export type PipelineRows = ReturnType<typeof usePipelineRows>;

/**
 * What Ask is told is on screen (legacy-bridge/ask/context.ts): the rows drawn, in the member's order and the board's cap,
 * forty at most, and the view that chose them; taken back when the page goes.
 */
export function usePipelineAsk(r: PipelineRows) {
  const { shown, searching, view } = r;
  useEffect(() => {
    const drawn = shown.slice(0, 40);
    setAskOnScreen({
      key: "pipeline",
      ids: drawn.map((x) => x.id),
      labels: drawn.map((x) => x.name || ""),
      view: searching ? `${view}:search` : view,
    });
    return () => {
      if (askOnScreenKey() === "pipeline") setAskOnScreen(null);
    };
  });
}

/** Each view keeps its own place (the words in the box, the cursor, the scroll), as each of People's lists does. */
export function usePipelinePlace(controls: PipelineFrame["controls"], r: PipelineRows) {
  return usePlPlace({
    controls,
    page: "pipeline",
    view: r.view,
    ids: r.ids,
    noun: "person",
    selectionOf: `pipeline:${r.view}`,
    windowed: false,
  });
}
type PipelinePlace = ReturnType<typeof usePipelinePlace>;

/** The peek's doors: it opens on a row's press (which takes the cursor too), closes, and asks for the people ahead to be read. */
export function usePipelinePeekDoors(r: PipelineRows, ui: PipelineUi, place: PipelinePlace) {
  const { ids } = r;
  const { setPeekId, setPeek } = ui;
  const { setCursor } = place;
  // The people this view shows first, read in the background once the boot is in, so a row's peek and their page open
  // on what the tab already holds (people-detail.ts warmPeople).
  const aheadKey = ids.slice(0, 12).join(",");
  useEffect(() => {
    if (aheadKey) warmPeople(aheadKey.split(","));
  }, [aheadKey]);
  // What the peek opens with: the tab's copy of the person where they were read already (a row warms them under the
  // pointer and the cursor), set in the same draw that opens the peek, so a person the tab holds opens with their
  // card and never with a Reading… first.
  const showPeek = useCallback(
    (id: string) => {
      setPeekId(id);
      setPeek({ id, person: peekPerson(id), failed: null });
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps -- kept as the JSX drew it: the setters are React's own, one for the page's life
  );
  // A row opens its peek, and takes the cursor with it, so the keys carry on from it.
  const openPeek = useCallback(
    (id: string) => {
      showPeek(id);
      setCursor(id);
    },
    [showPeek], // eslint-disable-line react-hooks/exhaustive-deps -- kept as the JSX drew it: setCursor is the hook's own, one for the page's life
  );
  const closePeek = useCallback(() => setPeekId(null), []); // eslint-disable-line react-hooks/exhaustive-deps -- kept as the JSX drew it: a setter is React's own
  return { showPeek, openPeek, closePeek };
}
type PeekDoors = ReturnType<typeof usePipelinePeekDoors>;

/** The peek follows the row cursor while it is open, as the lead's does, takes focus and gives it back, and reads its person. */
export function usePipelinePeekReads(ui: PipelineUi, place: PipelinePlace, doors: PeekDoors) {
  const { peekId, peekTry, setPeek } = ui;
  const { cursor } = place;
  // The peek follows the row cursor while it is open, as the lead's does.
  useEffect(() => {
    if (peekId && cursor && cursor !== peekId) doors.showPeek(cursor);
  }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps -- kept as the JSX drew it: the cursor moving is the only reason
  useEffect(() => {
    pipePeekFocus(peekId, cursor);
  }, [peekId]); // eslint-disable-line react-hooks/exhaustive-deps -- kept as the JSX drew it: focus moves as the peek opens or closes
  // The person for the peek, read behind the tab's copy; read again when a deal is recorded on them, and on Retry
  // after a read that failed.
  useEffect(() => {
    if (!peekId) {
      setPeek(null);
      return undefined;
    }
    const id = peekId;
    setPeek((s) => (s && s.id === id ? { ...s, failed: null } : { id, person: null, failed: null }));
    let live = true;
    const read = () => {
      personDetail(id).then(
        (p) => {
          if (live)
            setPeek((s) => (s && s.id === id ? { ...s, person: p || s.person, failed: p || s.person ? null : "" } : s));
        },
        (e: Error | null) => {
          if (live) setPeek((s) => (s && s.id === id && !s.person ? { ...s, failed: (e && e.message) || "" } : s));
        },
      );
    };
    read();
    // A deal recorded or moved, and a step set, changed or done (the card in the peek draws its next step): read again.
    const onDeal = (e: Event) => {
      const detail = e && (e as CustomEvent<{ personId?: string } | null>).detail;
      if (e && detail && detail.personId === id) read();
    };
    window.addEventListener("deal:recorded", onDeal);
    window.addEventListener("note:saved", onDeal);
    return () => {
      live = false;
      window.removeEventListener("deal:recorded", onDeal);
      window.removeEventListener("note:saved", onDeal);
    };
  }, [peekId, peekTry]); // eslint-disable-line react-hooks/exhaustive-deps -- kept as the JSX drew it: the setters are React's own
}

/** The peek's head is the row's, wherever the row now stands: a move regroups them, and the peek says the new group. */
export function usePipelinePeekRow(r: PipelineRows, ui: PipelineUi, f: PipelineFrame) {
  const { all } = r;
  const { peekId, setPeekId, peek } = ui;
  const { phone } = f.controls;
  const peekRow = useMemo(() => {
    if (!peekId) return null;
    for (const g of all.groups) for (const row of g.rows) if (row.id === peekId) return { row, group: g.key };
    return null;
  }, [all, peekId]);
  // Someone who left the Pipeline (nothing to follow now) closes their peek.
  useEffect(() => {
    if (peekId && !peekRow) setPeekId(null);
  }, [peekId, peekRow]); // eslint-disable-line react-hooks/exhaustive-deps -- kept as the JSX drew it: the setter is React's own
  // Once they are read, their deals say which step a deal card of theirs carries, so the peek says it once.
  // (A deal's id is a string or null here and a string in pipelinePeekOf, which only ever compares it: a null names no card.)
  const peekDeals = peek && peek.id === peekId && peek.person ? peek.person.deals || null : null;
  const peekVm = peekRow
    ? P.peek(peekRow.row, peekRow.group, peekDeals as readonly { id: string; stage: string }[] | null)
    : null;
  // Beside an open peek on a desk, the columns that still say the row; on a phone the peek is the whole screen.
  const compact = !!peekVm && !phone;
  return { peekRow, peekVm, compact };
}
type PeekRow = ReturnType<typeof usePipelinePeekRow>;

/** The columns drawn: beside an open peek on a desk, only those that still say the row. */
export function usePipelineColumns(f: PipelineFrame, pk: PeekRow) {
  const { columns } = f.controls;
  const { compact } = pk;
  return useMemo(() => (compact ? columns.filter((c) => PIPE_PEEK_KEEPS.has(c.key)) : columns), [columns, compact]);
}

/**
 * A board column shows twenty; a cursor or a peek the address puts on a card past them shows the column whole, or the
 * keys would walk from a card that is not drawn. And a move that regroups the row puts it under another head, a new
 * element, so the focus the sheet gave back to the row went with the old one: it goes to the row where it now is.
 */
export function usePipelineBoardFocus(r: PipelineRows, ui: PipelineUi, place: PipelinePlace) {
  const { board, cap, sections } = r;
  const { every, peekId, setEvery } = ui;
  const { cursor } = place;
  useEffect(() => {
    if (!board || !isFinite(cap)) return;
    for (const sct of sections) {
      if (every[sct.key]) continue;
      if (sct.rows.slice(cap).some((row) => row.id === cursor || row.id === peekId))
        setEvery((e) => ({ ...e, [sct.key]: true }));
    }
  }, [board, cursor, peekId]); // eslint-disable-line react-hooks/exhaustive-deps -- kept as the JSX drew it: a column opens as a cursor or a peek lands past its cap
  useEffect(() => {
    const onRecorded = (e: Event) => {
      const detail = e && (e as CustomEvent<{ personId?: string } | null>).detail;
      const id = detail && detail.personId;
      if (!id) return;
      setTimeout(() => {
        const doc = window.document;
        if (!doc || (doc.activeElement && doc.activeElement !== doc.body)) return;
        const el = doc.getElementById && doc.getElementById(`person-${id}`);
        if (el && el.focus) el.focus({ preventScroll: true });
      }, 0);
    };
    window.addEventListener("deal:recorded", onRecorded);
    return () => window.removeEventListener("deal:recorded", onRecorded);
  }, []);
}

/**
 * The view and the person open over it are the address (contracts pipelineRoute), as Leads keeps its lead: when the
 * ADDRESS moved -- a link, Back or Forward, a rail pick, the first draw -- the page follows it, and a view that changed
 * under an open person closes their peek. When the PAGE moved, it says so: opening pushes an entry, the cursor walking
 * the peek on replaces it, and closing goes back to the entry the opening made. A person who came with the address has
 * no entry of the page's behind them, so they close by replacing.
 */
export function usePipelineAddress(f: PipelineFrame, ui: PipelineUi, doors: PeekDoors) {
  const { view, addrPeek, nav } = f;
  const { peekId, setPeekId } = ui;
  const { openPeek } = doors;
  const viewRoute = P.route({ view });
  const peekAddr = useRef<{
    view: string | undefined;
    peek: string | null | undefined;
    asked: string | null;
    pushed: boolean;
  }>({
    view: undefined,
    peek: undefined,
    asked: null,
    pushed: false,
  });
  useEffect(() => {
    const a = peekAddr.current;
    if (a.view !== viewRoute || a.peek !== addrPeek) {
      a.view = viewRoute;
      a.peek = addrPeek;
      a.asked = null;
      if (!addrPeek) a.pushed = false;
      // The person the address names takes the cursor too: the cursor this tab kept for the view (usePlPlace) would
      // otherwise walk the peek, and the address, off them on the next draw.
      if (peekId !== addrPeek) {
        if (addrPeek) openPeek(addrPeek);
        else setPeekId(null);
      }
      return;
    }
    if (peekId === addrPeek) return;
    const want = P.route({ view, peek: peekId });
    // Said once: the shell follows a push in its next draw, and every draw until then finds the address as it was.
    if (a.asked === want) return;
    a.asked = want;
    if (peekId && !addrPeek && !a.pushed) {
      a.pushed = true;
      nav(want);
    } else if (!peekId && a.pushed && window.history && window.history.back) {
      a.pushed = false;
      window.history.back();
    } else nav(want, { replace: true });
  }, [viewRoute, addrPeek, peekId]); // eslint-disable-line react-hooks/exhaustive-deps -- kept as the JSX drew it: the address moving, or the peek, is what it answers
  return viewRoute;
}

/**
 * A row press and a cell's doors, behind one function and one object for the page's life: the rows are memoised (the
 * table's PeopleRowMemo), and the shell hands the page a new onOpenProfile on every route change.
 */
export function usePipelineDoors(
  f: PipelineFrame,
  r: PipelineRows,
  doors: PeekDoors,
  onOpenProfile: (id: string) => void,
) {
  const { nav } = f;
  const { canRecord } = r;
  const pageRef = useRef(onOpenProfile);
  pageRef.current = onOpenProfile;
  const navRef = useRef(nav);
  navRef.current = nav;
  const { openPeek } = doors;
  const ctx = useMemo(
    () => ({
      attention: null,
      onOpen: openPeek,
      // Read a person before their row is pressed, as People's rows do: the peek then opens on the tab's copy.
      onWarm: (id: string) => {
        void warmPerson(id);
      },
      // The row's menu: the deal's acts where this member may record one, then their page and their thread.
      canRecord,
      onPage: (id: string) => pageRef.current(id),
      onThread: (row: PipelineRowVM) => {
        if (row.person.threadId) navRef.current(pipeThreadRoute(row.person.threadId));
      },
    }),
    [openPeek, canRecord],
  );
  return { pageRef, navRef, ctx };
}

/** The person the peek's card draws: the one read, judged by People's pace and its follow-up as its row says them. */
export function usePipelinePerson(r: PipelineRows, ui: PipelineUi, pk: PeekRow) {
  const { pace } = r;
  const { peek, peekId } = ui;
  // The peek's card judges its wait by People's pace, as the rows beside it do: the person read has its own, which
  // a yes recorded on someone else since would leave behind.
  const peekRead = peek && peek.id === peekId ? peek.person : null;
  // And where it stands with the proposal follow-up (0006), as its row says: the card then says when the run goes,
  // and leads with no nudge of its own.
  const followUp = pk.peekRow ? pk.peekRow.row.person.followUp || null : null;
  return useMemo(() => (peekRead ? { ...peekRead, dealPace: pace, followUp } : null), [peekRead, pace, followUp]);
}
