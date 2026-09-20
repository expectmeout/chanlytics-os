/* global React, Icon, MoreMenu, Confirm, EmptyState, FailedRead, PeopleRail, PeopleStanding, PeopleTable,
   PeopleColumnsMenu, plSortKeys, plDrawnColumns, plColumnOptions, PL_NO_SEL, LeadFinder, LeadStrip, LeadPeek,
   LeadsFirstDay */
// The Leads scope of People: the rail's lead rows and its kept searches, the standing line, the controls, the
// table drawn with LEAD_COLUMNS, the bulk bar, and the three classes (Qualified · Needs review · Excluded).
//
// Hookless, every one of them: the page's one stub-React call order is ClientsAReal's, and this file's components
// are drawn inside it (people-honest's harness keys hooks by call order). Every piece of state here is the page's
// and arrives as a prop; every act goes out through the courier the bridge installed (legacy-bridge/leads.ts).
//
// Nothing here names the vendor: the owner sees Claude finding businesses, and where each fact came from.

/* ------------------------------------------------------------------ the row */

// The row's acts: Call and Copy on every row, on hover and on the keyboard's cursor; and the class's own three
// (§8.7, S9): Keep and Exclude move a place out of Needs review, Put back is the owner's override of an
// exclusion. All three count, so all three are the owner's permission `find`; anyone else sees them on the page,
// in the tab order, saying why when pressed (window.gate, data-bits.jsx), never disabled and never silent.
const LeadRowActions = ({ l, onCall, onCopy, onKeep, onExclude, onPutBack, canFind }) => (
  <span className="cl-row-actions ld-row-actions">
    {l.phone && !l.phoneWrong && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onCall(l.id); }} title="Call from your phone" aria-label={`Call ${l.name}`} data-testid="lead-call"><Icon name="phone" size={11} /></button>}
    {l.email && l.emailState !== "invalid" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onCopy(l.id); }} title="Copy the email" aria-label={`Copy ${l.name}'s email`} data-testid="lead-copy"><Icon name="copy" size={11} /></button>}
    {l.cls === "review" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onKeep(l.id); }} data-testid="lead-keep" {...(canFind ? {} : window.gate("find", "keep this lead"))}>Keep</button>}
    {l.cls === "review" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onExclude(l.id); }} data-testid="lead-exclude" {...(canFind ? {} : window.gate("find", "exclude this lead"))}>Exclude</button>}
    {l.cls === "excluded" && <button type="button" className="btn btn-ghost btn-xs" onClick={(e) => { e.stopPropagation(); onPutBack(l.id); }} data-testid="lead-put-back" {...(canFind ? {} : window.gate("find", "put this lead back"))}>Put back</button>}
  </span>
);

// The shape beside an email's address, so its state is not colour alone (§6.7): a check for a mailbox that
// answered, a dashed ring for one that cannot be told apart from any other (catch_all: "Unconfirmed", S12), a
// question for a server that would not answer, a cross for one that bounces, a turning ring while it is checked,
// and nothing at all when there is no address.
//
// It is drawn, not named: `icons.jsx` has no `help`, `xcircle`, `spin` or `minus`, and an unknown name renders a
// plain circle (`icons.jsx:73`), which would say the same thing about five different states. Five inline paths in
// one component instead of five names that do not exist.
//
// **This is the one LeadShape in the release.** Task 12's peek draws the same component from `window` (its email
// line is `<LeadShape state={vm.reach.email.state} />`) and declares no second one: `leads-peek.jsx` loads after
// `leads-scope.jsx`, so a second declaration would silently take this one's place.
const LD_SHAPE_CHECK = "M3.5 8.5l3 3 6-6.5";
const LeadShape = ({ state, word, size = 13 }) => {
  const p = { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  const wrap = (kids, extra) => <span className={`ld-shape ld-shape-${state}${extra ? ` ${extra}` : ""}`} title={word || undefined}><svg {...p}>{kids}</svg></span>;
  if (state === "ok") return wrap(<path d={LD_SHAPE_CHECK} />);
  if (state === "catch_all") return wrap(<circle cx="8" cy="8" r="5.5" strokeDasharray="2.5 2.5" />);
  if (state === "unknown") return wrap(<><path d="M6 6.2a2 2 0 113 1.8v1" /><circle cx="8" cy="11.6" r="0.8" fill="currentColor" stroke="none" /></>);
  if (state === "invalid") return wrap(<><circle cx="8" cy="8" r="5.5" /><path d="M5.5 10.5l5-5" /></>);
  if (state === "checking") return wrap(<circle cx="8" cy="8" r="5.5" strokeDasharray="17 17" />, "spin");
  return null;
};

// The identity cell: the mark, the name (which peeks), a second location said, and the kind and the area.
const ldBusinessCell = (l, x) => (
  <td key="business" className="cl-name-cell pl-pin ld-biz-cell">
    <div className="cl-row-name">
      <span className="ld-mark" aria-hidden="true">{l.mark}</span>
      <div className="cl-row-name-block">
        <div className="cl-row-fullname">
          <button type="button" className="ld-biz-name" onClick={(e) => { e.stopPropagation(); x.onOpen(l.id); }} data-testid="lead-name">{l.name}</button>
          {l.places > 1 && <span className="ld-badge" title="Two listings on the map for one business">{l.places} locations</span>}
        </div>
        <div className="cl-row-meta"><span>{l.category}</span><span className="dot" /><span>{l.area}</span></div>
      </div>
      <LeadRowActions l={l} onCall={x.onCall} onCopy={x.onCopy} onKeep={x.onKeep} onExclude={x.onExclude} onPutBack={x.onPutBack} canFind={x.canFind} />
    </div>
  </td>
);

// PRD §6.2's Leads columns, in the shape the table takes (people-table.jsx): { key, label, sortable, pinned,
// fixed, on, needs, cell(l, x) }. The six that sort are the six `leads_page` takes (Task 4).
const LEAD_COLUMNS = [
  { key: "business", label: "Business", sortable: true, pinned: true, cell: ldBusinessCell },
  { key: "fit", label: "Fit", sortable: true, cell: (l) => <td key="fit" className={`shrink ld-fit-cell ${l.cls}`} title={l.fitTitle} data-testid="lead-fit">{l.fitLabel}</td> },
  { key: "email", label: "Email", sortable: false, cell: (l) => <td key="email" className="shrink ld-email-cell" title={l.emailWord} data-testid="lead-email">{l.cls === "excluded" ? <span className="dim">Not checked</span> : <><LeadShape state={l.emailState} word={l.emailWord} />{l.emailLabel}</>}</td> },
  { key: "phone", label: "Phone", sortable: false, cell: (l) => <td key="phone" className={`shrink ld-phone-cell ${l.phoneWrong ? "wrong" : ""}`} data-testid="lead-phone">{l.phone}{l.phoneAgrees && <span className="ld-tick2" title="Maps and their website agree">✓✓</span>}</td> },
  { key: "why", label: "Why it fits", sortable: false, cell: (l) => <td key="why" className="dim ld-why-cell" title={l.why}>{l.why}</td> },
  { key: "rating", label: "Rating", sortable: true, cell: (l) => <td key="rating" className="shrink ld-rating-cell">{l.rating}</td> },
  { key: "stage", label: "Stage", sortable: true, cell: (l) => <td key="stage" className="shrink ld-stage-cell" data-testid="lead-stage">{l.cls !== "excluded" && <><span className={`ld-dot ${l.stage}`} aria-hidden="true" />{l.stageLabel}</>}</td> },
  { key: "found", label: "Found", sortable: true, cell: (l) => <td key="found" className="shrink dim ld-found-cell" title={l.foundAt}>{l.foundLabel}</td> },
  { key: "distance", label: "Distance", sortable: true, needs: (x) => x.hasCenter, on: (x) => x.hasCenter, cell: (l) => <td key="distance" className="shrink dim ld-distance-cell">{l.distance}</td> },
  { key: "source", label: "Source", sortable: false, on: false, cell: (l) => <td key="source" className="shrink dim ld-source-cell">{l.source}</td> },
  { key: "website", label: "Website", sortable: false, on: false, cell: (l) => <td key="website" className="shrink dim ld-website-cell">{l.host}</td> },
  { key: "search", label: "Search", sortable: false, on: false, cell: (l) => <td key="search" className="shrink dim ld-search-cell">{l.searchName}</td> },
  { key: "actions", label: "", sortable: false, fixed: true, cell: () => <td key="actions" className="shrink cl-actions-cell" /> },
];
// business, fit, rating, stage, found, distance: what a saved Leads view may sort by.
const LEAD_SORT_KEYS = plSortKeys(LEAD_COLUMNS);

/* ------------------------------------------------------- the rail's searches */

// The rail under Leads: the lists, then the searches, each with its count, a live dot while it runs and a "?" in
// the accent while it waits on the owner. The search's own menu is Task 16's.
const LeadsRailRows = ({ rail, list, searchId, canFind, onPickList, onPickSearch, onNew }) => (
  <>
    <div className="cl-rail-section" data-testid="leads-lists">
      <div className="cl-rail-group-label">Leads</div>
      {rail.lists.map((l) => (
        <button key={l.id} type="button" className={`cl-rail-row ${list === l.id && !searchId ? "active" : ""}`} onClick={() => onPickList(l.id)} data-testid={`leads-list-${l.id}`}>
          <span className="label">{l.label}</span>
          <span className="count">{l.count}</span>
        </button>
      ))}
    </div>
    <div className="cl-rail-section" data-testid="leads-searches">
      <div className="cl-rail-group-label">Searches</div>
      {rail.searches.map((s) => (
        <div key={s.id} className={`cl-rail-row ld-search-row ${searchId === s.id ? "active" : ""}`}>
          <button type="button" className="ld-search-pick" onClick={() => onPickSearch(s.id)} data-testid={`leads-search-${s.id}`}>
            {s.mark === "live" && <span className="live-dot" aria-hidden="true" />}
            {s.mark === "question" && <span className="rail-q" title="This search needs you">?</span>}
            <span className="label">{s.name}</span>
            <span className="count">{s.count}</span>
          </button>
        </div>
      ))}
      {rail.searches.length === 0 && <div className="cl-rail-hint">No searches yet. Describe the businesses you want and Claude finds them.</div>}
    </div>
    <div className="cl-rail-foot">
      <button type="button" className="cl-rail-newseg" onClick={onNew} data-testid="leads-new-search" {...(canFind ? {} : window.gate("find", "find leads"))}>
        <Icon name="plus" size={11} /> New search
      </button>
    </div>
  </>
);

/* ------------------------------------------------- the three classes (§8.7) */

// Qualified · Needs review · Excluded, under the search that is open: each a count and a view (c-qualified,
// c-review, c-excluded). The class is not a stage (§9.1): it says whether the place met the plan.
const LEAD_CLASS_WORDS = { qualified: "Qualified", review: "Needs review", excluded: "Excluded" };
const LeadClassTabs = ({ counts, cls, onPick }) => (
  <div className="ld-classes" role="tablist" aria-label="What the search made of each place" data-testid="lead-classes">
    {["qualified", "review", "excluded"].map((k) => (
      <button key={k} type="button" role="tab" aria-selected={cls === k} className={`ld-class ${k} ${cls === k ? "on" : ""}`} onClick={() => onPick(cls === k ? null : k)} data-testid={`lead-class-${k}`}>
        {LEAD_CLASS_WORDS[k]} <span className="count">{counts[k]}</span>
      </button>
    ))}
  </div>
);

// The Excluded view's head: what each criterion left out, most first, each one narrowing the rows (§8.7). The
// counts are the loaded rows' own `excludedBy` (lead_search_members.excluded_by, said in words by toLeadRowVM),
// so the chips say what is on screen.
const ldExcludedChips = (rows) => {
  const by = new Map();
  for (const l of rows) if (l.cls === "excluded" && l.excludedBy) by.set(l.excludedBy, (by.get(l.excludedBy) || 0) + 1);
  return [...by.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
};
const LeadExcludedChips = ({ chips, active, onPick }) => (
  chips.length === 0 ? null : (
    <div className="ld-chips" data-testid="lead-excluded-chips">
      {chips.map((c) => (
        <button key={c.key} type="button" className={`ld-chip ${active === c.key ? "on" : ""}`} aria-pressed={active === c.key} onClick={() => onPick(active === c.key ? null : c.key)} data-testid={`lead-chip-${c.key}`}>
          {c.key} <span className="count">{c.count}</span>
        </button>
      ))}
    </div>
  )
);

/* --------------------------------------------------------------- the bulk bar */

// What a selection of leads can become (§6.4, S13): their emails on the clipboard, all contacted, all not a fit,
// a file. Each acts on the rows shown AND selected; the header box's "Select all N that match" hands the view's
// filters to the server instead of a list of ids, so a view of 1,240 does not become 1,240 ids in a request.
const LeadsBulkBar = ({ sel, rows, total, view, canFind, canExport, busy, whyNot, onClear, onSelectAllMatching, allMatching, onCopyEmails, onContacted, onNotAFit, exportHref }) => {
  const picked = rows.filter((l) => sel.has(l.id));
  const ids = picked.map((l) => l.id);
  const count = allMatching ? total : ids.length;
  return (
    <div className="cl-bulk ld-bulk" role="toolbar" aria-label="Selected leads" data-testid="leads-bulk-bar">
      <span className="cl-bulk-count"><b>{count}</b> selected</span>
      {!allMatching && total > rows.length && (
        <button type="button" className="cl-bucket-link" onClick={onSelectAllMatching} data-testid="leads-select-matching">Select all {total.toLocaleString()} that match</button>
      )}
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onCopyEmails(picked)} data-testid="leads-bulk-copy"><Icon name="copy" size={12} /> Copy emails</button>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onContacted(allMatching ? { by: "view", action: "contacted", view } : { by: "ids", action: "contacted", ids })} data-testid="leads-bulk-contacted" {...(canFind ? {} : window.gate("find", "mark these leads contacted"))}><Icon name="check" size={12} /> Mark contacted</button>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onNotAFit(allMatching ? { by: "view", action: "not_a_fit", view } : { by: "ids", action: "not_a_fit", ids })} data-testid="leads-bulk-not-a-fit" {...(canFind ? {} : window.gate("find", "mark these leads not a fit"))}><Icon name="ban" size={12} /> Not a fit</button>
      {canExport
        ? <a className="btn btn-sm" href={exportHref} download title="Download these leads as a CSV file" data-testid="leads-bulk-export"><Icon name="external" size={12} /> Export</a>
        : <button type="button" className="btn btn-sm" {...window.gate("export", "export these leads")} data-testid="leads-bulk-export"><Icon name="external" size={12} /> Export</button>}
      {whyNot && <span className="cl-prof-aut-hint">{whyNot}</span>}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} data-testid="leads-bulk-clear"><Icon name="x" size={11} /> Clear</button>
    </div>
  );
};

/* ------------------------------------------------------------ the scope itself */

const LeadsScope = (p) => {
  const L = p.surface;
  const rail = p.rail;
  const standing = p.standing;
  const chips = ldExcludedChips(L.rows);
  const search = p.search;
  return (
    <div className="clients leads-scope">
      <PeopleRail scope="leads" onScope={p.onScope}>
        <LeadsRailRows
          rail={rail}
          list={p.view.list}
          searchId={p.view.searchId}
          canFind={p.canFind}
          onPickList={p.onPickList}
          onPickSearch={p.onPickSearch}
          onNew={p.onFind}
        />
      </PeopleRail>

      <div className="cl-main">
        <div className="cl-main-scroll pl-main" ref={p.scrollRef}>
          <PeopleStanding scope="leads" leads={standing} onNeeds={p.onNeedsYou} onScope={p.onScope} />

          <div className="cl-controls">
            <div className="cl-search-wrap">
              <Icon name="search" size={13} />
              <input ref={p.searchRef} placeholder="Search leads" aria-label="Search leads" value={p.q} onChange={(e) => p.onQ(e.target.value)} />
              <span className="kbd">/</span>
            </div>
            <div className="cl-controls-right">
              <PeopleColumnsMenu open={p.colsOpen} onOpenChange={p.onColsOpen} options={p.colOptions} onPick={p.onPickColumn} buttonRef={p.colsButton} />
              {p.canExport
                ? <a className="btn btn-ghost btn-sm" href={p.exportHref} download title="Download these leads as a CSV file" data-testid="leads-export"><Icon name="external" size={12} /> Export</a>
                : <button type="button" className="btn btn-ghost btn-sm" {...window.gate("export", "export these leads")} data-testid="leads-export"><Icon name="external" size={12} /> Export</button>}
              <button type="button" className="btn btn-primary btn-sm" onClick={p.onFind} data-testid="leads-find" {...(p.canFind ? {} : window.gate("find", "find leads"))}>
                <Icon name="sparkle" size={12} /> Find leads <span className="kbd">F</span>
              </button>
            </div>
          </div>

          {p.finderOpen && (
            <LeadFinder
              open
              stage={p.finderStage}
              words={p.finderWords}
              proposal={p.finderProposal}
              refusal={p.finderRefusal}
              busy={p.finderBusy}
              suggestions={L.suggestions}
              talk={p.talk}
              onWords={p.onFinderWords}
              onPlan={p.onFinderPlan}
              onApprove={p.onFinderApprove}
              onBack={p.onFinderBack}
              onClose={p.onCloseFinder}
            />
          )}

          {search && <LeadStrip vm={p.strip} onAction={p.onStripAction} />}

          {search && <LeadClassTabs counts={{ qualified: search.round.qualified, review: search.round.review, excluded: search.round.excluded }} cls={p.view.cls} onPick={p.onPickClass} />}
          {p.view.cls === "excluded" && <LeadExcludedChips chips={chips} active={p.chip} onPick={p.onPickChip} />}

          {L.readFailed
            ? <FailedRead kind="block" what="your leads" surface="leads" testid="leads-failed" />
            : (
              <PeopleTable
                noun="lead"
                columns={p.columns}
                ctx={p.cellCtx}
                rows={p.rows}
                total={p.total}
                sortBy={p.sortBy}
                sortDir={p.sortDir}
                onSort={p.onSort}
                onOpen={p.onPeek}
                filtered={p.filtered}
                onClearFilters={p.onClearFilters}
                selectable={p.canFind || p.canExport}
                sel={p.sel}
                onToggle={p.onToggle}
                onToggleAll={p.onToggleAll}
                cursor={p.cursor}
                onCursor={p.onCursor}
                scrolled={p.scrolled}
                onScrolled={p.onScrolled}
                empty={p.empty}
              />
            )}
          {L.next && (
            <div className="cl-section-sub" style={{ padding: "8px 0 16px" }} data-testid="leads-more">
              {p.rows.length.toLocaleString()} of {p.total.toLocaleString()} loaded{" "}
              <button type="button" className="btn btn-ghost btn-sm" disabled={p.loadingMore} onClick={p.onMore} data-testid="leads-more-btn">{p.loadingMore ? "Loading…" : "Show more"}</button>
            </div>
          )}
        </div>
        {p.sel.size > 0 && p.rows.some((l) => p.sel.has(l.id)) && (
          <LeadsBulkBar
            sel={p.sel}
            rows={p.rows}
            total={p.total}
            view={p.bulkView}
            canFind={p.canFind}
            canExport={p.canExport}
            busy={p.bulkBusy}
            whyNot={p.canFind ? null : "Only an owner can change leads."}
            allMatching={p.allMatching}
            onSelectAllMatching={p.onSelectAllMatching}
            onClear={p.onClearSel}
            onCopyEmails={p.onCopyEmails}
            onContacted={p.onBulk}
            onNotAFit={p.onBulk}
            exportHref={p.exportHref}
          />
        )}
        {/* The peek (Task 12): the page's state and its setters, so its own acts (LeadPeekActions) are built
            from them on every draw and nothing in leads-peek.jsx keeps state of its own. */}
        {p.peek && <LeadPeek vm={p.peek} mode={p.peekMode} armed={p.armed} draft={p.draft} busy={p.bulkBusy} flash={p.flash} onClose={p.onClosePeek} onMode={p.onPeekMode} onArmed={p.onArmed} onDraftState={p.onDraftState} onPeekId={p.onPeekId} onOpenPerson={p.onOpenPerson} onCall={p.onCall} onKeep={p.onKeep} onExclude={p.onExclude} onPutBack={p.onPutBack} onCopy={p.onCopy} />}
        {p.firstDay && <LeadsFirstDay suggestions={L.suggestions} onPick={p.onFinderWords} onFind={p.onFind} onBusinessLine={p.onBusinessLine} />}
        {p.toastNode}
      </div>
    </div>
  );
};

Object.assign(window, { LeadsScope, LeadsBulkBar, LeadRowActions, LeadShape, LeadsRailRows, LeadClassTabs, LeadExcludedChips, ldExcludedChips, LEAD_COLUMNS, LEAD_SORT_KEYS, LEAD_CLASS_WORDS });
