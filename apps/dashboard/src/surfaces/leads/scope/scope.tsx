/**
 * The Leads scope of People (moved from legacy/pages/leads-scope.jsx, decision 0015): the rail's lead rows and its kept
 * searches, the standing line, the controls, the table drawn with LEAD_COLUMNS, the bulk bar, and the three classes
 * (Qualified · Needs review · Excluded). Hookless, every one of them: every piece of state here is LeadsReal's
 * (../page/), where its one keyboard listener and the address can move it, and arrives as a prop; every act goes out
 * through the surface's doors (../surface.ts). Nothing here names the vendor: the owner sees Claude finding businesses,
 * and where each fact came from. Its parts are plain functions, never components, so its tree is the one it always drew.
 */
import type { ReactElement } from "react";
import { leadReviewGroups, type LeadRowVM } from "@chanlytics/contracts";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { gate } from "../../legacy-verbs";
import { PeopleListsSheet } from "../../people/rail/lists-sheet";
import { PeopleRail } from "../../people/rail/people-rail";
import { PeopleStanding } from "../../people/rail/standing";
import { PeopleTable, type TableSection } from "../../people/table/table";
import { LeadBand } from "../bench/band";
import { LeadReviewBench } from "../bench/bench";
import { LeadExcludedChips, LeadReviewGroups, ldExcludedChips } from "../bench/chips";
import { ldCardRowClass } from "../cells/columns";
import { ldRowClass } from "../cells/name-cell";
import { LeadsFirstDay } from "../finder/first-day";
import { LeadPlanPanel } from "../finder/plan-panel";
import { LeadStrip } from "../finder/strip-view";
import { LeadMap } from "../map/map";
import { LeadPeekActions } from "../peek/acts";
import { LeadLightbox } from "../peek/lightbox";
import { LeadPeek } from "../peek/peek";
import type { LeadsScopeProps } from "../page/props";
import { LeadsBulkBar } from "./bulk-bar";
import { LeadsControlsRight } from "./controls";
import { LeadPlanSheet, LeadsPhoneBar } from "./phone-bar";
import { LeadsRailRows } from "./rail";
import { ldReviewSections } from "./review";

type P = LeadsScopeProps;
/** The rail's own pick is People's: under Leads it draws the rows it is handed, and picks nothing itself. */
const NO_PICK = (): void => undefined;
type Sections = TableSection<LeadRowVM>[] | null;

/** The rail's rows: a desk's rail, and a phone's Lists sheet. */
const railRowsOf = (p: P, phone: boolean) => (
  <LeadsRailRows
    compact={phone}
    rail={p.rail}
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
    importDoor={p.importDoor}
    onAgain={p.onSearchAgain}
    hrefFor={p.exportHrefFor}
    onNew={p.onFind}
  />
);

/** The rows: the list's view, and on a phone the leads under the map too. */
const tableOf = (p: P, phone: boolean, sections: Sections) => (
  <PeopleTable
    busy={!!p.loading}
    budget={p.rowBudget}
    noun="lead"
    columns={p.columns}
    ctx={sections ? { ...p.cellCtx, sectioned: true } : p.cellCtx}
    rows={p.rows}
    swapRef={p.swapRef}
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

/** A phone's one bar stands over the scroller, as the Inbox's strip does: the rows scroll and bounce under it. */
const phoneBarOf = (p: P) => (
  <LeadsPhoneBar
    mapOn={!!p.mapOpen}
    onMap={p.onMap}
    canMap={!!p.canMap}
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
    search={p.search}
  />
);

/** A desk's standing line and controls row, over the rows. */
const deskTopOf = (p: P) => (
  <>
    <PeopleStanding scope="leads" leads={p.standing} onNeeds={p.onNeedsYou} />

    <div className="cl-controls">
      <div className="cl-search-wrap">
        <Icon name="search" size={13} />
        <input
          ref={p.searchRef}
          placeholder="Search leads"
          aria-label="Search leads"
          value={p.q}
          onChange={(e) => p.onQ(e.target.value)}
        />
      </div>
      <LeadsControlsRight p={p} search={p.search} />
    </div>
  </>
);

/**
 * The plan panel folds out above the table on a desktop and comes up as a sheet from the bottom of a phone: the card for
 * a plan born from the strip, or the answer row under a search's question (spec F5). A fresh Find is Ask's (F1), the
 * takeover on a phone and the Stage on a desktop, so nothing composes here.
 */
const planPanelOf = (p: P, phone: boolean) => {
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
};

/**
 * Which list is open, as People says which of its lists is (its .cl-section-head, the same classes): the list's name, and
 * the way back to all leads. A search that is open says itself in the strip instead, and the phone's bar names the list.
 */
const listHeadOf = (p: P) => (
  <div className="cl-section-head ld-list-head" data-testid="leads-list-head">
    <div className="cl-section-lead">
      <span className="cl-section-title" data-testid="leads-list-title">
        {p.listTitle}
      </span>
      {p.view.list !== "all" ? (
        <button
          type="button"
          className="cl-bucket-link"
          onClick={() => p.onPickList("all")}
          data-testid="leads-show-all"
        >
          Show all leads
        </button>
      ) : null}
      {/* What a refresh found and the surface is holding back (E8: nothing re-sorts under the owner). An open search says
          it in its strip; here the head does, with the strip's own words and door. */}
      {p.surface.offered > 0 ? (
        <button
          type="button"
          className="cl-bucket-link ld-offered"
          onClick={p.onTakeOffered}
          data-testid="leads-offered"
        >
          {p.surface.offered} new
        </button>
      ) : null}
    </div>
  </div>
);

const bandOf = (p: P) =>
  p.band ? (
    <LeadBand band={p.band} cls={p.view.cls} onPick={p.onPickClass} fit={p.fit} onPickFit={p.onPickFit} />
  ) : null;

/** The first day: the suggestions, the three ways, and Find leads in the composer's slot, opening Ask. */
const firstDayOf = (p: P) => (
  <LeadsFirstDay
    ways={p.ways}
    suggestions={p.surface.suggestions}
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
      <button
        type="button"
        className="btn btn-primary fr-find"
        onClick={() => p.onFind()}
        data-testid="leads-first-find"
        {...(p.canFind ? {} : gate("find", "find businesses for you"))}
      >
        <Icon name="three" size={13} /> Find leads
      </button>
    }
  />
);

/** What stands where the rows go: a failed read, the map, Needs review's bench, the first day, or the table. */
const scopeBodyOf = (p: P, phone: boolean, table: ReactElement) => {
  const search = p.search;
  if (p.surface.readFailed) return <FailedRead kind="block" what="your leads" surface="leads" testid="leads-failed" />;
  if (p.mapOpen && p.plot && p.plot.pins.length)
    return (
      <>
        <LeadMap
          phone={phone}
          rows={p.rows}
          plot={p.plot}
          oneSearch={!!p.view.searchId}
          picked={p.mapPick}
          onPick={p.onMapPick}
          x={p.cellCtx}
          onWiden={p.onWiden}
          nearby={(search && search.round && search.round.nearby) || []}
          onNearby={p.onNearby}
          canFind={p.canFind}
        />
        {/* On a phone the leads under the map are the list's own rows, not the map's boxed list of its own: one row for
            every list (tokens.css), and the same press opens the same peek. */}
        {phone ? table : null}
      </>
    );
  if (p.view.cls === "review" && p.benchGroups.length && !phone)
    return (
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
    );
  return p.firstDay ? firstDayOf(p) : table;
};

/** The next page: how many of how many are loaded, and Show more. */
const moreOf = (p: P) => (
  <div className="cl-section-sub ld-more" data-testid="leads-more">
    {p.rows.length.toLocaleString()} of {p.total.toLocaleString()} loaded{" "}
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={p.loadingMore}
      onClick={p.onMore}
      data-testid="leads-more-btn"
    >
      {p.loadingMore ? "Loading…" : "Show more"}
    </button>
  </div>
);

const bulkBarOf = (p: P, phone: boolean) => (
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
    write={p.writeToThem}
  />
);

/**
 * The peek (Task 12): the page's state and its setters, so its own acts (LeadPeekActions) are built from them on every
 * draw and nothing in the peek keeps state of its own. The acts are what the peek takes, so the setters go INTO
 * LeadPeekActions and the acts it returns go to the peek. Call is the acts' own: it arms "How did the call go?" and then
 * hands the tel: to the browser, which is exactly what C over the rows does (callLead). The deck is a phone's (D5).
 */
const peekOf = (p: P, phone: boolean) => {
  if (!p.peek) return null;
  const acts = LeadPeekActions({
    vm: p.peek,
    flash: p.flash,
    onOpenPerson: p.onOpenPerson,
    // Keep, Exclude, Put back and Copy are the scope's own (Task 11); the acts hand them on, so the peek has one shape of
    // props.
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
  return (
    <LeadPeek
      vm={p.peek}
      mode={p.peekMode}
      armed={p.armed}
      draft={p.draft}
      busy={p.bulkBusy}
      deck={phone ? p.deck : null}
      phone={phone}
      {...acts}
    />
  );
};

/** The scope's main column: the phone's bar, the scroller and what is in it, and what stands over it. */
const mainOf = (p: P, phone: boolean, railRows: ReactElement, sections: Sections) => {
  const search = p.search;
  const table = tableOf(p, phone, sections);
  const L = p.surface;
  return (
    <div className="cl-main">
      {phone && phoneBarOf(p)}
      <div className="cl-main-scroll pl-main" ref={p.scrollRef}>
        {!phone && deskTopOf(p)}

        {!p.firstDay && p.finderOpen && planPanelOf(p, phone)}

        {!search && !phone && !p.firstDay && !L.readFailed ? listHeadOf(p) : null}

        {/* One line for the open search: what happened, its three piles as the tabs that open them, and the one next step.
            The band rides inside the strip; with no strip to hold it, it stands alone as it did. */}
        {search && p.strip ? (
          <LeadStrip vm={p.strip} onAction={p.onStripAction}>
            {bandOf(p)}
          </LeadStrip>
        ) : null}
        {search && !p.strip && p.band && bandOf(p)}
        {p.reachOutStrip}
        {p.view.cls === "excluded" && (
          <LeadExcludedChips chips={ldExcludedChips(L.rows)} active={p.chip} onPick={p.onPickChip} />
        )}
        {p.view.cls === "review" && !p.benchGroups.length && (
          <LeadReviewGroups groups={leadReviewGroups(L.rows, search)} onPick={p.onSelectIds} />
        )}

        {scopeBodyOf(p, phone, table)}
        {L.next && moreOf(p)}
      </div>
      {p.listsNode}
      {p.sel.size > 0 && p.rows.some((l) => p.sel.has(l.id)) && bulkBarOf(p, phone)}
      {peekOf(p, phone)}
      {/* The phone's rail, as a sheet from the bar's list button: the same rows, the same counts, the same searches and
          the same New search. People's own sheet, which owns its Esc, so the page's one listener holds still while it is
          open (keys.sheetOpen). Last in the tree, after everything whose state a stub React keys by order. The photo,
          expanded (D5): the peek's own view model, drawn large with the facts about the place beside it. */}
      {p.lightbox ? <LeadLightbox vm={p.lightbox} onClose={p.onCloseLightbox} /> : null}
      {phone && p.listsOpen && <PeopleListsSheet onClose={p.onCloseLists}>{railRows}</PeopleListsSheet>}
      {p.toastNode}
    </div>
  );
};

export const LeadsScope = (p: P) => {
  // The same band People's cards use and the same one the page's listener judges the Columns menu by. The page hands it
  // down: it listens to the query, so a window resized past the band draws the other shape at once. Nothing here is a hook.
  const phone = !!p.phone;
  // Needs review on a phone: the pile as the table's own sections (ldReviewSections), never the bench.
  const sections =
    phone && p.view.cls === "review" && p.benchGroups.length
      ? ldReviewSections({ benchGroups: p.benchGroups, rows: p.rows, review: p.review, canFind: p.cellCtx.canFind })
      : null;
  const railRows = railRowsOf(p, phone);
  return (
    <div className="clients leads-scope" data-loading={p.loading ? "1" : undefined}>
      {/* The switch between the scopes is the frame's strip of views, over this page (surfaces/people/chrome.ts). At a
          phone's width the rail is the bar's list button (the stylesheet hides .cl-rail at 900px anyway). */}
      {!phone && (
        <PeopleRail scope="leads" active={null} onPick={NO_PICK}>
          {railRows}
        </PeopleRail>
      )}

      {mainOf(p, phone, railRows, sections)}
    </div>
  );
};
