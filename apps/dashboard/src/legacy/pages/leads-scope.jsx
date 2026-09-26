
// leads-bench.jsx, which loads before this file.
const { ldExcludedChips, LeadBand, LeadExcludedChips, LeadReviewGroups, LeadReviewBench } = window;
// leads-map.jsx, which loads before this file.
const { LeadMap } = window;
// leads-cells.jsx, which loads before this file.
const { ldCardRowClass, ldRowClass } = window;

/* ------------------------------------------------------- the rail's searches */

// A kept search says what was asked (§8.10). The menu closes after each item (MoreMenu), and every item is a
// route: nothing here renames or removes on the spot.
const LeadSearchMenu = ({ s, words, canFind, onRename, onMore, onAgain, onRemove, onUndo, exportHref }) => (
  <MoreMenu
    // It escapes the rail: the rail scrolls and cuts off whatever crosses its edge, so opening rightward showed 51px of
    // 194, and a menu held inside it (196px) broke its words onto three to six lines. Placed against the window, it
    // opens rightward over the table at a menu's full width.
    escape
    align="left"
    // Its name is what it holds, for a screen reader and on hover: "What independent bookstores asked for" read as
    // if the bookstores had asked. What the search asked for is the row's own tip (LeadsRailRows).
    title={`More for ${s.name}`}
    btnClass="btn btn-ghost btn-icon btn-sm ld-search-more"
    items={[
      { header: words.askedLine },
      { label: "Rename", icon: "pencil", onClick: () => onRename(s), gate: canFind ? undefined : window.gate("find", "rename this search") },
      { label: "Find new ones", icon: "refresh", meta: "Only places not already in your leads count", onClick: () => onMore(s), gate: canFind ? undefined : window.gate("find", "search again") },
      // A door wears the three's mark, as Find leads does: the sparkle means written by Claude, and this is a press.
      { label: "Search again, changed", icon: "three", meta: "Opens the plan with what you asked", onClick: () => onAgain(s), gate: canFind ? undefined : window.gate("find", "search again") },
      { label: `Export these ${s.count}`, icon: "external", onClick: () => { if (exportHref) window.open(exportHref, "_self"); }, gate: canFind ? undefined : window.gate("find", "export these leads") },
      // For a day after a round ends: the leads nobody has touched leave and the month is credited (§8.6). Named
      // for what it does; the toast it answers with carries its own Undo, which puts them back.
      ...(s.undoable ? [{ label: "Remove the ones you haven't touched", icon: "undo", meta: `Up to ${s.count} given back this month`, onClick: () => onUndo(s), gate: canFind ? undefined : window.gate("find", "remove these leads") }] : []),
      { divider: true },
      { label: "Remove this search", icon: "x", danger: true, meta: words.keepsLine, onClick: () => onRemove(s), gate: canFind ? undefined : window.gate("find", "remove this search") },
    ]}
  />
);

// The rail under Leads, drawn with People's kit (RailSection, RailRow in clients-a.jsx) and picked the way People's
// is: one row at a time, a list or a search. The lists, then the searches, each with its count, a live dot while it
// runs and a "?" in the accent while it waits on the owner. Renaming and removing are asked where the search is, so
// the rail never loses the row that is being named.
// `compact` is the phone's sheet (People's RailEmpty): a list with no lead in it is said in a line, not drawn -- all
// leads and the one picked always are. Searches are always drawn: each is a thing kept, with its own menu.
const LeadsRailRows = ({ rail, list, searchId, canFind, wordsFor, onPickList, onPickSearch, onWarmList = () => {}, onWarmSearch = () => {}, renaming, onRename, onRenameSave, onRenameCancel, removing, onRemoveAsk, onRemoveYes, onRemoveNo, removeBusy, removeError, onMore, onAgain, onUndo, hrefFor, onNew, compact = false }) => {
  const quiet = compact ? window.railQuiet(rail.lists, (l) => l.id === "all" || (!searchId && list === l.id)) : [];
  return (
  <>
    {/* "Lists", not "Leads": the switch right above already says which scope this is. */}
    <RailSection label="Lists" testid="leads-lists">
      {rail.lists.filter((l) => !quiet.includes(l)).map((l) => (
        <RailRow key={l.id} label={l.label} count={l.count} active={!searchId && list === l.id} onPick={() => onPickList(l.id)} onWarm={() => onWarmList(l.id)} testid={`leads-list-${l.id}`} />
      ))}
      <window.RailEmpty labels={quiet.map((l) => l.label)} testid="leads-lists-empty" />
    </RailSection>
    <RailSection label="Searches" testid="leads-searches">
      {rail.searches.map((s) => (
        <RailRow
          key={s.id}
          className="ld-search-row"
          pickClass="ld-search-pick"
          label={s.name}
          count={s.count}
          active={searchId === s.id}
          onPick={() => onPickSearch(s.id)}
          onWarm={() => onWarmSearch(s.id)}
          // Most names are cut off at the rail's width; the row names the whole ask, and when, on hover (the shared tip).
          tip={wordsFor(s.id).askedLine || null}
          testid={`leads-search-${s.id}`}
          mark={s.mark === "live" ? <span className="live-dot" aria-hidden="true" /> : s.mark === "question" ? <span className="rail-q" title="This search needs you">?</span> : null}
          menu={<LeadSearchMenu s={s} words={wordsFor(s.id)} canFind={canFind} onRename={onRename} onMore={onMore} onAgain={onAgain} onRemove={onRemoveAsk} onUndo={onUndo} exportHref={hrefFor(s)} />}
          edit={renaming && renaming.id === s.id ? (
            <span className="cl-bulk-naming ld-search-renaming">
              <input autoFocus defaultValue={s.name} maxLength={80} aria-label="The search's name" data-testid="leads-rename-name" onKeyDown={(e) => { if (e.key === "Enter") onRenameSave(s, e.target.value); if (e.key === "Escape") onRenameCancel(); }} />
              <button type="button" className="btn btn-sm btn-primary" onClick={(e) => onRenameSave(s, e.currentTarget.parentNode.querySelector("input").value)} data-testid="leads-rename-save">Save</button>
            </span>
          ) : null}
          after={removing && removing.id === s.id ? (
            <Confirm question={`Remove “${s.name}”?`} detail={wordsFor(s.id).keepsLine} yes="Yes, remove" danger busy={removeBusy} error={removeError} onYes={() => onRemoveYes(s)} onNo={onRemoveNo} testid="leads-remove" />
          ) : null}
        />
      ))}
      {rail.searches.length === 0 && <div className="cl-rail-hint">No searches yet. Describe the businesses you want and Claude finds them.</div>}
    </RailSection>
    <div className="cl-rail-foot">
      <button type="button" className="cl-rail-newseg" onClick={onNew} data-testid="leads-new-search" {...(canFind ? {} : window.gate("find", "find leads"))}>
        <Icon name="plus" size={11} /> New search
      </button>
    </div>
  </>
  );
};
/* --------------------------------------------------------------- the bulk bar */

// What a selection of leads can become (§6.4, S13): their emails on the clipboard, all contacted, all not a fit,
// a file. Each acts on the rows shown AND selected; the header box's "Select all N that match" hands the view's
// filters to the server instead of a list of ids, so a view of 1,240 does not become 1,240 ids in a request.
const LeadsBulkBar = ({ sel, rows, total, view, canFind, canExport, busy, whyNot, onClear, onSelectAllMatching, allMatching, onCopyEmails, onContacted, onNotAFit, whyOpen, onWhyOpen, exportHref, review = null, phone = false, sheet = null, onSheet = () => {} }) => {
  // The view models, for what a check costs. Check again read V with no V in its scope (the other `const V` in this
  // file are other functions' own), so a selection of leads to check again threw as the bar drew.
  const V = window.__LEAD_VM || {};
  const picked = rows.filter((l) => sel.has(l.id));
  const ids = picked.map((l) => l.id);
  const count = allMatching ? total : ids.length;
  // Selected, and not among the rows shown: the words in the box hide them, and they are selected still (the page
  // keeps a selection through a search). The bar acts on what it shows, so it says what it is leaving out.
  const hidden = allMatching ? 0 : sel.size - ids.length;
  // A selection that is all Needs review offers what resolves it (D3): the union of its groups' acts. Check again
  // and Find an email draw only where their couriers exist, so nothing here is ever a dead control.
  const acts = review && !allMatching && picked.length > 0 && picked.every((l) => l.cls === "review") ? review.actsFor(ids) : [];
  const gate = canFind ? {} : window.gate("find", "work these leads");
  // On a phone (spec 4.5): People's row -- ✕, the count, the act most selections get (Mark contacted) and ⋯ -- and a
  // sheet with the rest. Not a fit asks its five whys as the sheet's step: the peek's own list (LeadNotFitWhy) wears
  // .pl-peek, which a phone draws full screen (leads.css), so from this bar it covered the page. The whys are the peek's
  // words, from their one list (__LEAD_WORDS.whys). The step is the page's (`sheet`), so its keyboard listener shuts
  // the sheet on Esc.
  if (phone) {
    const Sheet = window.PhoneSheet;
    const Row = window.PhoneSheetRow;
    const W = window.__LEAD_WORDS || {};
    const scope = (action) => (allMatching ? { by: "view", action, view } : { by: "ids", action, ids });
    const shut = (fn) => () => { onSheet(null); fn(); };
    return (
      <>
        <div className="cl-bulk ld-bulk pp-bulk" role="toolbar" aria-label="Selected leads" data-testid="leads-bulk-bar">
          <button type="button" className="pp-bar-icon" aria-label="Clear the selection" onClick={onClear} data-testid="leads-bulk-clear"><Icon name="x" size={18} /></button>
          <span className="cl-bulk-count"><b>{count.toLocaleString()}</b> selected{hidden > 0 ? <span data-testid="leads-bulk-hidden"> · {hidden} more not shown</span> : null}</span>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => onContacted(scope("contacted"))} data-testid="leads-bulk-contacted" {...(canFind ? {} : window.gate("find", "mark these leads contacted"))}>Mark contacted</button>
          <button type="button" className="pp-bar-icon" aria-label={`More for the ${count} selected`} aria-haspopup="dialog" onClick={() => onSheet("more")} data-testid="leads-bulk-more"><Icon name="more" size={18} /></button>
        </div>
        {sheet === "more" && (
          <Sheet title={`${count.toLocaleString()} selected`} onClose={() => onSheet(null)} testid="leads-bulk-sheet">
            <div className="pp-sheet-rows">
              {!allMatching && total > rows.length ? <Row icon="check" label={`Select all ${total.toLocaleString()} that match`} onClick={shut(onSelectAllMatching)} testid="leads-select-matching" /> : null}
              {acts.includes("check_again") && review.canCheckAgain ? <Row icon="refresh" label={`Check ${ids.length} again`} meta={`about ${V.leadCheckAgainCents ? V.leadCheckAgainCents(ids.length) : ids.length}¢`} disabled={busy} onClick={shut(() => review.onCheckAgain(ids))} testid="leads-bulk-check-again" gate={canFind ? null : gate} /> : null}
              {acts.includes("find_email") && review.canFindEmail ? <Row icon="search" label={`Find ${ids.length === 1 ? "an email" : `${ids.length} emails`}`} disabled={busy} onClick={shut(() => review.onFindEmail(ids))} testid="leads-bulk-find-email" gate={canFind ? null : gate} /> : null}
              {acts.includes("keep") ? <Row icon="check" label={`Keep ${ids.length}`} disabled={busy} onClick={shut(() => review.onKeep(ids))} testid="leads-bulk-keep" gate={canFind ? null : gate} /> : null}
              {acts.includes("exclude") ? <Row icon="x" label={`Exclude ${ids.length}`} disabled={busy} onClick={shut(() => review.onExclude(ids))} testid="leads-bulk-exclude" gate={canFind ? null : gate} /> : null}
              <Row icon="copy" label="Copy emails" disabled={busy} onClick={shut(() => onCopyEmails(picked))} testid="leads-bulk-copy" />
              <Row icon="ban" label="Not a fit" next disabled={busy} onClick={() => onSheet("why")} testid="leads-bulk-not-a-fit" gate={canFind ? null : window.gate("find", "mark these leads not a fit")} />
              {canExport
                ? <a className="pp-sheet-row" href={exportHref} download onClick={() => onSheet(null)} data-testid="leads-bulk-export"><Icon name="external" size={16} /><span className="pp-sheet-row-words">Export</span><span className="pp-sheet-row-meta">CSV</span></a>
                : <Row icon="external" label="Export" meta="CSV" gate={window.gate("export", "export these leads")} testid="leads-bulk-export" />}
              {whyNot ? <p className="pp-sheet-hint pp-sheet-rows-note">{whyNot}</p> : null}
            </div>
          </Sheet>
        )}
        {sheet === "why" && (
          <Sheet title={W.notFitTitle || "Not a fit"} onBack={() => onSheet("more")} onClose={() => onSheet(null)} testid="leads-bulk-why">
            <div className="pp-sheet-rows">
              {(W.whys || []).map((w) => <Row key={w.id} label={w.label} disabled={busy} onClick={shut(() => onNotAFit(w.id, scope("not_a_fit")))} testid={`leads-bulk-why-${w.id}`} />)}
            </div>
          </Sheet>
        )}
      </>
    );
  }
  return (
    <div className="cl-bulk ld-bulk" role="toolbar" aria-label="Selected leads" data-testid="leads-bulk-bar">
      <span className="cl-bulk-count"><b>{count}</b> selected{hidden > 0 ? <span data-testid="leads-bulk-hidden"> · {hidden} more not shown</span> : null}</span>
      {!allMatching && total > rows.length && (
        <button type="button" className="cl-bucket-link" onClick={onSelectAllMatching} data-testid="leads-select-matching">Select all {total.toLocaleString()} that match</button>
      )}
      {acts.includes("check_again") && review.canCheckAgain ? <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => review.onCheckAgain(ids)} data-testid="leads-bulk-check-again" {...gate}><Icon name="refresh" size={12} /> Check {ids.length} again <span className="dim">· about {(V.leadCheckAgainCents ? V.leadCheckAgainCents(ids.length) : ids.length)}¢</span></button> : null}
      {acts.includes("find_email") && review.canFindEmail ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => review.onFindEmail(ids)} data-testid="leads-bulk-find-email" {...gate}><Icon name="search" size={12} /> Find {ids.length === 1 ? "an email" : `${ids.length} emails`}</button> : null}
      {acts.includes("keep") ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => review.onKeep(ids)} data-testid="leads-bulk-keep" {...gate}>Keep {ids.length}</button> : null}
      {acts.includes("exclude") ? <button type="button" className="btn btn-sm" disabled={busy} onClick={() => review.onExclude(ids)} data-testid="leads-bulk-exclude" {...gate}>Exclude {ids.length}</button> : null}
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

// The phone's top (<=900px, the band People's own rows begin at), Leads' way: People's (PeoplePhoneBar, clients-a.jsx),
// the scopes as the Inbox's tab strip over the bar: lists, search, and Find leads as the three's still mark. Find
// leads is Ask (spec F1): at a phone's width the shell's ✦ is its one door and the mark gives way (leads.css); from
// 721px to 900px the controls row is gone and the shell draws no ✦, so the mark is the page's one door. The same
// top on every scope, and nothing else sits above the rows -- no title, no sub-headline, no stat cards and no
// second control row (legacy/CLAUDE.md, the phone shows the work first).
const LeadsPhoneBar = ({ scope, onScope, dealsOn = false, listLabel, listCount = null, onLists, listsOpen, q, onQ, searchRef, searchOpen = false, onSearchOpen = () => {}, onFind = () => {}, canFind = false, mapOn = false, onMap = () => {}, canMap = false }) => {
  const Bar = window.PeoplePhoneBar;
  return (
    <Bar
      scope={scope}
      onScope={onScope}
      dealsOn={dealsOn}
      listLabel={listLabel}
      listCount={listCount}
      onLists={onLists}
      listsOpen={listsOpen}
      q={q}
      onQ={onQ}
      searchRef={searchRef}
      searchOpen={searchOpen}
      onSearchOpen={onSearchOpen}
      searchLabel="Search leads"
      testid="leads"
      trailing={(
        <>
          {/* The map, from the bar (Ruben, 25 Sep): the desktop's toggle stood in the controls row, which a phone never
              draws, so the streets had no door here. It is a switch of two, the rows and the places, the one shown
              pressed: a lone push-pin said neither which view this was nor what it would open (Ruben: it read as a
              hammer). Drawn only where the rows have places to draw. */}
          {canMap ? (
            <span className="ld-bar-view" role="group" aria-label="Show the leads as" data-testid="leads-view-switch">
              <button
                type="button"
                className={`ld-bar-view-opt${mapOn ? "" : " on"}`}
                aria-pressed={!mapOn}
                aria-label="The list"
                title="The list"
                data-testid="leads-list-toggle"
                onClick={() => onMap(false)}
              >
                <Icon name="list" size={15} />
              </button>
              <button
                type="button"
                className={`ld-bar-view-opt${mapOn ? " on" : ""}`}
                aria-pressed={mapOn}
                aria-label="The map"
                title="The map"
                data-testid="leads-map-toggle"
                onClick={() => onMap(true)}
              >
                <Icon name="map" size={15} />
              </button>
            </span>
          ) : null}
          <button
            type="button"
            className="pp-bar-icon ld-bar-find"
            aria-label="Find leads"
            title="Find leads"
            data-testid="leads-bar-find"
            onClick={() => onFind()}
            {...(canFind ? {} : window.gate("find", "find businesses for you"))}
          >
            <Icon name="three" size={16} />
          </button>
        </>
      )}
    />
  );
};

// The plan panel, as a sheet from the bottom of a phone. No listener of its own: the page's one keydown listener
// closes the panel on Esc before anything else and holds every other key while it is open (Task 2), so a second
// listener here would take the key twice and close the panel and then the selection on one press.
const LeadPlanSheet = ({ onClose, children }) => (
  <>
    <div className="sb-sheet-backdrop" onClick={onClose} />
    {/* A phone's alone: its handle says a thumb pulls it down, and it goes the way it came (data-bits touchSwipe, leaving). */}
    <div className="sb-sheet pl-plan" role="dialog" aria-label="The plan" data-testid="lead-plan-sheet" ref={window.leaving ? window.leaving("lead-plan") : undefined} {...(window.touchSwipe ? window.touchSwipe({ onDown: onClose }) : {})}>
      <div className="ld-sheet-handle" />
      {children}
    </div>
  </>
);

// Needs review on a phone is rows, like every other list (Ruben, 25 Sep): the same cards, in the pile's order, in
// groups under one quiet line each -- the group's words, its count and its acts -- with no bench, no card restating
// the reason and no buttons on rows. A row's own act is a slide (leads-cells.jsx ldCardCell) or a selection into the
// bar; a group's acts press the doors the bench and the bar press. The desktop keeps its workbench.
const ldReviewSections = (p) => {
  const V = window.__LEAD_VM || {};
  const words = V.LEAD_REVIEW_ACT_WORDS || {};
  const review = p.review || {};
  const x = p.cellCtx || {};
  const can = (a) => (a === "check_again" ? !!review.canCheckAgain : a === "find_email" ? !!review.canFindEmail : true);
  const press = (a, ids) => (a === "check_again" ? review.onCheckAgain(ids) : a === "find_email" ? review.onFindEmail(ids) : a === "keep" ? review.onKeep(ids) : review.onExclude(ids));
  const gate = x.canFind ? {} : window.gate("find", "work these leads");
  return p.benchGroups.map((g) => {
    const acts = g.acts.filter(can);
    return {
      key: g.key,
      label: g.label,
      rows: p.rows.filter((l) => g.ids.indexOf(l.id) >= 0),
      meta: acts.length ? (
        <span className="ld-sec-acts">
          {acts.map((a) => (
            <button key={a} type="button" className="ld-sec-act" onClick={() => press(a, g.ids)} data-testid={`review-sec-${a}`} {...gate}>
              {a === "keep" || a === "exclude" ? `${words[a] || a} all` : words[a] || a}
            </button>
          ))}
        </span>
      ) : null,
    };
  });
};

/* ------------------------------------------------------------ the scope itself */

const LeadsScope = (p) => {
  const L = p.surface;
  const rail = p.rail;
  const standing = p.standing;
  const chips = ldExcludedChips(L.rows);
  const search = p.search;
  // The same band People's cards use (clients.css) and the same one the page's listener judges the Columns menu
  // by. The page hands it down (plPhone, clients-a.jsx): it listens to the query, so a window resized past the band
  // draws the other shape at once, where this read it on every draw and drew the other shape only on the next state
  // change. Nothing here is a hook.
  const phone = !!p.phone;
  // Needs review on a phone: the pile as the table's own sections (ldReviewSections), never the bench.
  const sections = phone && p.view.cls === "review" && p.benchGroups.length ? ldReviewSections(p) : null;
  const railRows = (
    <LeadsRailRows
          compact={phone}
          rail={rail}
          list={p.view.list}
          searchId={p.view.searchId}
          canFind={p.canFind}
          wordsFor={p.searchWordsFor}
          onPickList={p.onPickList}
          onPickSearch={p.onPickSearch}
          onWarmList={p.onWarmList}
          onWarmSearch={p.onWarmSearch}
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
  // The rows: the list's view, and on a phone the leads under the map too.
  const table = (
    <PeopleTable
      busy={!!p.loading}
      budget={p.rowBudget}
      noun="lead"
      columns={p.columns}
      ctx={sections ? { ...p.cellCtx, sectioned: true } : p.cellCtx}
      rows={p.rows}
      rowClass={phone ? ldCardRowClass : ldRowClass}
      sections={sections}
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
  );
  const ListsSheet = window.PeopleListsSheet;
  return (
    <div className="clients leads-scope" data-loading={p.loading ? "1" : undefined}>
      {/* At a phone's width the rail is the bar's list button instead (the stylesheet hides .cl-rail at 900px
          anyway, and the switch the rail heads is the bar's own). */}
      {!phone && <PeopleRail scope="leads" onScope={p.onScope} dealsOn={!!p.dealsOn}>{railRows}</PeopleRail>}

      <div className="cl-main">
        {/* A phone's one bar stands over the scroller, as the Inbox's strip does: the rows scroll and bounce under it,
            and a pull down never takes it. */}
        {phone && (
          <LeadsPhoneBar
            scope="leads"
            onScope={p.onScope}
            mapOn={!!p.mapOpen}
            onMap={p.onMap}
            canMap={!!p.canMap}
            dealsOn={!!p.dealsOn}
            listLabel={p.railLabel}
            listCount={p.railCount}
            onLists={p.onLists}
            listsOpen={p.listsOpen}
            q={p.q}
            onQ={p.onQ}
            searchRef={p.searchRef}
            searchOpen={p.searchOpen}
            onSearchOpen={p.onSearchOpen}
            onFind={p.onFind}
            canFind={p.canFind}
          />
        )}
        <div className="cl-main-scroll pl-main" ref={p.scrollRef}>
          {!phone && (
            <>
              <PeopleStanding scope="leads" leads={standing} onNeeds={p.onNeedsYou} onScope={p.onScope} />

              <div className="cl-controls">
                <div className="cl-search-wrap">
                  <Icon name="search" size={13} />
                  <input ref={p.searchRef} placeholder="Search leads" aria-label="Search leads" value={p.q} onChange={(e) => p.onQ(e.target.value)} />
                  <span className="kbd">/</span>
                </div>
                <div className="cl-controls-right">
                  {/* Values ⁄ Signals (D5): the number and the address in the row, for anyone who dials from a desk phone; kept per viewer. */}
                  {/* The same leads, as places (D5). */}
                  <button type="button" className={`btn btn-ghost btn-sm${p.mapOpen ? " on" : ""}`} aria-pressed={!!p.mapOpen} onClick={() => p.onMap(!p.mapOpen)} data-testid="leads-map-toggle" title="See these leads on the ground"><Icon name={p.mapOpen ? "list" : "map"} size={12} /> {p.mapOpen ? "Table" : "Map"}</button>
                  <button type="button" className={`btn btn-ghost btn-sm ld-values${p.values ? " on" : ""}`} aria-pressed={!!p.values} onClick={() => p.onValues(!p.values)} data-testid="leads-values" title="Show the numbers and addresses in the rows">{p.values ? "Signals" : "Values"}</button>
                  <PeopleColumnsMenu open={p.colsOpen} onOpenChange={p.onColsOpen} options={p.colOptions} onPick={p.onPickColumn} buttonRef={p.colsButton} />
                  {p.canExport
                    ? <a className="btn btn-ghost btn-sm" href={p.exportHref} download title="Download these leads as a CSV file" data-testid="leads-export"><Icon name="external" size={12} /> Export</a>
                    : <button type="button" className="btn btn-ghost btn-sm" {...window.gate("export", "export these leads")} data-testid="leads-export"><Icon name="external" size={12} /> Export</button>}
                  {/* Ask's door on a desktop (spec F1): the three's still mark, never a second live canvas. */}
                  <button type="button" className="btn btn-primary btn-sm" onClick={p.onFind} data-testid="leads-find" {...(p.canFind ? {} : window.gate("find", "find leads"))}>
                    <Icon name="three" size={12} /> Find leads <span className="kbd">F</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* The plan panel folds out above the table on a desktop and comes up as a sheet from the bottom of a
              phone: the card for a plan born from the strip, or the answer row under a search's question (spec F5).
              A fresh Find is Ask's (F1), the takeover on a phone and the Stage on a desktop, so nothing composes here. */}
          {!p.firstDay && p.finderOpen && (() => {
            const panel = (
              <LeadPlanPanel
                open
                stage={p.finderStage}
                words={p.finderWords}
                proposal={p.finderProposal}
                plan={p.finderPlan}
                trace={p.finderTrace}
                pick={p.finderPick}
                refusal={p.finderRefusal}
                busy={p.finderBusy}
                answering={p.finderAnswering}
                onWords={p.onFinderWords}
                onAnswer={p.onFinderAnswer}
                onChangePlan={p.onFinderChangePlan}
                onPick={p.onFinderPick}
                onApprove={p.onFinderApprove}
                onBack={p.onFinderBack}
                onClose={p.onCloseFinder}
              />
            );
            return phone ? <LeadPlanSheet onClose={p.onCloseFinder}>{panel}</LeadPlanSheet> : panel;
          })()}

          {/* Which list is open, as People says which of its lists is (its .cl-section-head, the same classes): the
              list's name, and the way back to all leads. A search that is open says itself in the strip instead, and
              the phone's bar already names the list. */}
          {!search && !phone && !p.firstDay && !L.readFailed ? (
            <div className="cl-section-head ld-list-head" data-testid="leads-list-head">
              <div className="cl-section-lead">
                <span className="cl-section-title" data-testid="leads-list-title">{p.listTitle}</span>
                {p.view.list !== "all" ? <button type="button" className="cl-bucket-link" onClick={() => p.onPickList("all")} data-testid="leads-show-all">Show all leads</button> : null}
                {/* What a refresh found and the surface is holding back (E8: nothing re-sorts under the owner). An open
                    search says it in its strip; here the head does, with the strip's own words and door. */}
                {L.offered > 0 ? <button type="button" className="cl-bucket-link ld-offered" onClick={p.onTakeOffered} data-testid="leads-offered">{L.offered} new</button> : null}
              </div>
            </div>
          ) : null}

          {/* One line for the open search: what happened, its three piles as the tabs that open them, and the one next
              step. The band rides inside the strip; with no strip to hold it, it stands alone as it did. */}
          {search && p.strip ? (
            <LeadStrip vm={p.strip} onAction={p.onStripAction}>
              {p.band ? <LeadBand band={p.band} cls={p.view.cls} onPick={p.onPickClass} fit={p.fit} onPickFit={p.onPickFit} /> : null}
            </LeadStrip>
          ) : null}
          {search && !p.strip && p.band && <LeadBand band={p.band} cls={p.view.cls} onPick={p.onPickClass} fit={p.fit} onPickFit={p.onPickFit} />}
          {p.view.cls === "excluded" && <LeadExcludedChips chips={chips} active={p.chip} onPick={p.onPickChip} />}
          {p.view.cls === "review" && !p.benchGroups.length && window.__LEAD_VM && window.__LEAD_VM.leadReviewGroups && <LeadReviewGroups groups={window.__LEAD_VM.leadReviewGroups(L.rows, search)} onPick={p.onSelectIds} />}

          {L.readFailed
            ? <FailedRead kind="block" what="your leads" surface="leads" testid="leads-failed" />
            : p.mapOpen && p.plot && p.plot.pins.length
            ? (
              <>
              <LeadMap
                phone={phone}
                rows={p.rows}
                plot={p.plot}
                oneSearch={!!p.view.searchId}
                by={p.mapBy}
                onBy={p.onMapBy}
                picked={p.mapPick}
                onPick={p.onMapPick}
                x={p.cellCtx}
                onWiden={p.onWiden}
                nearby={(search && search.round && search.round.nearby) || []}
                onNearby={p.onNearby}
                canFind={p.canFind}
              />
              {/* On a phone the leads under the map are the list's own rows, not the map's boxed list of its own:
                  one row for every list (tokens.css), and the same press opens the same peek. */}
              {phone ? table : null}
              </>
            )
            : p.view.cls === "review" && p.benchGroups.length && !phone
            ? (
              <LeadReviewBench
                groups={p.benchGroups}
                rows={p.rows}
                groupKey={p.benchGroup}
                onGroup={p.onBenchGroup}
                search={search}
                month={p.month}
                review={p.review}
                x={p.cellCtx}
                onNearby={p.onNearby}
              />
            )
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
                // A suggestion picked opens Ask with its words in the field, ready to send (spec F1).
                onPick={(words) => p.onFind(words)}
                onGo={p.onGo}
                onOpenLine={p.onOpenLine}
                onLineDraft={p.onLineDraft}
                onSaveLine={p.onSaveLine}
                onCancelLine={p.onCancelLine}
                // The composer's slot holds the one door on the first day: Find leads, wearing the mark, opening Ask.
                composer={
                  <button type="button" className="btn btn-primary fr-find" onClick={() => p.onFind()} data-testid="leads-first-find" {...(p.canFind ? {} : window.gate("find", "find businesses for you"))}>
                    <Icon name="three" size={13} /> Find leads
                  </button>
                }
              />
            )
            : table}
          {L.next && (
            <div className="cl-section-sub ld-more" data-testid="leads-more">
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
            review={p.review}
            onClear={p.onClearSel}
            onCopyEmails={p.onCopyEmails}
            onContacted={p.onBulk}
            onNotAFit={p.onBulkNotAFit}
            whyOpen={p.bulkWhy}
            onWhyOpen={p.onBulkWhy}
            exportHref={p.exportHref}
            phone={phone}
            sheet={p.bulkSheet}
            onSheet={p.onBulkSheet}
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
            copyPhone: p.onCopyPhone,
            draft: p.draft,
            armed: p.armed,
            setMode: p.onPeekMode,
            setArmed: p.onArmed,
            setDraft: p.onDraftState,
            setPeekId: p.onPeekId,
            // The photo, expanded (D5): the page's own lightbox state.
            expand: p.onExpandPhoto,
          });
          // Call is the acts' own: it arms "How did the call go?" and then hands the tel: to the browser, which
          // is exactly what C over the rows does (clients-a.jsx's callLead), so both end in the same place.
          // The deck is a phone's (D5): one lead at a time, with the pile's place under the thumb.
          return <LeadPeek vm={p.peek} mode={p.peekMode} armed={p.armed} draft={p.draft} busy={p.bulkBusy} deck={phone ? p.deck : null} phone={phone} {...acts} />;
        })()}
        {/* The phone's rail, as a sheet from the bar's list button: the same rows, the same counts, the same
            searches and the same New search. People's own sheet (clients-a.jsx), which owns its Esc, so the
            page's one listener holds still while it is open (keys.sheetOpen). Last in the tree, after
            everything whose state a stub React keys by order. */}
        {/* The photo, expanded (D5): the peek's own view model, drawn large with the facts about the place beside it. */}
        {p.lightbox && window.LeadLightbox ? <window.LeadLightbox vm={p.lightbox} onClose={p.onCloseLightbox} /> : null}
        {phone && p.listsOpen && ListsSheet && <ListsSheet onClose={p.onCloseLists}>{railRows}</ListsSheet>}
        {p.toastNode}
      </div>
    </div>
  );
};

Object.assign(window, { LeadsScope, LeadsBulkBar, LeadSearchMenu, LeadsRailRows, LeadsPhoneBar, LeadPlanSheet });
