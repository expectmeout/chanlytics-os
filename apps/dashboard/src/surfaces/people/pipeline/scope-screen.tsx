/**
 * PipelineScope's elements, one concern to a function (moved from legacy/pages/pipeline-scope.jsx PipelineScope,
 * decision 0015): the switch and the rail, a phone's top, the line over the table, the controls row, the board or the
 * table, the peek, the sheets and a selection's bar. Each is a plain function of the page's state, so the tree keeps the
 * nodes the JSX drew.
 */
import { Fragment } from "react";
import { Icon } from "../../kit/icon/icon";
import { PeopleBulkBar } from "../bulk/bulk-bar";
import { PeopleListsSheet } from "../rail/lists-sheet";
import { PeoplePhoneBar } from "../rail/phone-bar";
import { PeopleScopeTabs } from "../rail/scope-tabs";
import { PeopleColumnsMenu } from "../table/columns-menu";
import { PeopleTable } from "../table/table";
import { PL_SEARCH_LABEL } from "../words";
import { PipelineBoard } from "./board";
import { pipeCardRow } from "./columns";
import { PipelineNew } from "./new";
import { PipelinePeek } from "./peek";
import { P } from "./pipe";
import { PipelineRailRows } from "./rail";
import { PipelinePassMany } from "./row";
import { PIPE_BULK_ACTS, PIPE_LAYOUTS, pipeComposeIn, pipeThreadRoute } from "./scope-bits";
import { EMPTY_ADD } from "./scope-state";
import type { PipelineState } from "./scope-hook";

/** The line over the table, People's standing line in its parts: only the parts that have something, and those that count what waits on the owner press to their view. */
function standingLine(s: PipelineState) {
  const { line, r, pickView } = s;
  const { view } = r;
  return (
    line.length > 0 && (
      <div className="pl-standing" data-testid="pipeline-summary">
        {line.map((part, i) => {
          const pv = part.view;
          const said = pv ? (
            <button
              type="button"
              className={`pl-standing-needs${view === part.view ? " on" : ""}`}
              aria-pressed={view === part.view}
              onClick={() => pickView(pv)}
              data-testid={`pipeline-line-${part.view}`}
            >
              {part.words}
            </button>
          ) : (
            <span className={i === 0 ? "pl-standing-total" : "pl-standing-reached"}>{part.words}</span>
          );
          return i === 0 ? (
            <Fragment key={i}>{said}</Fragment>
          ) : (
            <span key={i} className="pl-standing-part">
              <span className="pl-standing-dot" aria-hidden="true">
                ·
              </span>
              {said}
            </span>
          );
        })}
      </div>
    )
  );
}

/** The controls row: the search, which columns show, the list or the board, and the page's one filled button. */
function controlsRow(s: PipelineState) {
  const { f, r, newActs, newGate } = s;
  const {
    q,
    setQ,
    searchRef,
    colsOpen,
    setColsOpen,
    colOptions,
    pickColumn,
    colsButton,
    clearSelection,
    setExtraView,
  } = f.controls;
  const { board, layout } = r;
  const { words } = P;
  return (
    <div className="cl-controls">
      <div className="cl-search-wrap">
        <Icon name="search" size={13} />
        <input
          ref={searchRef}
          placeholder={`${PL_SEARCH_LABEL}…`}
          aria-label={PL_SEARCH_LABEL}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="pipeline-search"
        />
      </div>
      <div className="cl-controls-right">
        {/* Which columns show, a member's own, kept in their view: People's menu (table/columns-menu.tsx). */}
        {!board ? (
          <PeopleColumnsMenu
            open={colsOpen}
            onOpenChange={setColsOpen}
            options={colOptions}
            onPick={pickColumn}
            buttonRef={colsButton}
          />
        ) : null}
        {/* The list or the board: the house's small tab pair, a pressed state each, kept in the member's view. */}
        <div className="cl-tabs pipe-views" role="group" aria-label={words.views.label} data-testid="pipeline-views">
          {PIPE_LAYOUTS.map((v) => (
            <button
              key={v}
              type="button"
              className={`cl-tab${layout === v ? " active" : ""}`}
              aria-pressed={layout === v}
              onClick={() => {
                if (v === "board") clearSelection();
                setExtraView({ layout: v });
              }}
              data-testid={`pipeline-view-${v}`}
            >
              {words.views[v as "list" | "board"]}
            </button>
          ))}
        </div>
        {/* The page's one filled button: shown to every role, and said why where the role may not press it. */}
        <button
          type="button"
          className="btn btn-primary btn-sm pipe-new-btn"
          onClick={newActs.openNew}
          data-testid="pipeline-new-open"
          {...newGate}
        >
          <Icon name="plus" size={12} /> {words.newProposal.button}
        </button>
      </div>
    </div>
  );
}

/** The rows: the board, or the table in its groups. */
function rowsView(s: PipelineState) {
  const { f, ui, r, place, d, tableColumns, boardColumns, boardActs, emptyWords } = s;
  const { phone, sel, toggleSel, sortBy, sortDir, onSort, setQ, scrolledX, setScrolledX } = f.controls;
  const { canRecord, selectable, shown, sections, viewCount, searching } = r;
  const { cursor, setCursor, rowBudget, toggleAll } = place;
  if (boardColumns) {
    return (
      <PipelineBoard
        columns={boardColumns}
        cursor={cursor}
        canDrag={canRecord}
        drag={ui.drag}
        over={ui.over}
        moveOf={boardActs.moveOf}
        onOpen={s.doors.openPeek}
        onWarm={d.ctx.onWarm}
        onDragStart={(row, from) => ui.setDrag({ id: row.id, from, row })}
        onDragEnd={boardActs.dragEnd}
        onDragOver={(key) => {
          if (ui.over !== key) ui.setOver(key);
        }}
        onDragLeave={(key) => {
          if (ui.over === key) ui.setOver(null);
        }}
        onDrop={boardActs.drop}
        onMove={boardActs.moveTo}
        every={ui.every}
        onEvery={(key) => ui.setEvery((e) => ({ ...e, [key]: true }))}
      />
    );
  }
  return (
    <PeopleTable
      budget={rowBudget}
      noun="person"
      columns={tableColumns}
      ctx={d.ctx}
      selectable={selectable}
      sel={sel}
      onToggle={toggleSel}
      onToggleAll={toggleAll}
      rows={shown}
      sections={sections}
      total={viewCount}
      sortBy={sortBy}
      sortDir={sortDir}
      onSort={onSort}
      onOpen={s.doors.openPeek}
      filtered={searching}
      onClearFilters={() => setQ("")}
      cursor={cursor}
      onCursor={setCursor}
      rowClass={phone ? pipeCardRow : null}
      scrolled={scrolledX}
      onScrolled={setScrolledX}
      empty={emptyWords}
    />
  );
}

/** A phone's top: the scopes as the Inbox's tab strip, then the bar -- the view shown (its rows in a sheet), search, and New proposal's +. */
function phoneBar(s: PipelineState) {
  const { f, ui, r, onScope, newActs, newGate } = s;
  const { q, setQ, searchRef, searchOpen, setSearchOpen } = f.controls;
  const { words } = P;
  return (
    <PeoplePhoneBar
      scope="pipeline"
      dealsOn
      onScope={onScope}
      listLabel={P.viewLabel(r.view, r.pace)}
      listCount={r.viewCount}
      onLists={() => ui.setListsOpen(true)}
      listsOpen={ui.listsOpen}
      q={q}
      onQ={setQ}
      searchRef={searchRef}
      searchOpen={searchOpen}
      onSearchOpen={setSearchOpen}
      searchLabel={PL_SEARCH_LABEL}
      trailing={
        <button
          type="button"
          className="pp-bar-icon"
          aria-label={words.newProposal.button}
          onClick={newActs.openNew}
          data-testid="pipeline-new-open"
          {...newGate}
        >
          <Icon name="plus" size={18} />
        </button>
      }
      testid="pipeline"
    />
  );
}

/** The peek, beside the rows on a desk and the whole screen on a phone (leads.css .pl-peek). */
function peekBlock(s: PipelineState) {
  const { f, ui, r, doors, d, pk, person } = s;
  const { phone, plFlash } = f.controls;
  const { peek, peekId } = ui;
  if (!pk.peekVm) return null;
  const vm = pk.peekVm;
  return (
    <PipelinePeek
      vm={vm}
      person={person}
      failed={peek && peek.id === peekId ? peek.failed : null}
      canRecord={r.canRecord}
      phone={phone}
      onClose={doors.closePeek}
      onRetry={() => ui.setPeekTry((n) => n + 1)}
      onOpenPage={() => d.pageRef.current(vm.id)}
      onOpenThread={() => f.nav(pipeThreadRoute(vm.thread))}
      onCompose={(text) => pipeComposeIn(person, text, f.nav)}
      flash={plFlash}
    />
  );
}

/** A phone's views: the rail's rows as a sheet, a pick closes it. */
function sheetsBlock(s: PipelineState) {
  const { f, ui, r, pickView } = s;
  const { words } = P;
  return f.controls.phone && ui.listsOpen ? (
    <PeopleListsSheet title={words.rail.sheet} onClose={() => ui.setListsOpen(false)}>
      <aside className="cl-rail pipe-rail" data-testid="pipeline-rail">
        <PipelineRailRows compact sections={r.rail} view={r.view} onPick={pickView} />
      </aside>
    </PeopleListsSheet>
  ) : null;
}

/** New proposal: pick or add a person, then the sheet. */
function newBlock(s: PipelineState) {
  const { f, ui, r, newActs } = s;
  if (!ui.newOpen) return null;
  return (
    <PipelineNew
      phone={f.controls.phone}
      rows={r.rows}
      q={ui.newQ}
      add={ui.newAdd}
      onQ={ui.setNewQ}
      onPick={newActs.pickForNew}
      onAddOpen={() => {
        ui.setNewAdd({ ...EMPTY_ADD, open: true });
        ui.setNewFocus({ row: "add" });
      }}
      focusOn={ui.newFocus}
      onAddDraft={(patch) => ui.setNewAdd((x) => ({ ...x, ...patch }))}
      onAdd={newActs.addForNew}
      onClose={() => {
        ui.setNewOpen(false);
        ui.setNewAdd(EMPTY_ADD);
      }}
    />
  );
}

/** A selection: People's own bar, with the Pipeline's Mark as passed first and People's lists and export. */
function bulkBlock(s: PipelineState) {
  const { f, r, picked } = s;
  const { sel, setSel, canExport, clearSelection, plFlash } = f.controls;
  const { people } = f;
  if (!(picked.length > 0)) return null;
  return (
    <PeopleBulkBar
      sel={sel}
      rows={r.shown.map((row) => row.person)}
      saved={people.saved || []}
      savedRead={people.savedRead !== false}
      canEdit={r.canRecord}
      canExport={canExport}
      onClear={clearSelection}
      onKeep={(rest) => setSel(new Set(rest))}
      flash={plFlash}
      acts={PIPE_BULK_ACTS}
      lead={
        <PipelinePassMany
          rows={picked}
          flash={plFlash}
          onDone={(passed) =>
            setSel((cur) => {
              const n = new Set(cur);
              for (const id of passed) n.delete(id);
              return n;
            })
          }
        />
      }
    />
  );
}

export function pipelineScreen(s: PipelineState) {
  const { f, pk, onScope } = s;
  const { phone, scrollRef, toastNode } = f.controls;
  return (
    <div className="clients pipe-scope" data-testid="pipeline">
      {/* People's switch over the Pipeline's own rail. A phone's are the bar's: its first row and its list button. */}
      {!phone && <PeopleScopeTabs scope="pipeline" onScope={onScope} dealsOn />}
      {!phone && (
        <aside className="cl-rail pipe-rail" data-testid="pipeline-rail">
          <PipelineRailRows sections={s.r.rail} view={s.r.view} onPick={s.pickView} />
        </aside>
      )}
      <div className={`cl-main${pk.compact ? " has-peek" : ""}`}>
        {phone && phoneBar(s)}
        <div className="cl-main-scroll pl-main" ref={scrollRef}>
          {standingLine(s)}
          {!phone && controlsRow(s)}
          {rowsView(s)}
        </div>
        {peekBlock(s)}
        {sheetsBlock(s)}
        {newBlock(s)}
        {bulkBlock(s)}
        {toastNode}
      </div>
    </div>
  );
}
