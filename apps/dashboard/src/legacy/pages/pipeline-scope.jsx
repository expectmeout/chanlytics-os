/* global React, Icon, StatePill */
// People › Pipeline (docs/decisions/0008-a-proposal-is-part-of-the-deal.md): People's rows by where their deal stands
// -- consultations, proposals out, clients, and those who passed or ended -- under one line that says what is out and
// what it comes to. A view of People, never a page of its own: People's rail and switch, People's table in sections
// (people-table.jsx), People's person cell and phone card, the list page's two hooks (clients-a.jsx usePlControls and
// usePlPlace: the width, the words in the box, the keys, the place kept, the first rows), and the rows the People
// surface already holds, so nothing is fetched. Every word is contracts' (pipeline.ts, window.__pipeline); the page
// composes them and decides nothing. Drawn only where deals are on: anywhere else ClientsA draws People. Loaded before
// clients-a.jsx, which draws it, and it reads what that file publishes only as it draws.
//
// And a workspace, not only a list ("the Pipeline is a workspace", 0008): a row opens its person's deal in a peek
// beside the rows (pipeline-peek.jsx), with the card's own acts -- a send into their thread, every other move into the
// one deal sheet -- and the two doors, their page and their thread; on a desk the rows can be a board instead
// (pipeline-board.jsx), whose cards drop into another column to ask the sheet for that move (contracts pipelineMove);
// and a teammate's move shows without a reload (the People surface repaints on the deals table).

// The table's columns: People's own person cell, then the deal's service, its value in tabular figures, how long it has
// stood where it is, and its one chip, whose heading only a screen reader hears (the house's .rec-sr): no one word is
// right for "Fri 2:00 PM" and "Since Sep 18" alike. Nothing sorts, since the order is the Pipeline's, and nothing
// hides. Made once, from contracts' headings, so the list page's memo sees one list from one draw to the next.
let PIPE_COLUMNS = null;
const pipeColumns = () => {
  if (PIPE_COLUMNS) return PIPE_COLUMNS;
  const w = window.__pipeline.words.columns;
  PIPE_COLUMNS = [
    { key: "name", label: w.person, sortable: false, pinned: true, cell: (r, x) => window.plNameCell(r.person, x) },
    { key: "service", label: w.service, sortable: false, cell: (r) => <td key="service" className="pipe-service" data-testid="pipe-service">{r.service || ""}</td> },
    { key: "value", label: w.value, sortable: false, cell: (r) => <td key="value" className="shrink tabular pipe-value" data-testid="pipe-value">{r.value || ""}</td> },
    { key: "stage", label: w.stage, sortable: false, cell: (r) => <td key="stage" className="shrink dim tabular pipe-stage" data-testid="pipe-in-stage">{r.inStage}</td> },
    { key: "chip", label: <span className="rec-sr">{w.chip}</span>, sortable: false, cell: (r) => <td key="chip" className="shrink pipe-chip">{r.chip ? <StatePill kind="tone" value={r.chip.tone} label={r.chip.words} testid="pipe-chip" /> : null}</td> },
  ];
  return PIPE_COLUMNS;
};

// A row on a phone is People's card (plRowCard): the face and the name with the chip beside them; the service under
// them; then the value and the time in stage.
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
      r.value ? <span key="value" className="pipe-card-value" data-testid="pipe-value">{r.value}</span> : null,
      r.inStage ? <span key="stage" className="pl-card-last" data-testid="pipe-in-stage">{r.inStage}</span> : null,
    ],
  });
};
let PIPE_PHONE_COLUMNS = null;
const pipePhoneColumns = () => PIPE_PHONE_COLUMNS || (PIPE_PHONE_COLUMNS = [{ key: "card", label: window.__pipeline.words.columns.person, sortable: false, pinned: true, cell: pipeCardCell }]);
const pipeCardRow = () => "pl-card-row";
// No sort to keep and none to start from: the headings do not sort, and the Pipeline's order is contracts'.
const PIPE_SORT = { by: null, dir: "asc" };
const pipeNoSort = () => {};
const PIPE_CTX = {};

// The view a member chose on this device, the list or the board: a desk's choice (a phone has the list), kept per
// viewer in the browser's storage and read in a try, as Leads keeps its Values choice (a private window may refuse).
const PIPE_VIEW_KEY = "pipeline.view";
const PIPE_VIEWS = ["list", "board"];
const pipeViewPref = () => { try { return window.localStorage && window.localStorage.getItem(PIPE_VIEW_KEY) === "board" ? "board" : "list"; } catch (e) { return "list"; } };
const pipeKeepView = (v) => { try { if (window.localStorage) window.localStorage.setItem(PIPE_VIEW_KEY, v); } catch (e) { /* a private window: the choice lives for the page */ } };
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

const PipelineScope = ({ onOpenProfile = () => {}, onNavigate = null }) => {
  const { usePeople, usePlControls, usePlPlace } = window;
  const people = usePeople();
  const nav = onNavigate || ((to) => window.CHANLY.nav(to));
  const words = window.__pipeline.words;
  // The workspace's zone, as every day on People is said (legacy-bridge/zone.ts).
  const tz = window.__clock && window.__clock.zone ? window.__clock.zone() : "UTC";
  // One clock with the rows: the surface said each row's wait, its "since" and its valid-until at the moment it
  // published them (fetchedAt), so the Pipeline groups and counts at that same moment, and a proposal's "8 d" in its
  // chip and its row never disagree across midnight.
  const nowMs = people.fetchedAt || Date.now();
  const controls = usePlControls({ scope: "pipeline", cols: pipeColumns(), phoneCols: pipePhoneColumns(), colCtx: PIPE_CTX, people, sortFirst: PIPE_SORT, keepsView: false });
  const { phone, searchOpen, setSearchOpen, toastNode, q, setQ, searchRef, scrollRef, columns, scrolledX, setScrolledX } = controls;
  // The groups the member opened, or folded again, by key. One they never touched is as the Pipeline starts it.
  const [opened, setOpened] = React.useState({});
  // The list or the board; the board is a desk's.
  const [view, setView] = React.useState(pipeViewPref);
  // The peek: who is open beside the rows, and the person as read for it -- the tab's copy at once (__peekPerson),
  // read again behind it (__personDetail), and again after a deal is recorded on them. `peekTry` asks for the read
  // again after one failed.
  const [peekId, setPeekId] = React.useState(null);
  const [peek, setPeek] = React.useState(null);
  const [peekTry, setPeekTry] = React.useState(0);
  // The board's drag: the card in hand (its row and the group it left) and the column under it.
  const [drag, setDrag] = React.useState(null);
  const [over, setOver] = React.useState(null);
  const rows = people.rows;
  // The whole Pipeline says the line over the table; the words in the box choose only which rows show under it.
  const all = React.useMemo(() => window.__pipeline.of(rows, nowMs, tz), [rows, nowMs, tz]);
  const vm = React.useMemo(() => {
    const match = window.plMatcher(q);
    return match ? window.__pipeline.of(rows.filter(match), nowMs, tz) : all;
  }, [all, rows, nowMs, tz, q]);
  // Past the people People holds (its fifty pages), the line counts only the loaded, and says so in People's words.
  const summary = people.page && people.page.has_more ? [...all.summary, window.plLoadedWords(rows.length, people.page.total)] : all.summary;
  const searching = !!q.trim();
  // A search opens every group: someone looked for is someone shown.
  const sections = vm.groups.map((g) => {
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
  const shown = sections.filter((s) => !s.collapsed).flatMap((s) => s.rows);
  const ids = shown.map((r) => r.id);
  const total = all.groups.reduce((n, g) => n + g.count, 0);
  const { cursor, setCursor, rowBudget, keysWith } = usePlPlace({ controls, page: "pipeline", view: "all", ids, noun: "person", selectionOf: "pipeline" });
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
  // What the keyboard's one listener reads: Enter opens the peek for the person under the cursor, Esc closes it, and
  // J and K keep walking the rows behind it. Nothing here selects.
  keysWith({ open: openPeek, canSelect: false, sheetOpen: false, closeSheet: null, peekOpen: !!peekId, closePeek });
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
  const peekVm = peekRow ? window.__pipeline.peek(peekRow.row, peekRow.group) : null;
  // A row press and a cell's doors, behind one function and one object for the page's life: the rows are memoised
  // (people-table.jsx PeopleRowMemo), and the shell hands the page a new onOpenProfile on every route change.
  const pageRef = React.useRef(onOpenProfile);
  pageRef.current = onOpenProfile;
  const ctx = React.useMemo(() => ({
    attention: null,
    onOpen: openPeek,
    // Read a person before their row is pressed, as People's rows do: the peek then opens on the tab's copy.
    onWarm: (id) => { if (window.__warmPerson) window.__warmPerson(id); },
  }), [openPeek]);
  // The board: every group as a column, those with nobody in them too, so a card has somewhere to drop.
  const canRecord = pipeCanRecord();
  const board = !phone && view === "board" && !all.empty;
  const boardColumns = board
    ? Object.keys(words.groups).map((key) => sections.find((s) => s.key === key) || { key, label: words.groups[key], meta: null, rows: [], collapsed: false, onToggle: null, toggle: null })
    : null;
  const moveOf = window.__pipeline.move;
  const dragEnd = () => { setDrag(null); setOver(null); };
  // A drop asks the one sheet for the move; the sheet records it, and the rows follow the record (deal:recorded, and
  // the People surface's own re-read).
  const drop = (to) => {
    const d = drag;
    dragEnd();
    const mv = d ? moveOf(d.from, to, d.row) : null;
    if (mv && window.openDealSheet) window.openDealSheet({ personId: d.id, mode: mv.mode, dealId: mv.dealId });
  };
  const Rail = window.PeopleRail;
  const Bar = window.PeoplePhoneBar;
  const Table = window.PeopleTable;
  const Board = window.PipelineBoard;
  const Peek = window.PipelinePeek;
  const onScope = (to) => nav(window.plScopeRoute(to));
  const person = peek && peek.id === peekId ? peek.person : null;
  return (
    <div className="clients pipe-scope" data-testid="pipeline">
      {/* People's rail with the switch at its head; its lists open on People. A phone's is the bar's switch. */}
      {!phone && (
        <Rail
          scope="pipeline"
          dealsOn
          onScope={onScope}
          lists={people.lists}
          groups={people.groups || undefined}
          active={null}
          onPick={(id) => nav(`clients/seg:${id}`)}
          saved={people.saved || []}
          activeSaved={null}
          onPickSaved={(id) => nav(`clients/list:${id}`)}
          savedRead={people.savedRead !== false}
        />
      )}
      <div className="cl-main">
        <div className="cl-main-scroll pl-main" ref={scrollRef}>
          {/* A phone's one bar: the switch and search. The Pipeline is one view, so there is no list to pick. */}
          {phone && (
            <Bar
              scope="pipeline"
              dealsOn
              onScope={onScope}
              q={q}
              onQ={setQ}
              searchRef={searchRef}
              searchOpen={searchOpen}
              onSearchOpen={setSearchOpen}
              searchLabel={window.PL_SEARCH_LABEL}
              testid="pipeline"
            />
          )}
          {/* The line over the table, People's standing line in its parts: only the parts that have something. */}
          {summary.length > 0 && (
            <div className="pl-standing" data-testid="pipeline-summary">
              <span className="pl-standing-total">{summary[0]}</span>
              {summary.slice(1).map((part, i) => (
                <span key={i} className="pl-standing-part">
                  <span className="pl-standing-dot" aria-hidden="true">·</span>
                  <span className="pl-standing-reached">{part}</span>
                </span>
              ))}
            </div>
          )}
          {!phone && (
            <div className="cl-controls">
              <div className="cl-search-wrap">
                <Icon name="search" size={13} />
                <input ref={searchRef} placeholder={`${window.PL_SEARCH_LABEL}…`} aria-label={window.PL_SEARCH_LABEL} value={q} onChange={(e) => setQ(e.target.value)} data-testid="pipeline-search" />
                <span className="kbd">/</span>
              </div>
              {/* The list or the board: the house's small tab pair, a pressed state each, kept on this device. */}
              <div className="cl-controls-right">
                <div className="cl-tabs pipe-views" role="group" aria-label={words.views.label} data-testid="pipeline-views">
                  {PIPE_VIEWS.map((v) => (
                    <button key={v} type="button" className={`cl-tab${view === v ? " active" : ""}`} aria-pressed={view === v} onClick={() => { setView(v); pipeKeepView(v); }} data-testid={`pipeline-view-${v}`}>{words.views[v]}</button>
                  ))}
                </div>
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
            />
          ) : (
            <Table
              budget={rowBudget}
              noun="person"
              columns={columns}
              ctx={ctx}
              rows={shown}
              sections={sections}
              total={total}
              sortBy={null}
              sortDir="asc"
              onSort={pipeNoSort}
              onOpen={openPeek}
              filtered={searching}
              onClearFilters={() => setQ("")}
              cursor={cursor}
              onCursor={setCursor}
              rowClass={phone ? pipeCardRow : null}
              scrolled={scrolledX}
              onScrolled={setScrolledX}
              empty={all.empty ? { title: words.empty.title, body: words.empty.body } : null}
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
        {toastNode}
      </div>
    </div>
  );
};

Object.assign(window, { PipelineScope });
