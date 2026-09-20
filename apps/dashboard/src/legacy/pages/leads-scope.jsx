/* global React, Icon, MoreMenu, Confirm, EmptyState, FailedRead, PeopleRail, PeopleStanding, PeopleTable,
   PeopleColumnsMenu, plSortKeys, plDrawnColumns, plColumnOptions, PL_NO_SEL, LeadFinder, LeadStrip, LeadPeek,
   LeadPeekActions, LeadNotFitWhy, LeadsFirstDay */
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
    {l.phone && !l.phoneWrong && <button type="button" className="btn btn-ghost btn-xs ld-call" onClick={(e) => { e.stopPropagation(); onCall(l.id); }} title="Call from your phone" aria-label={`Call ${l.name}`} data-testid="lead-call"><Icon name="phone" size={11} /></button>}
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
      <span className="ld-mark" aria-hidden="true">{l.image ? <img src={l.image} alt="" loading="lazy" /> : l.mark}</span>
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
  // Both contacts in one glance (D2): the email's state as its shape and word, the number with its double tick, so
  // "has both" is scannable down fifty rows. Hover for the address; click copies it. A left-out place shows neither.
  { key: "reach", label: "Reach", sortable: false, cell: (l, x) => (
    <td key="reach" className="shrink ld-reach-cell" data-testid="lead-reach">
      {l.cls === "excluded" ? <span className="dim">Not checked</span> : (
        <>
          {l.reach.email
            ? <button type="button" className="ld-reach-email" title={`${l.reach.email.address} · ${l.reach.email.word}`} onClick={(e) => { e.stopPropagation(); x.onCopy(l.id); }} data-testid="lead-reach-email"><LeadShape state={l.reach.email.state} word={l.reach.email.word} />{l.reach.email.word}</button>
            : <span className="dim" data-testid="lead-reach-email">No email</span>}
          <span className="dot" />
          {l.reach.phone
            ? <span className={`ld-reach-phone ${l.phoneWrong ? "wrong" : ""}`} data-testid="lead-reach-phone">{l.reach.phone.number}{l.reach.phone.agrees && <span className="ld-tick2" title="Maps and their website agree">✓✓</span>}</span>
            : <span className="dim" data-testid="lead-reach-phone">No phone</span>}
        </>
      )}
    </td>
  ) },
  { key: "why", label: "Why it fits", sortable: false, cell: (l) => <td key="why" className="dim ld-why-cell" title={l.why}>{l.why}</td> },
  { key: "rating", label: "Rating", sortable: true, cell: (l) => <td key="rating" className="shrink ld-rating-cell" title={l.reviewsTitle || undefined}>{l.rating}</td> },
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

// A kept search says what was asked (§8.10). The menu closes after each item (MoreMenu), and every item is a
// route: nothing here renames or removes on the spot.
const LeadSearchMenu = ({ s, words, canFind, onRename, onMore, onAgain, onRemove, onUndo, exportHref }) => (
  <MoreMenu
    align="left"
    title={`What ${s.name} asked for`}
    btnClass="btn btn-ghost btn-icon btn-xs ld-search-more"
    items={[
      { header: words.askedLine },
      { label: "Rename", icon: "pencil", onClick: () => onRename(s), gate: canFind ? undefined : window.gate("find", "rename this search") },
      { label: "Find new ones", icon: "refresh", meta: "Only places not already in your leads count", onClick: () => onMore(s), gate: canFind ? undefined : window.gate("find", "search again") },
      { label: "Search again, changed", icon: "sparkle", meta: "Opens the plan with what you asked", onClick: () => onAgain(s), gate: canFind ? undefined : window.gate("find", "search again") },
      { label: `Export these ${s.count}`, icon: "external", onClick: () => { if (exportHref) window.open(exportHref, "_self"); }, gate: canFind ? undefined : window.gate("find", "export these leads") },
      // For a day after a round ends: the leads nobody has touched leave and the month is credited (§8.6). Named
      // for what it does; the toast it answers with carries its own Undo, which puts them back.
      ...(s.undoable ? [{ label: "Remove the ones you haven't touched", icon: "undo", meta: `Up to ${s.count} given back this month`, onClick: () => onUndo(s), gate: canFind ? undefined : window.gate("find", "remove these leads") }] : []),
      { divider: true },
      { label: "Remove this search", icon: "x", danger: true, meta: words.keepsLine, onClick: () => onRemove(s), gate: canFind ? undefined : window.gate("find", "remove this search") },
    ]}
  />
);

// The rail under Leads: the lists, then the searches, each with its count, a live dot while it runs and a "?" in
// the accent while it waits on the owner. Renaming and removing are asked where the search is, so the rail never
// loses the row that is being named.
const LeadsRailRows = ({ rail, list, searchId, canFind, wordsFor, onPickList, onPickSearch, renaming, onRename, onRenameSave, onRenameCancel, removing, onRemoveAsk, onRemoveYes, onRemoveNo, removeBusy, removeError, onMore, onAgain, onUndo, hrefFor, onNew }) => (
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
          {renaming && renaming.id === s.id ? (
            <span className="cl-bulk-naming ld-search-renaming">
              <input autoFocus defaultValue={s.name} maxLength={80} aria-label="The search's name" data-testid="leads-rename-name" onKeyDown={(e) => { if (e.key === "Enter") onRenameSave(s, e.target.value); if (e.key === "Escape") onRenameCancel(); }} />
              <button type="button" className="btn btn-sm btn-primary" onClick={(e) => onRenameSave(s, e.currentTarget.parentNode.querySelector("input").value)} data-testid="leads-rename-save">Save</button>
            </span>
          ) : (
            <>
              <button type="button" className="ld-search-pick" onClick={() => onPickSearch(s.id)} data-testid={`leads-search-${s.id}`}>
                {s.mark === "live" && <span className="live-dot" aria-hidden="true" />}
                {s.mark === "question" && <span className="rail-q" title="This search needs you">?</span>}
                <span className="label">{s.name}</span>
                <span className="count">{s.count}</span>
              </button>
              <LeadSearchMenu s={s} words={wordsFor(s.id)} canFind={canFind} onRename={onRename} onMore={onMore} onAgain={onAgain} onRemove={onRemoveAsk} onUndo={onUndo} exportHref={hrefFor(s)} />
            </>
          )}
          {removing && removing.id === s.id && (
            <Confirm question={`Remove “${s.name}”?`} detail={wordsFor(s.id).keepsLine} yes="Yes, remove" danger busy={removeBusy} error={removeError} onYes={() => onRemoveYes(s)} onNo={onRemoveNo} testid="leads-remove" />
          )}
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
const LeadsBulkBar = ({ sel, rows, total, view, canFind, canExport, busy, whyNot, onClear, onSelectAllMatching, allMatching, onCopyEmails, onContacted, onNotAFit, whyOpen, onWhyOpen, exportHref }) => {
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
      {/* The same five whys the peek asks, asked once for the whole selection: LeadNotFitWhy is leads-peek.jsx's
          own list, published for this bar, so the words are spelled in one place (Task 15 step 4). */}
      <span className="ld-bulk-nf">
        <button type="button" className="btn btn-sm" disabled={busy} aria-haspopup="menu" aria-expanded={!!whyOpen} onClick={() => onWhyOpen(!whyOpen)} data-testid="leads-bulk-not-a-fit" {...(canFind ? {} : window.gate("find", "mark these leads not a fit"))}><Icon name="ban" size={12} /> Not a fit</button>
        {whyOpen ? <LeadNotFitWhy busy={busy} on={{ onWhy: (why) => onNotAFit(why, allMatching ? { by: "view", action: "not_a_fit", view } : { by: "ids", action: "not_a_fit", ids }) }} /> : null}
      </span>
      {canExport
        ? <a className="btn btn-sm" href={exportHref} download title="Download these leads as a CSV file" data-testid="leads-bulk-export"><Icon name="external" size={12} /> Export</a>
        : <button type="button" className="btn btn-sm" {...window.gate("export", "export these leads")} data-testid="leads-bulk-export"><Icon name="external" size={12} /> Export</button>}
      {whyNot && <span className="cl-prof-aut-hint">{whyNot}</span>}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} data-testid="leads-bulk-clear"><Icon name="x" size={11} /> Clear</button>
    </div>
  );
};

/* ---------------------------------------------------------------- the phone */

// The phone's one bar (<=900px, the band People's own cards begin at): the People | Leads switch, the list it is
// showing, search and Find. Nothing else sits above the rows -- no title, no sub-headline, no stat cards and no
// second control row (legacy/CLAUDE.md, the phone shows the work first).
const LeadsPhoneBar = ({ scope, onScope, listLabel, onLists, listsOpen, q, onQ, searchRef, onFind, canFind }) => (
  <div className="ld-bar" data-testid="leads-phone-bar">
    <div className="pt-scope" role="tablist" aria-label="Which people">
      <button type="button" role="tab" aria-selected={scope === "people"} className={scope === "people" ? "on" : ""} onClick={() => onScope("people")}>People</button>
      <button type="button" role="tab" aria-selected={scope === "leads"} className={scope === "leads" ? "on" : ""} onClick={() => onScope("leads")}>Leads</button>
    </div>
    <button type="button" className="ld-bar-lists" onClick={onLists} aria-expanded={!!listsOpen} data-testid="leads-phone-lists">
      {listLabel}
      <Icon name="chevron-down" size={11} />
    </button>
    <input
      ref={searchRef}
      className="ld-bar-search"
      type="search"
      value={q}
      placeholder="Search leads"
      aria-label="Search leads"
      data-testid="leads-phone-search"
      onChange={(e) => onQ(e.target.value)}
    />
    <button
      type="button"
      className="ld-bar-find"
      aria-label="Find leads"
      data-testid="leads-phone-find"
      onClick={onFind}
      {...(canFind ? {} : window.gate("find", "find businesses for you"))}
    >
      <Icon name="sparkle" size={20} />
    </button>
  </div>
);

// The finder, as a sheet from the bottom of a phone. No listener of its own: the page's one keydown listener
// closes the finder on Esc before anything else and holds every other key while it is open (Task 2), so a second
// listener here would take the key twice and close the finder and then the selection on one press.
const LeadFinderSheet = ({ onClose, children }) => (
  <>
    <div className="sb-sheet-backdrop" onClick={onClose} />
    <div className="sb-sheet pl-finder" role="dialog" aria-label="Find leads" data-testid="leads-finder-sheet">
      <div className="ld-sheet-handle" />
      {children}
    </div>
  </>
);

/* ------------------------------------------------------------ the scope itself */

const LeadsScope = (p) => {
  const L = p.surface;
  const rail = p.rail;
  const standing = p.standing;
  const chips = ldExcludedChips(L.rows);
  const search = p.search;
  // The same band People's cards use (clients.css) and the same one the page's listener judges the Columns menu
  // by. Read on every draw, not stored: a window resized past it must draw the other shape on the next state
  // change, and nothing here is a hook.
  const phone = !!(window.matchMedia && window.matchMedia("(max-width: 900px)").matches);
  const railRows = (
    <LeadsRailRows
          rail={rail}
          list={p.view.list}
          searchId={p.view.searchId}
          canFind={p.canFind}
          wordsFor={p.searchWordsFor}
          onPickList={p.onPickList}
          onPickSearch={p.onPickSearch}
          renaming={p.renaming}
          onRename={p.onRename}
          onRenameSave={p.onRenameSave}
          onRenameCancel={p.onRenameCancel}
          removing={p.removing}
          onRemoveAsk={p.onRemoveAsk}
          onUndo={p.onUndo}
          onRemoveYes={p.onRemoveYes}
          onRemoveNo={p.onRemoveNo}
          removeBusy={p.removeBusy}
          removeError={p.removeError}
          onMore={p.onFindNewOnes}
          onAgain={p.onSearchAgain}
      hrefFor={p.exportHrefFor}
      onNew={p.onFind}
    />
  );
  const ListsSheet = window.PeopleListsSheet;
  return (
    <div className="clients leads-scope">
      {/* At a phone's width the rail is the bar's list button instead (the stylesheet hides .cl-rail at 900px
          anyway, and the switch the rail heads is the bar's own). */}
      {!phone && <PeopleRail scope="leads" onScope={p.onScope}>{railRows}</PeopleRail>}

      <div className="cl-main">
        <div className="cl-main-scroll pl-main" ref={p.scrollRef}>
          {phone ? (
            <LeadsPhoneBar
              scope="leads"
              onScope={p.onScope}
              listLabel={p.railLabel}
              onLists={p.onLists}
              listsOpen={p.listsOpen}
              q={p.q}
              onQ={p.onQ}
              searchRef={p.searchRef}
              onFind={p.onFind}
              canFind={p.canFind}
            />
          ) : (
            <>
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
            </>
          )}

          {/* The finder folds out above the table on a desktop and comes up as a sheet from the bottom of a
              phone. `phone` changes two things inside the finder itself and nothing else (Task 8): hold-to-talk
              is the sheet's first control, and the input is full width under it. */}
          {!p.firstDay && p.finderOpen && (() => {
            const finder = (
              <LeadFinder
                open
                phone={phone}
                stage={p.finderStage}
                words={p.finderWords}
                proposal={p.finderProposal}
                plan={p.finderPlan}
                trace={p.finderTrace}
                pick={p.finderPick}
                refusal={p.finderRefusal}
                busy={p.finderBusy}
                suggestions={L.suggestions}
                talk={p.talk}
                onWords={p.onFinderWords}
                onPlan={p.onFinderPlan}
                onChangePlan={p.onFinderChangePlan}
                onPick={p.onFinderPick}
                onApprove={p.onFinderApprove}
                onBack={p.onFinderBack}
                onClose={p.onCloseFinder}
              />
            );
            return phone ? <LeadFinderSheet onClose={p.onCloseFinder}>{finder}</LeadFinderSheet> : finder;
          })()}

          {search && <LeadStrip vm={p.strip} onAction={p.onStripAction} />}

          {search && <LeadClassTabs counts={{ qualified: search.round.qualified, review: search.round.review, excluded: search.round.excluded }} cls={p.view.cls} onPick={p.onPickClass} />}
          {p.view.cls === "excluded" && <LeadExcludedChips chips={chips} active={p.chip} onPick={p.onPickChip} />}

          {L.readFailed
            ? <FailedRead kind="block" what="your leads" surface="leads" testid="leads-failed" />
            : p.firstDay
            ? (
              <LeadsFirstDay
                ways={p.ways}
                suggestions={L.suggestions}
                canFind={p.canFind}
                lineOpen={p.lineOpen}
                lineDraft={p.lineDraft}
                lineError={p.lineError}
                lineBusy={p.lineBusy}
                onPick={(words) => { p.onFinderWords(words); p.onFind(); }}
                onGo={p.onGo}
                onOpenLine={p.onOpenLine}
                onLineDraft={p.onLineDraft}
                onSaveLine={p.onSaveLine}
                onCancelLine={p.onCancelLine}
                composer={
                  <LeadFinder
                    open
                    inline
                    phone={phone}
                    stage={p.finderStage}
                    words={p.finderWords}
                    proposal={p.finderProposal}
                    plan={p.finderPlan}
                    trace={p.finderTrace}
                    pick={p.finderPick}
                    refusal={p.finderRefusal}
                    busy={p.finderBusy}
                    suggestions={L.suggestions}
                    talk={p.talk}
                    onWords={p.onFinderWords}
                    onPlan={p.onFinderPlan}
                    onChangePlan={p.onFinderChangePlan}
                    onPick={p.onFinderPick}
                    onApprove={p.onFinderApprove}
                    onBack={p.onFinderBack}
                    onClose={p.onCloseFinder}
                  />
                }
              />
            )
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
            onNotAFit={p.onBulkNotAFit}
            whyOpen={p.bulkWhy}
            onWhyOpen={p.onBulkWhy}
            exportHref={p.exportHref}
          />
        )}
        {/* The peek (Task 12): the page's state and its setters, so its own acts (LeadPeekActions) are built
            from them on every draw and nothing in leads-peek.jsx keeps state of its own. The acts are what the
            peek takes -- the stage, Draft and its tones, Open in your email, Copy and the two answers to "Did
            you send it?" are all `on.<name>` inside it -- so the setters go INTO LeadPeekActions and the acts
            it returns go to the peek. Handed the setters themselves it would draw a pane of dead controls. */}
        {p.peek && (() => {
          const acts = LeadPeekActions({
            vm: p.peek,
            flash: p.flash,
            onOpenPerson: p.onOpenPerson,
            // Keep, Exclude, Put back and Copy are the scope's own (Task 11); the acts hand them on, so the
            // peek has one shape of props.
            keep: p.onKeep,
            exclude: p.onExclude,
            putBack: p.onPutBack,
            copyEmail: p.onCopy,
            draft: p.draft,
            armed: p.armed,
            setMode: p.onPeekMode,
            setArmed: p.onArmed,
            setDraft: p.onDraftState,
            setPeekId: p.onPeekId,
          });
          // Call is the acts' own: it arms "How did the call go?" and then hands the tel: to the browser, which
          // is exactly what C over the rows does (clients-a.jsx's callLead), so both end in the same place.
          return <LeadPeek vm={p.peek} mode={p.peekMode} armed={p.armed} draft={p.draft} busy={p.bulkBusy} {...acts} />;
        })()}
        {/* The phone's rail, as a sheet from the bar's list button: the same rows, the same counts, the same
            searches and the same New search. People's own sheet (clients-a.jsx), which owns its Esc, so the
            page's one listener holds still while it is open (keys.sheetOpen). Last in the tree, after
            everything whose state a stub React keys by order. */}
        {phone && p.listsOpen && ListsSheet && <ListsSheet onClose={p.onCloseLists}>{railRows}</ListsSheet>}
        {p.toastNode}
      </div>
    </div>
  );
};

Object.assign(window, { LeadsScope, LeadsBulkBar, LeadRowActions, LeadShape, LeadSearchMenu, LeadsRailRows, LeadsPhoneBar, LeadFinderSheet, LeadClassTabs, LeadExcludedChips, ldExcludedChips, LEAD_COLUMNS, LEAD_SORT_KEYS, LEAD_CLASS_WORDS });
