/* global React, Icon, StatePill */
// People › Pipeline (docs/decisions/0008-a-proposal-is-part-of-the-deal.md): People's rows by where their deal stands
// -- consultations, proposals out, clients, and those who passed or ended -- under one line that says what is out and
// what it comes to. A view of People, never a page of its own: People's switch, People's table in sections
// (people-table.jsx), People's person cell and phone card, the list page's two hooks (clients-a.jsx usePlControls and
// usePlPlace: the width, the words in the box, the keys, the place kept, the first rows), and the rows the People
// surface already holds, so nothing is fetched. Every word is contracts' (pipeline.ts, window.__pipeline); the page
// composes them and decides nothing. Drawn only where deals are on: anywhere else ClientsA draws People. Loaded before
// clients-a.jsx, which draws it, and it reads what that file publishes only as it draws.
//
// A workspace, not only a list ("The Pipeline is a workspace", 0008):
// - its own rail (contracts pipelineRail): its groups, what waits on the owner, and each service; on a phone the same
//   rows behind the bar's list button, and the standing line's warn parts press to the same views;
// - its address (contracts pipelineRoute: clients/pipeline:v-<view>:p-<person>), which the shell follows as a prop, so a
//   refresh keeps the view and the person open over it, Back closes the peek, and any page can link to a deal;
// - a row opens its person's deal in a peek beside the rows (pipeline-peek.jsx), with the card's own acts;
// - on a desk the rows can be a board (pipeline-board.jsx), whose drops ask the one sheet for the move; the choice is
//   the member's saved view, with People's and Leads' (usePlControls extraDefaults);
// - New proposal (pipeline-new.jsx) picks or adds a person, then opens the one deal sheet;
// - a teammate's move arrives on its own: the People surface repaints on the deals table.

// The table's columns: People's own person cell, then the deal's service, its value in tabular figures, where it stands
// (its steps, `track`, and how long it has stood there), where they came from and the day a proposal stands until
// (a member shows those two with Columns), its one chip, whose heading only a screen reader hears (the house's
// .rec-sr: no one word is right for "Fri 2:00 PM" and "Since Sep 18" alike), and the row's own menu. Person, Value
// and Stage sort within each group (contracts pipelineSorted); Stage is the Pipeline's own order, as the page opens.
// Made once, from contracts' headings, so the list page's memo sees one list from one draw to the next.
let PIPE_COLUMNS = null;
const pipeColumns = () => {
  if (PIPE_COLUMNS) return PIPE_COLUMNS;
  const w = window.__pipeline.words.columns;
  PIPE_COLUMNS = [
    { key: "name", label: w.person, sortable: true, pinned: true, cell: (r, x) => window.plNameCell(r.person, x) },
    { key: "service", label: w.service, sortable: false, cell: (r) => <td key="service" className="pipe-service" data-testid="pipe-service">{r.service || ""}</td> },
    { key: "value", label: w.value, sortable: true, cell: (r) => <td key="value" className="shrink tabular pipe-value" data-testid="pipe-value">{r.value || ""}</td> },
    { key: "stage", label: w.stage, sortable: true, cell: (r) => (
      <td key="stage" className="shrink dim tabular pipe-stage">
        <span className="pipe-stage-in">{window.PipelineTrack ? <window.PipelineTrack steps={r.track} /> : null}<span data-testid="pipe-in-stage">{r.inStage}</span></span>
      </td>
    ) },
    { key: "came", label: w.came, sortable: false, on: false, cell: (r) => <td key="came" className="dim pipe-came" data-testid="pipe-came">{r.person.cameFrom ? r.person.cameFrom.label : ""}</td> },
    { key: "valid", label: w.valid, sortable: false, on: false, cell: (r) => {
      const v = r.person.deal && r.person.deal.validUntil;
      return <td key="valid" className={`shrink tabular pipe-valid${v && v.lapsed ? " is-lapsed" : ""}`} data-testid="pipe-valid">{v ? v.date : ""}</td>;
    } },
    { key: "chip", label: <span className="rec-sr">{w.chip}</span>, sortable: false, cell: (r) => <td key="chip" className="shrink pipe-chip">{r.chip ? <StatePill kind="tone" value={r.chip.tone} label={r.chip.words} testid="pipe-chip" /> : null}</td> },
    { key: "actions", label: <span className="rec-sr">{w.acts}</span>, sortable: false, fixed: true, cell: (r, x) => (
      <td key="actions" className="shrink cl-actions-cell">{window.PipelineRowMenu ? <window.PipelineRowMenu r={r} canRecord={x.canRecord} onPage={x.onPage} onThread={x.onThread} /> : null}</td>
    ) },
  ];
  return PIPE_COLUMNS;
};

// A row on a phone is People's card (plRowCard): the face and the name with the chip beside them; the service under
// them; then the deal's steps, the value and the time in stage.
const pipeCardCell = (r) => {
  const p = r.person;
  return window.plRowCard({
    face: window.plFace(p),
    name: p.name,
    numeric: window.plIsNumber(p.name),
    pill: r.chip ? <StatePill kind="tone" value={r.chip.tone} label={r.chip.words} testid="pipe-chip" /> : null,
    lead: r.service,
    leadTestid: "pipe-service",
    facts: [
      r.track.length && window.PipelineTrack ? <window.PipelineTrack key="track" steps={r.track} /> : null,
      r.value ? <span key="value" className="pipe-card-value" data-testid="pipe-value">{r.value}</span> : null,
      r.inStage ? <span key="stage" className="pl-card-last" data-testid="pipe-in-stage">{r.inStage}</span> : null,
    ],
  });
};
let PIPE_PHONE_COLUMNS = null;
const pipePhoneColumns = () => PIPE_PHONE_COLUMNS || (PIPE_PHONE_COLUMNS = [{ key: "card", label: window.__pipeline.words.columns.person, sortable: false, pinned: true, cell: pipeCardCell }]);
const pipeCardRow = () => "pl-card-row";
// The order the page opens in: Stage, the Pipeline's own (contracts pipelineOf), until the member picks a heading.
const PIPE_SORT = { by: "stage", dir: "asc" };
const PIPE_CTX = {};
// Beside an open peek on a desk the table keeps who and where it stands in a word: at 1280, beside the sidebar and the
// rail, the rows have some 350px left of the peek, which holds those two and not the value, which the peek's card says
// at its head. And of People's acts on a selection the Pipeline keeps its lists and its export, after its own Mark as
// passed.
const PIPE_PEEK_KEEPS = new Set(["name", "chip"]);
const PIPE_BULK_ACTS = ["lists", "export"];

// The first layout a member who never chose one gets: what #941 kept in this browser, read once, else the list. The
// choice itself is the member's saved view now (usePlControls extraDefaults), and nothing writes the old key again.
const PIPE_LAYOUTS = ["list", "board"];
const pipeFirstLayout = () => { try { return window.localStorage && window.localStorage.getItem("pipeline.view") === "board" ? "board" : "list"; } catch (e) { return "list"; } };
// The peek's focus rule, the lead peek's: focus moves into the peek as it opens, and back to the row (the cursor's,
// `person-<id>`, the table's own id from its noun) as it closes, so Tab carries on from where the member was.
const pipePeekFocus = (peekId, cursor) => {
  const doc = window.document;
  if (!doc || !doc.getElementById) return;
  const el = peekId ? doc.getElementById("pipeline-peek-close") : cursor && doc.getElementById(`person-${cursor}`);
  if (el && el.focus) el.focus({ preventScroll: true });
};
// Whether this member may record a deal: an owner or an operator, as the person page decides it (client-profile.jsx).
const pipeCanRecord = () => !!(window.__ME && (window.__ME.role === "owner" || window.__ME.role === "operator"));
// A send from the peek's card opens their thread with the words in the box where free text can go: the person page's
// own path (client-profile.jsx openWith), and the thread reads the same key as it opens (inbox-thread.jsx).
const pipeComposeIn = (person, text, nav) => {
  if (!person || !person.openThread) return;
  if (text) { try { sessionStorage.setItem("chanlytics-compose", JSON.stringify({ threadId: person.openThread.replace(/^inbox\//, ""), text })); } catch (e) { /* nothing to carry */ } }
  nav(person.openThread);
};

// The rail's rows, by section (contracts pipelineRail), each a pick of People's rail kit. What waits on the owner counts
// in the warn ink (the kit's `asks`). Drawn on a desk's rail and in a phone's lists sheet alike.
const PipelineRailRows = ({ sections, view, onPick }) => (
  <>
    {sections.map((s) => (
      <window.RailSection key={s.key} label={s.label} testid={`pipeline-rail-${s.key}`}>
        {s.rows.map((r) => (
          <window.RailRow key={r.view} label={r.label} count={r.count} active={view === r.view} onPick={() => onPick(r.view)} className={r.tone === "warn" ? "asks" : ""} testid={`pipeline-rail-row-${r.view}`} />
        ))}
      </window.RailSection>
    ))}
  </>
);

const EMPTY_ADD = { open: false, name: "", phone: "", busy: false, error: null };

const PipelineScope = ({ onOpenProfile = () => {}, onNavigate = null, pipelineRoute = null }) => {
  const { usePeople, usePlControls, usePlPlace } = window;
  const P = window.__pipeline;
  const people = usePeople();
  const nav = onNavigate || ((to, opts) => window.CHANLY.nav(to, opts));
  const words = P.words;
  // The view and the person the address names; the shell hands the page its param ("pipeline:v-…:p-…").
  const addr = (P.parse && P.parse(pipelineRoute || "clients/pipeline")) || { view: "all", peek: null };
  const view = addr.view;
  const addrPeek = addr.peek;
  // The workspace's zone, as every day on People is said (legacy-bridge/zone.ts).
  const tz = window.__clock && window.__clock.zone ? window.__clock.zone() : "UTC";
  // One clock with the rows: the surface said each row's wait, its "since" and its valid-until at the moment it
  // published them (fetchedAt), so the Pipeline groups and counts at that same moment, and a proposal's "8 d" in its
  // chip and its row never disagree across midnight.
  const nowMs = people.fetchedAt || Date.now();
  // The first layout, read once: usePlControls asks for its defaults as it mounts and again as People lands.
  const [firstLayout] = React.useState(pipeFirstLayout);
  const controls = usePlControls({ scope: "pipeline", cols: pipeColumns(), phoneCols: pipePhoneColumns(), colCtx: PIPE_CTX, people, sortFirst: PIPE_SORT, extraDefaults: { layout: firstLayout } });
  const { phone, searchOpen, setSearchOpen, toastNode, plFlash, q, setQ, searchRef, scrollRef, columns, scrolledX, setScrolledX, extraView, setExtraView } = controls;
  const { sel, setSel, toggleSel, clearSelection, canExport, sortBy, sortDir, onSort, colsOpen, setColsOpen, colOptions, pickColumn, colsButton } = controls;
  const layout = extraView && PIPE_LAYOUTS.includes(extraView.layout) ? extraView.layout : "list";
  // The groups the member opened, or folded again, by key. One they never touched is as the Pipeline starts it.
  const [opened, setOpened] = React.useState({});
  // The peek: who is open beside the rows, and the person as read for it -- the tab's copy at once (__peekPerson),
  // read again behind it (__personDetail), and again after a deal is recorded on them. `peekTry` asks for the read
  // again after one failed.
  const [peekId, setPeekId] = React.useState(null);
  const [peek, setPeek] = React.useState(null);
  const [peekTry, setPeekTry] = React.useState(0);
  // The board's drag: the card in hand (its row and the group it left) and the column under it.
  const [drag, setDrag] = React.useState(null);
  const [over, setOver] = React.useState(null);
  // A phone's lists sheet (the rail's rows), and New proposal: open, the words in its box, and someone being added.
  const [listsOpen, setListsOpen] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [newQ, setNewQ] = React.useState("");
  const [newAdd, setNewAdd] = React.useState(EMPTY_ADD);
  const [newFocus, setNewFocus] = React.useState(null);
  // The board's columns past their first twenty that a member asked to see whole, by key.
  const [every, setEvery] = React.useState({});
  const rows = people.rows;
  // The whole Pipeline says the line over the table and the rail's counts; the view and the words in the box choose
  // only which rows show under them.
  const all = React.useMemo(() => P.of(rows, nowMs, tz), [P, rows, nowMs, tz]);
  const inView = React.useMemo(() => (view === "all" ? all : P.of(rows, nowMs, tz, view)), [P, all, rows, nowMs, tz, view]);
  const vm = React.useMemo(() => {
    const match = window.plMatcher(q);
    return match ? P.of(rows.filter(match), nowMs, tz, view) : inView;
  }, [P, inView, rows, nowMs, tz, view, q]);
  const rail = P.rail ? P.rail(all, nowMs) : [];
  const viewCount = inView.groups.reduce((n, g) => n + g.count, 0);
  // Past the people People holds (its fifty pages), the line counts only the loaded, and says so in People's words.
  const loaded = people.page && people.page.has_more ? window.plLoadedWords(rows.length, people.page.total) : null;
  const searching = !!q.trim();
  // Who may record a deal, whether the rows are a board, and whether they select: a selection is a desk's list, where
  // x and Space pick the row under the cursor, for Mark as passed and People's own acts.
  const canRecord = pipeCanRecord();
  const board = !phone && layout === "board" && !all.empty;
  const selectable = !phone && !board && (canRecord || canExport);
  // Each group's rows in the order the member's heading picked (contracts pipelineSorted); the groups never move.
  const ordered = React.useMemo(() => (P.sorted ? P.sorted(vm, sortBy, sortDir) : vm), [P, vm, sortBy, sortDir]);
  // A search opens every group: someone looked for is someone shown.
  const sections = ordered.groups.map((g) => {
    const folds = g.collapsed && !searching;
    const collapsed = folds && !opened[g.key];
    return {
      key: g.key,
      label: g.label,
      meta: g.meta,
      rows: g.rows,
      collapsed,
      onToggle: folds ? () => setOpened((o) => ({ ...o, [g.key]: collapsed })) : null,
      toggle: collapsed ? words.show : words.hide,
    };
  });
  // The rows drawn, which the keys walk: on the board, a column's first twenty until the rest are asked for.
  const cap = board && P.boardCap ? P.boardCap : Infinity;
  const shown = sections.filter((s) => !s.collapsed).flatMap((s) => (every[s.key] ? s.rows : s.rows.slice(0, cap)));
  const ids = shown.map((r) => r.id);
  // The table's foot counts the view it shows ("6 people" in Proposal out, "Showing 1 of 6" searched there), as the
  // rail's row for it does; the line above stays the whole Pipeline's.
  const total = viewCount;
  // Each view keeps its own place (the words in the box, the cursor, the scroll), as each of People's lists does.
  const { cursor, setCursor, rowBudget, keysWith, toggleAll } = usePlPlace({ controls, page: "pipeline", view, ids, noun: "person", selectionOf: `pipeline:${view}` });
  // What the peek opens with: the tab's copy of the person where they were read already (a row warms them under the
  // pointer and the cursor), set in the same draw that opens the peek, so a person the tab holds opens with their
  // card and never with a Reading… first.
  const showPeek = React.useCallback((id) => {
    setPeekId(id);
    setPeek({ id, person: window.__peekPerson ? window.__peekPerson(id) : null, failed: null });
  }, []);
  // A row opens its peek, and takes the cursor with it, so the keys carry on from it.
  const openPeek = React.useCallback((id) => { showPeek(id); setCursor(id); }, [showPeek]); // eslint-disable-line react-hooks/exhaustive-deps
  const closePeek = React.useCallback(() => setPeekId(null), []);
  const closeSheets = () => { setListsOpen(false); setNewOpen(false); };
  // What the keyboard's one listener reads: Enter opens the peek for the person under the cursor, Esc closes it, and
  // J and K keep walking the rows behind it. Nothing here selects. A phone's sheet holds the keys while it is up.
  keysWith({ open: openPeek, canSelect: selectable, sheetOpen: listsOpen || newOpen, closeSheet: closeSheets, peekOpen: !!peekId, closePeek });
  // The peek follows the row cursor while it is open, as the lead's does.
  React.useEffect(() => { if (peekId && cursor && cursor !== peekId) showPeek(cursor); }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { pipePeekFocus(peekId, cursor); }, [peekId]); // eslint-disable-line react-hooks/exhaustive-deps
  // The person for the peek, read behind the tab's copy; read again when a deal is recorded on them, and on Retry
  // after a read that failed.
  React.useEffect(() => {
    if (!peekId) { setPeek(null); return undefined; }
    const id = peekId;
    setPeek((s) => (s && s.id === id ? { ...s, failed: null } : { id, person: null, failed: null }));
    let live = true;
    const read = () => {
      if (!window.__personDetail) { setPeek((s) => (s && s.id === id && !s.person ? { ...s, failed: "" } : s)); return; }
      window.__personDetail(id).then(
        (p) => { if (live) setPeek((s) => (s && s.id === id ? { ...s, person: p || s.person, failed: p || s.person ? null : "" } : s)); },
        (e) => { if (live) setPeek((s) => (s && s.id === id && !s.person ? { ...s, failed: (e && e.message) || "" } : s)); },
      );
    };
    read();
    const onDeal = (e) => { if (e && e.detail && e.detail.personId === id) read(); };
    window.addEventListener("deal:recorded", onDeal);
    return () => { live = false; window.removeEventListener("deal:recorded", onDeal); };
  }, [peekId, peekTry]);
  // The peek's head is the row's, wherever the row now stands: a move regroups them, and the peek says the new group.
  const peekRow = React.useMemo(() => {
    if (!peekId) return null;
    for (const g of all.groups) for (const r of g.rows) if (r.id === peekId) return { row: r, group: g.key };
    return null;
  }, [all, peekId]);
  // Someone who left the Pipeline (nothing to follow now) closes their peek.
  React.useEffect(() => { if (peekId && !peekRow) setPeekId(null); }, [peekId, peekRow]);
  const peekVm = peekRow ? P.peek(peekRow.row, peekRow.group) : null;
  // Beside an open peek on a desk, the columns that still say the row; on a phone the peek is the whole screen.
  const compact = !!peekVm && !phone;
  const tableColumns = React.useMemo(() => (compact ? columns.filter((c) => PIPE_PEEK_KEEPS.has(c.key)) : columns), [columns, compact]);
  // A group's head holds under the table's own while its rows scroll (clients.css, --pipe-head-h). How tall the table's
  // head is is the table's to say, so it is read as the table is drawn and whenever it changes.
  React.useEffect(() => {
    const box = scrollRef.current;
    const head = box && box.querySelector ? box.querySelector("thead") : null;
    if (!head || typeof ResizeObserver !== "function") return undefined;
    const put = () => box.style.setProperty("--pipe-head-h", `${Math.round(head.getBoundingClientRect().height)}px`);
    put();
    const watch = new ResizeObserver(put);
    watch.observe(head);
    return () => watch.disconnect();
  }, [scrollRef, board, phone, compact]);
  // The people picked, as the rows shown say them: a person a view no longer shows is not acted on.
  const picked = selectable ? shown.filter((r) => sel.has(r.id)).map((r) => r.person) : [];
  // The view and the person open over it are the address (contracts pipelineRoute), as Leads keeps its lead
  // (clients-a.jsx peekAddr): when the ADDRESS moved -- a link, Back or Forward, a rail pick, the first draw -- the page
  // follows it, and a view that changed under an open person closes their peek. When the PAGE moved, it says so:
  // opening pushes an entry, the cursor walking the peek on replaces it, and closing goes back to the entry the opening
  // made. A person who came with the address has no entry of the page's behind them, so they close by replacing.
  const viewRoute = P.route({ view });
  const peekAddr = React.useRef({ view: undefined, peek: undefined, asked: null, pushed: false });
  React.useEffect(() => {
    const a = peekAddr.current;
    if (a.view !== viewRoute || a.peek !== addrPeek) {
      a.view = viewRoute;
      a.peek = addrPeek;
      a.asked = null;
      if (!addrPeek) a.pushed = false;
      // The person the address names takes the cursor too: the cursor this tab kept for the view (usePlPlace) would
      // otherwise walk the peek, and the address, off them on the next draw.
      if (peekId !== addrPeek) { if (addrPeek) openPeek(addrPeek); else setPeekId(null); }
      return;
    }
    if (peekId === addrPeek) return;
    const want = P.route({ view, peek: peekId });
    // Said once: a push is answered a task later (hashchange), and every draw until then finds the address as it was.
    if (a.asked === want) return;
    a.asked = want;
    if (peekId && !addrPeek && !a.pushed) { a.pushed = true; nav(want); }
    else if (!peekId && a.pushed && window.history && window.history.back) { a.pushed = false; window.history.back(); }
    else nav(want, { replace: true });
  }, [viewRoute, addrPeek, peekId]); // eslint-disable-line react-hooks/exhaustive-deps
  // A row press and a cell's doors, behind one function and one object for the page's life: the rows are memoised
  // (people-table.jsx PeopleRowMemo), and the shell hands the page a new onOpenProfile on every route change.
  const pageRef = React.useRef(onOpenProfile);
  pageRef.current = onOpenProfile;
  const navRef = React.useRef(nav);
  navRef.current = nav;
  const ctx = React.useMemo(() => ({
    attention: null,
    onOpen: openPeek,
    // Read a person before their row is pressed, as People's rows do: the peek then opens on the tab's copy.
    onWarm: (id) => { if (window.__warmPerson) window.__warmPerson(id); },
    // The row's menu: the deal's acts where this member may record one, then their page and their thread.
    canRecord,
    onPage: (id) => pageRef.current(id),
    onThread: (r) => { if (r.person.threadId) navRef.current(window.CHANLY.R.thread(r.person.threadId)); },
  }), [openPeek, canRecord]);
  // A view is a new place: the rail's pick, or a warn part of the line, pushes its address; the picked one again goes
  // back to the whole Pipeline (the rail kit's railToggle).
  const pickView = (v) => { closeSheets(); nav(P.route({ view: v === view ? "all" : v })); };
  // The board: every group as a column, those with nobody in them too, so a card has somewhere to drop.
  const boardColumns = board
    ? Object.keys(words.groups).map((key) => sections.find((s) => s.key === key) || { key, label: words.groups[key], meta: null, rows: [], collapsed: false, onToggle: null, toggle: null })
    : null;
  const moveOf = P.move;
  const dragEnd = () => { setDrag(null); setOver(null); };
  // A drop asks the one sheet for the move; the sheet records it, and the rows follow the record (the door's answer
  // lands on the row at once, People is read again behind it).
  const drop = (to) => {
    const d = drag;
    dragEnd();
    const mv = d ? moveOf(d.from, to, d.row) : null;
    if (mv && window.openDealSheet) window.openDealSheet({ personId: d.id, mode: mv.mode, dealId: mv.dealId });
  };
  // A card's Move to asks for the sheet a drop would, the card holding focus first so closing the sheet lands on it.
  const moveTo = (row, from, to) => {
    const mv = moveOf(from, to, row);
    if (!mv || !window.openDealSheet) return;
    if (window.pipeHoldFocus) window.pipeHoldFocus(row.id);
    window.openDealSheet({ personId: row.id, mode: mv.mode, dealId: mv.dealId });
  };
  // New proposal: who it is for, then the one deal sheet in its propose mode. Someone added is People's own add.
  const openNew = () => { setNewQ(""); setNewAdd(EMPTY_ADD); setNewFocus({ row: "search" }); setNewOpen(true); };
  const pickForNew = (id) => {
    setNewOpen(false);
    setNewAdd(EMPTY_ADD);
    if (window.openDealSheet) window.openDealSheet({ personId: id, mode: "propose" });
  };
  const addForNew = async () => {
    const d = newAdd;
    if (d.busy || !d.phone.trim() || !window.plAddPerson || !window.__addPerson) return;
    setNewAdd({ ...d, busy: true, error: null });
    const r = await window.plAddPerson(d);
    if (!r.ok) { setNewAdd((x) => ({ ...x, busy: false, error: r.error })); return; }
    if (controls.plFlash && window.plAddedWords) controls.plFlash({ msg: window.plAddedWords(d, r.existed) });
    pickForNew(r.id);
  };
  const newGate = window.gate ? window.gate("approve", "start a proposal") : {};
  const emptyWords = all.empty
    ? { title: words.empty.title, body: words.empty.body }
    : inView.empty
      ? { title: words.board.nobody, action: { label: words.rail.all, onClick: () => pickView("all") } }
      : null;
  const Bar = window.PeoplePhoneBar;
  const Table = window.PeopleTable;
  const Board = window.PipelineBoard;
  const Peek = window.PipelinePeek;
  const New = window.PipelineNew;
  const onScope = (to) => nav(window.plScopeRoute(to));
  const person = peek && peek.id === peekId ? peek.person : null;
  const line = loaded ? [...all.line, { words: loaded, view: null, tone: null }] : all.line;
  return (
    <div className="clients pipe-scope" data-testid="pipeline">
      {/* The Pipeline's own rail, with People's switch at its head. A phone's is the bar's switch and its list button. */}
      {!phone && (
        <aside className="cl-rail pipe-rail" data-testid="pipeline-rail">
          <window.PeopleScopeTabs scope="pipeline" onScope={onScope} dealsOn />
          <PipelineRailRows sections={rail} view={view} onPick={pickView} />
        </aside>
      )}
      <div className={`cl-main${compact ? " has-peek" : ""}`}>
        <div className="cl-main-scroll pl-main" ref={scrollRef}>
          {/* A phone's one bar: the switch, the view shown (its rows in a sheet), search, and New proposal's +. */}
          {phone && (
            <Bar
              scope="pipeline"
              dealsOn
              onScope={onScope}
              listLabel={P.viewLabel(view)}
              listCount={viewCount}
              onLists={() => setListsOpen(true)}
              listsOpen={listsOpen}
              q={q}
              onQ={setQ}
              searchRef={searchRef}
              searchOpen={searchOpen}
              onSearchOpen={setSearchOpen}
              searchLabel={window.PL_SEARCH_LABEL}
              trailing={<button type="button" className="pp-bar-icon" aria-label={words.newProposal.button} onClick={openNew} data-testid="pipeline-new-open" {...newGate}><Icon name="plus" size={18} /></button>}
              testid="pipeline"
            />
          )}
          {/* The line over the table, People's standing line in its parts: only the parts that have something, and those
              that count what waits on the owner press to their view. */}
          {line.length > 0 && (
            <div className="pl-standing" data-testid="pipeline-summary">
              {line.map((part, i) => {
                const said = part.view
                  ? <button type="button" className={`pl-standing-needs${view === part.view ? " on" : ""}`} aria-pressed={view === part.view} onClick={() => pickView(part.view)} data-testid={`pipeline-line-${part.view}`}>{part.words}</button>
                  : <span className={i === 0 ? "pl-standing-total" : "pl-standing-reached"}>{part.words}</span>;
                return i === 0 ? <React.Fragment key={i}>{said}</React.Fragment> : (
                  <span key={i} className="pl-standing-part">
                    <span className="pl-standing-dot" aria-hidden="true">·</span>
                    {said}
                  </span>
                );
              })}
            </div>
          )}
          {!phone && (
            <div className="cl-controls">
              <div className="cl-search-wrap">
                <Icon name="search" size={13} />
                <input ref={searchRef} placeholder={`${window.PL_SEARCH_LABEL}…`} aria-label={window.PL_SEARCH_LABEL} value={q} onChange={(e) => setQ(e.target.value)} data-testid="pipeline-search" />
                <span className="kbd">/</span>
              </div>
              <div className="cl-controls-right">
                {/* Which columns show, a member's own, kept in their view: People's menu (people-table.jsx). */}
                {!board && window.PeopleColumnsMenu ? <window.PeopleColumnsMenu open={colsOpen} onOpenChange={setColsOpen} options={colOptions} onPick={pickColumn} buttonRef={colsButton} /> : null}
                {/* The list or the board: the house's small tab pair, a pressed state each, kept in the member's view. */}
                <div className="cl-tabs pipe-views" role="group" aria-label={words.views.label} data-testid="pipeline-views">
                  {PIPE_LAYOUTS.map((v) => (
                    <button key={v} type="button" className={`cl-tab${layout === v ? " active" : ""}`} aria-pressed={layout === v} onClick={() => setExtraView({ layout: v })} data-testid={`pipeline-view-${v}`}>{words.views[v]}</button>
                  ))}
                </div>
                {/* The page's one filled button: shown to every role, and said why where the role may not press it. */}
                <button type="button" className="btn btn-primary btn-sm pipe-new-btn" onClick={openNew} data-testid="pipeline-new-open" {...newGate}><Icon name="plus" size={12} /> {words.newProposal.button}</button>
              </div>
            </div>
          )}
          {board ? (
            <Board
              columns={boardColumns}
              cursor={cursor}
              canDrag={canRecord}
              drag={drag}
              over={over}
              moveOf={moveOf}
              onOpen={openPeek}
              onWarm={ctx.onWarm}
              onDragStart={(row, from) => setDrag({ id: row.id, from, row })}
              onDragEnd={dragEnd}
              onDragOver={(key) => { if (over !== key) setOver(key); }}
              onDragLeave={(key) => { if (over === key) setOver(null); }}
              onDrop={drop}
              onMove={moveTo}
              every={every}
              onEvery={(key) => setEvery((e) => ({ ...e, [key]: true }))}
            />
          ) : (
            <Table
              budget={rowBudget}
              noun="person"
              columns={tableColumns}
              ctx={ctx}
              selectable={selectable}
              sel={sel}
              onToggle={toggleSel}
              onToggleAll={toggleAll}
              rows={shown}
              sections={sections}
              total={total}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={onSort}
              onOpen={openPeek}
              filtered={searching}
              onClearFilters={() => setQ("")}
              cursor={cursor}
              onCursor={setCursor}
              rowClass={phone ? pipeCardRow : null}
              scrolled={scrolledX}
              onScrolled={setScrolledX}
              empty={emptyWords}
            />
          )}
        </div>
        {/* The peek, beside the rows on a desk and the whole screen on a phone (leads.css .pl-peek). */}
        {peekVm && Peek ? (
          <Peek
            vm={peekVm}
            person={person}
            failed={peek && peek.id === peekId ? peek.failed : null}
            canRecord={canRecord}
            phone={phone}
            onClose={closePeek}
            onRetry={() => setPeekTry((n) => n + 1)}
            onOpenPage={() => pageRef.current(peekVm.id)}
            onOpenThread={() => nav(window.CHANLY.R.thread(peekVm.thread))}
            onCompose={(text) => pipeComposeIn(person, text, nav)}
          />
        ) : null}
        {/* A phone's views: the rail's rows as a sheet, a pick closes it. */}
        {phone && listsOpen && window.PeopleListsSheet ? (
          <window.PeopleListsSheet title={words.rail.sheet} onClose={() => setListsOpen(false)}>
            <aside className="cl-rail pipe-rail" data-testid="pipeline-rail">
              <PipelineRailRows sections={rail} view={view} onPick={pickView} />
            </aside>
          </window.PeopleListsSheet>
        ) : null}
        {newOpen && New ? (
          <New
            phone={phone}
            rows={rows}
            q={newQ}
            add={newAdd}
            onQ={setNewQ}
            onPick={pickForNew}
            onAddOpen={() => { setNewAdd({ ...EMPTY_ADD, open: true }); setNewFocus({ row: "add" }); }}
            focusOn={newFocus}
            onAddDraft={(patch) => setNewAdd((d) => ({ ...d, ...patch }))}
            onAdd={addForNew}
            onClose={() => { setNewOpen(false); setNewAdd(EMPTY_ADD); }}
          />
        ) : null}
        {/* A selection: People's own bar, with the Pipeline's Mark as passed first and People's lists and export. */}
        {picked.length > 0 && window.PeopleBulkBar ? (
          <window.PeopleBulkBar
            sel={sel}
            rows={shown.map((r) => r.person)}
            saved={people.saved || []}
            savedRead={people.savedRead !== false}
            canEdit={canRecord}
            canExport={canExport}
            onClear={clearSelection}
            onKeep={(rest) => setSel(new Set(rest))}
            flash={plFlash}
            acts={PIPE_BULK_ACTS}
            lead={window.PipelinePassMany ? <window.PipelinePassMany rows={picked} flash={plFlash} onDone={(left) => setSel(new Set(left))} /> : null}
          />
        ) : null}
        {toastNode}
      </div>
    </div>
  );
};

Object.assign(window, { PipelineScope });
