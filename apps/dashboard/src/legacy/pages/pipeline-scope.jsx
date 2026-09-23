/* global React, Icon, StatePill */
// People › Pipeline (docs/decisions/0008-a-proposal-is-part-of-the-deal.md): People's rows by where their deal stands
// -- consultations, proposals out, clients, and those who passed or ended -- under one line that says what is out and
// what it comes to. A view of People, never a page of its own: People's rail and switch, People's table in sections
// (people-table.jsx), People's person cell and phone card, the list page's two hooks (clients-a.jsx usePlControls and
// usePlPlace: the width, the words in the box, the keys, the place kept, the first rows), and the rows the People
// surface already holds, so nothing is fetched. Every word is contracts' (pipeline.ts, window.__pipeline); the page
// composes them and decides nothing. Drawn only where deals are on: anywhere else ClientsA draws People. Loaded before
// clients-a.jsx, which draws it, and it reads what that file publishes only as it draws.

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
  // What the keyboard's one listener reads: Enter opens the person under the cursor. Nothing here selects.
  keysWith({ open: onOpenProfile, canSelect: false, sheetOpen: false, closeSheet: null });
  // A row press and a cell's doors, behind one function and one object for the page's life: the rows are memoised
  // (people-table.jsx PeopleRowMemo), and the shell hands the page a new onOpenProfile on every route change.
  const openRef = React.useRef(onOpenProfile);
  openRef.current = onOpenProfile;
  const rowOpen = React.useCallback((id) => openRef.current(id), []);
  const ctx = React.useMemo(() => ({
    attention: null,
    onOpen: (id) => openRef.current(id),
    // Read a person before their row is pressed, as People's rows do.
    onWarm: (id) => { if (window.__warmPerson) window.__warmPerson(id); },
  }), []);
  const Rail = window.PeopleRail;
  const Bar = window.PeoplePhoneBar;
  const Table = window.PeopleTable;
  const onScope = (to) => nav(window.plScopeRoute(to));
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
            </div>
          )}
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
            onOpen={rowOpen}
            filtered={searching}
            onClearFilters={() => setQ("")}
            cursor={cursor}
            onCursor={setCursor}
            rowClass={phone ? pipeCardRow : null}
            scrolled={scrolledX}
            onScrolled={setScrolledX}
            empty={all.empty ? { title: words.empty.title, body: words.empty.body } : null}
          />
        </div>
        {toastNode}
      </div>
    </div>
  );
};

Object.assign(window, { PipelineScope });
