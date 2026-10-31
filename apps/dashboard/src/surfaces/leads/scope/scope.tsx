/**
 * The Leads scope of People (moved from legacy/pages/leads-scope.jsx, decision 0015): the rail's lead rows and its kept
 * searches, the standing line, the controls, the table drawn with LEAD_COLUMNS, the bulk bar, and the three classes
 * (Qualified · Needs review · Excluded). Hookless, every one of them: every piece of state here is LeadsReal's
 * (../page/), where its one keyboard listener and the address can move it, and arrives as a prop; every act goes out
 * through the surface's doors (../surface.ts). Nothing here names the vendor: the owner sees Claude finding businesses,
 * and where each fact came from. Its parts are plain functions, never components, so its tree is the one it always drew.
 */
import type { ReactElement } from "react";
import { LEAD_WORDS, leadReviewGroups, type LeadPeekVM, type LeadRowVM } from "@chanlytics/contracts";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { PeopleListsSheet } from "../../people/rail/lists-sheet";
import { PL_TABLE_CLASSES } from "../../people/words";
import { PeopleRail } from "../../people/rail/people-rail";
import { PeopleStanding } from "../../people/rail/standing";
import { DataTable } from "../../kit/table/data-table";
import type { TableSection } from "../../kit/table/groups";
import { LeadBand } from "../bench/band";
import { LeadsBackToday } from "../pile/back-today";
import { LeadReviewBench } from "../bench/bench";
import { LeadExcludedChips, LeadReviewGroups, ldExcludedChips } from "../bench/chips";
import { LeadRowsCallMenu } from "../cells/call-menu";
import { LEAD_CARD } from "../cells/columns";
import { ldRowClass } from "../cells/name-cell";
import { LeadsFirstDay } from "../finder/first-day";
import { planPickTitle } from "../finder/plan-card";
import { LeadPlanPanel } from "../finder/plan-panel";
import { jobBack } from "../../people/sheets/phone-sheet";
import { LeadStrip } from "../finder/strip-view";
import { LeadMap } from "../map/map";
import { LeadPeekActions } from "../peek/acts";
import { LeadLightbox } from "../peek/lightbox";
import { LeadSheet } from "../sheet/sheet";
import { peekVMFor } from "../surface";
import type { LeadsScopeProps } from "../page/props";
import { LeadsBulkBar } from "./bulk-bar";
import { LeadsActs, LeadsControlsRight, LeadsHead } from "./controls";
import { LeadPlanSheet, LeadsImportAct, LeadsNewSearch, LeadsPhoneBar } from "./phone-bar";
import { LinkButton } from "../../kit/link-button/link-button";
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
    findPeopleDoor={p.findPeopleDoor}
    onAgain={p.onSearchAgain}
    exportFor={p.exportFor}
    onNew={p.onFind}
  />
);

/** The rows: the list's view, and on a phone the leads under the map too. */
const tableOf = (p: P, phone: boolean, sections: Sections) => (
  <DataTable
    table={p.model.table}
    state={p.table}
    classNames={PL_TABLE_CLASSES}
    busy={!!p.loading}
    noun="lead"
    columns={p.columns}
    card={phone ? LEAD_CARD : null}
    ctx={sections ? { ...p.cellCtx, sectioned: true } : p.cellCtx}
    rows={p.rows}
    swapRef={p.swapRef}
    rowClass={ldRowClass}
    sections={sections}
    total={p.total}
    sortBy={p.sortBy}
    sortDir={p.sortDir}
    onSort={p.onSort}
    onOpen={p.onPeek}
    filtered={p.filtered}
    onClearFilters={p.onClearFilters}
    selectable={p.canFind || p.canExport}
    selectMode={p.selectMode}
    onToggleAll={p.onToggleAll}
    cursor={p.cursor}
    onCursor={p.onCursor}
    empty={p.empty}
  />
);

/** While a selection is on, how many: all that match where those are picked, else the rows shown and selected. */
const selectedTitle = (p: P) => {
  if (!p.selectMode && !p.rows.some((l) => p.sel.has(l.id))) return null;
  const n = p.allMatching ? p.total : p.rows.filter((l) => p.sel.has(l.id)).length;
  return n ? `${n.toLocaleString()} selected` : "Select leads";
};

/** A phone's one bar stands over the scroller, as the Inbox's strip does: the rows scroll and bounce under it. */
const phoneBarOf = (p: P) => (
  <LeadsPhoneBar
    title={selectedTitle(p)}
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
    onFind={p.onFind}
    canFind={p.canFind}
    onImport={p.onImport}
    select={(p.canFind || p.canExport) && p.rows.length > 0 ? p.select : null}
    sortItems={p.sortItems}
    reach={p.reach}
    onReach={p.onReach}
  />
);

/** A desk's standing line (with the page's acts, which the frame's head draws at the strip's right) and controls row, over the rows. */
const deskTopOf = (p: P) => (
  <>
    <PeopleStanding
      scope="leads"
      leads={p.standing}
      onNeeds={p.onNeedsYou}
      act={<LeadsActs canFind={p.canFind} onFind={p.onFind} />}
    />

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
      <LeadsControlsRight p={p} />
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
      asSteps={phone}
      stage={p.finderStage}
      words={p.finderWords}
      proposal={p.finderProposal}
      plan={p.finderPlan}
      facts={p.finderFacts}
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
  return panel;
};

/** A phone's plan: the kit's sheet, its title the picker's while a word's choices are its step, with the way back. */
const planSheetOf = (p: P) => {
  // Over the first day too: an idea opens its plan there (00398).
  const open = !!p.finderOpen;
  const pick = open ? p.finderPick : null;
  return (
    <LeadPlanSheet
      open={open}
      onClose={p.onCloseFinder}
      title={
        pick
          ? planPickTitle(pick)
          : `${p.finderAnswering ? "Change the search" : "New search"}${p.finderChanged ? " · changed" : ""}`
      }
      back={pick ? jobBack(() => p.onFinderPick(null)) : null}
    >
      {open ? planPanelOf(p, true) : null}
    </LeadPlanSheet>
  );
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

/**
 * The first day: the question, the door to Ask (Find leads is Ask on this surface, spec F1) and the ideas, each a ready
 * plan the plan sheet opens (00398); and the door for a list the owner already has, which is the rail's on every other
 * day.
 */
const firstDayOf = (p: P, phone: boolean) => (
  <LeadsFirstDay
    suggestions={p.ideas}
    ideasReading={!!p.surface.ideasReading}
    canFind={p.canFind}
    phone={phone}
    lineOpen={p.lineOpen}
    lineDraft={p.lineDraft}
    lineError={p.lineError}
    lineBusy={p.lineBusy}
    lineWriting={p.lineWriting}
    lineOurs={p.lineOurs}
    onAsk={p.onAskFind}
    onIdea={p.onIdea}
    onImport={p.onImport}
    onOpenLine={p.onOpenLine}
    onNewIdeas={p.onNewIdeas}
    onLineDraft={p.onLineDraft}
    onSaveLine={p.onSaveLine}
    onLineForMe={p.onLineForMe}
    onCancelLine={p.onCancelLine}
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
  return p.firstDay ? firstDayOf(p, phone) : table;
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
    narrowed={p.narrowed}
    onSelectAllMatching={p.onSelectAllMatching}
    review={p.review}
    onClear={p.onClearSel}
    onCopyEmails={p.onCopyEmails}
    onNotAFit={p.onBulkNotAFit}
    whyOpen={p.bulkWhy}
    onWhyOpen={p.onBulkWhy}
    onExport={p.onExport}
    phone={phone}
    sheet={p.bulkSheet}
    onSheet={p.onBulkSheet}
    add={p.bulkAdd}
    search={p.bulkSearch}
  />
);

/**
 * The peek (Task 12): the page's state and its setters, so its own acts (LeadPeekActions) are built from them on every
 * draw and nothing in the peek keeps state of its own. The acts are what the peek takes, so the setters go INTO
 * LeadPeekActions and the acts it returns go to the peek. Call is the acts' own: it arms "How did the call go?" and then
 * hands the tel: to the browser, which is exactly what C over the rows does (callLead). The deck is a phone's (D5).
 */
const peekActsOf = (p: P, vm: LeadPeekVM) =>
  LeadPeekActions({
    vm,
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

/**
 * The lead sheet (canvas B v2): the panel of every lead opened on Leads, in a pile and out of one. In a pile, its lead is
 * the one up (on a desk the page's own peek follows it), and at the pile's end it says what happened; out of one, the
 * lead the page opened. Its acts are the peek's, so a draft, a call or a copy there is the peek's.
 */
const sheetOf = (p: P, phone: boolean) => {
  const pile = p.pileSheet;
  const vm = pile ? (p.sheetRow ? peekVMFor(p.sheetRow.id) : null) : p.peek;
  // A pile's end is drawn while the sheet is open: one the owner closed stays closed until the next lead comes up
  // (pile/page-pile.tsx), and was drawn as "Nothing left to decide" over the leads still to decide.
  if (!vm && (!pile || !p.sheetOpen)) return null;
  const on = vm ? peekActsOf(p, vm) : null;
  return (
    <LeadSheet
      row={p.sheetRow}
      vm={vm}
      phone={phone}
      tz={p.tz}
      mode={p.peekMode}
      armed={p.armed}
      draft={p.draft}
      busy={p.bulkBusy}
      deck={pile ? null : p.deck}
      on={on}
      aim={p.aim}
      pile={pile}
      searchId={p.sheetSearchId}
      flash={p.flash}
      onClose={() => {
        if (pile) pile.pile.stop();
        if (on) on.onClose();
      }}
    />
  );
};

/**
 * A phone's head act: Import leads where the page is the question (the first day, and New search pressed), else New
 * search; a desk's head holds none, its door for a list standing under the question.
 */
const headActOf = (p: P, phone: boolean) =>
  !phone ? undefined : p.firstDay || p.newSearch ? (
    <LeadsImportAct onImport={p.onImport} />
  ) : (
    <LeadsNewSearch canFind={p.canFind} onFind={() => p.onNewSearch(true)} />
  );

/** A phone's New search: the first day's page, the question alone, with the way back to the leads it stood over. */
const newSearchOf = (p: P, phone: boolean) => (
  <>
    <LinkButton className="ld-first-back" onClick={() => p.onNewSearch(false)} data-testid="leads-new-search-back">
      <Icon name="chevron" size={12} /> All leads
    </LinkButton>
    {firstDayOf(p, phone)}
  </>
);

/** The scope's main column: the phone's bar, the scroller and what is in it, and what stands over it. */
/** Back today (00426, decision 9): who asked to hear back on a day that has come, over the lists, never over a search. */
const backTodayOf = (p: P) => (!p.search && !p.firstDay && !p.surface.readFailed ? <LeadsBackToday /> : null);

/** While a lead's sheet is open beside the rows, a row's hover card would say again what the sheet says (leads.css). */
const sheetMarkOf = (p: P) => (p.peek || p.pileSheet ? "" : undefined);

const mainOf = (p: P, phone: boolean, railRows: ReactElement, sections: Sections) => {
  const search = p.search;
  const table = tableOf(p, phone, sections);
  const L = p.surface;
  return (
    <div className="cl-main">
      {/* On the first day the page is its question alone (finder/first-day.tsx): no bar on a phone and no standing line,
          search or columns on a desk, since with no lead there is nothing for them to act on; the head says the page's
          name. A phone's head holds New search past the first day (phone-bar.tsx LeadsNewSearch), and its bar Import; a
          desk's first day holds no act beside the page's own door, and keeps the door for a list under it. */}
      {phone && !p.firstDay && !p.newSearch && phoneBarOf(p)}
      <div className="cl-main-scroll pl-main" ref={p.scrollRef} data-sheet={sheetMarkOf(p)}>
        {phone || p.firstDay ? <LeadsHead act={headActOf(p, phone)} /> : deskTopOf(p)}
        {p.newSearch ? (
          newSearchOf(p, phone)
        ) : (
          <>
            {!phone && p.finderOpen && planPanelOf(p, false)}

            {!search && !phone && !p.firstDay && !L.readFailed ? listHeadOf(p) : null}
            {backTodayOf(p)}

            {/* One line for the open search: what happened, its three piles as the tabs that open them, and the one next step.
            The band rides inside the strip; with no strip to hold it, it stands alone as it did. */}
            {search && p.strip ? (
              <LeadStrip vm={p.strip} onAction={p.onStripAction}>
                {bandOf(p)}
              </LeadStrip>
            ) : null}
            {search && !p.strip && p.band && bandOf(p)}
            {p.pileDoor}
            {p.addsGoTo}
            {p.view.cls === "excluded" && (
              <LeadExcludedChips chips={ldExcludedChips(L.rows)} active={p.chip} onPick={p.onPickChip} />
            )}
            {p.view.cls === "review" && !p.benchGroups.length && (
              <LeadReviewGroups groups={leadReviewGroups(L.rows, search)} onPick={p.onSelectIds} />
            )}

            {scopeBodyOf(p, phone, table)}
            {L.next && moreOf(p)}
          </>
        )}
      </div>
      {p.listsNode}
      {phone ? planSheetOf(p) : null}
      {(p.selectMode || (p.sel.size > 0 && p.rows.some((l) => p.sel.has(l.id)))) && bulkBarOf(p, phone)}
      {sheetOf(p, phone)}
      {/* The phone's rail, as a sheet from the bar's list button: the same rows, the same counts, the same searches and
          the same New search. People's, the kit's Sheet, in PL_OVERLAY while it is open, so the page's one listener holds
          still behind it. Last in the tree, after everything whose state a stub React keys by order. The photo,
          expanded (D5): the peek's own view model, drawn large with the facts about the place beside it. */}
      {p.lightbox ? <LeadLightbox vm={p.lightbox} onClose={p.onCloseLightbox} /> : null}
      {phone ? (
        <PeopleListsSheet
          open={!!p.listsOpen}
          onClose={p.onCloseLists}
          title={`${LEAD_WORDS.viewsHeading} and ${LEAD_WORDS.searchesHeading.toLowerCase()}`}
        >
          {p.listsOpen ? railRows : null}
        </PeopleListsSheet>
      ) : null}
      {p.toastNode}
      {/* The rows' one Call menu, opened by a row's Call with its lead (cells/call-menu.tsx): it draws nothing here, and
          on the body while open. Last, so nothing before it moves for the stub React. */}
      <LeadRowsCallMenu handle={p.cellCtx.callMenu} acts={p.cellCtx} />
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
    <div
      ref={p.scopeView?.ref}
      data-slide={p.scopeView?.slide}
      className={p.firstDay ? "clients leads-scope no-rail" : "clients leads-scope"}
      data-loading={p.loading ? "1" : undefined}
      data-first-day={p.firstDay ? "" : undefined}
    >
      {/* The switch between the scopes is the frame's strip of views, over this page (surfaces/people/chrome.ts). At a
          phone's width the rail is the bar's list button (the stylesheet hides .cl-rail at 900px anyway). On the first
          day every list and search in it is empty, so it stands down and the page takes its column (.no-rail). */}
      {!phone && !p.firstDay && (
        <PeopleRail scope="leads" active={null} onPick={NO_PICK}>
          {railRows}
        </PeopleRail>
      )}

      {mainOf(p, phone, railRows, sections)}
    </div>
  );
};
