/**
 * PipelineScope's elements, one concern to a function (moved from legacy/pages/pipeline-scope.jsx PipelineScope,
 * decision 0015): the switch and the rail, a phone's top, the line over the table, the controls row, the board or the
 * table, the peek, the sheets and a selection's bar. Each is a plain function of the page's state, so the tree keeps the
 * nodes the JSX drew.
 */
import { Fragment } from "react";
import { PIPELINE_PHONE_SORTS, pipelineCsv } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { downloadCsv } from "../../kit/download";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { gate } from "../../legacy-verbs";
import { menuGroups } from "../menu-groups";
import { PeopleBulkBar } from "../bulk/bulk-bar";
import { PeopleListsSheet } from "../rail/lists-sheet";
import { BarWord, PeoplePhoneBar, SELECT_WORDS } from "../rail/phone-bar";
import { PeopleColumnsMenu } from "../table/columns-menu";
import { PeopleTable } from "../table/table";
import { PL_SEARCH_LABEL } from "../words";
import { PipelineBoard } from "./board";
import { PL_FILE_COLUMNS } from "../cells/columns";
import { pipeCardRow } from "./columns";
import { PipelineNew } from "./new";
import { PipelinePeek } from "./peek";
import { P } from "./pipe";
import { PipelineRailRows } from "./rail";
import { PipelinePassDock, PipelinePassMany } from "./row";
import { PIPE_BULK_ACTS, PIPE_LAYOUTS, pipeComposeIn, pipeThreadRoute } from "./scope-bits";
import { EMPTY_ADD } from "./scope-state";
import type { PipelineState } from "./scope-hook";

type LinePart = PipelineState["line"][number];

/**
 * The line over the table, People's standing line in its parts: only the parts that have something, and those that count
 * what waits on the owner press to their view. Each fact is one span, a part and those that go on with it (contracts'
 * `joins`: a total's worth beside its count), so a phone sets each fact on a line of its own and a dot never starts one.
 */
function standingLine(s: PipelineState) {
  const { line, r, pickView } = s;
  const { view } = r;
  const said = (part: LinePart, i: number) => {
    const pv = part.view;
    return pv ? (
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
  };
  const facts: { key: number; parts: { part: LinePart; i: number }[] }[] = [];
  line.forEach((part, i) => {
    const last = facts.at(-1);
    if (part.joins && last) last.parts.push({ part, i });
    else facts.push({ key: i, parts: [{ part, i }] });
  });
  return (
    line.length > 0 && (
      <div className="pl-standing" data-testid="pipeline-summary">
        {facts.map((fact) => (
          <span key={fact.key} className="pl-standing-fact">
            {fact.parts.map(({ part, i }) =>
              i === 0 ? (
                <Fragment key={i}>{said(part, i)}</Fragment>
              ) : (
                <span key={i} className="pl-standing-part">
                  <span className="pl-standing-dot" aria-hidden="true">
                    ·
                  </span>
                  {said(part, i)}
                </span>
              ),
            )}
          </span>
        ))}
      </div>
    )
  );
}

/**
 * A phone's line over the rows (Ruben, 10 Oct 2026): the counts as filters, each the view it names with its dot -- out,
 * waiting, lapsed, clients -- one press to show it and again to show all; then what they come to, said once. The three
 * lines it was said the counts and their worth again under the bar, the rail and the group heads, and pressed only two.
 */
function phoneFilters(s: PipelineState) {
  const { r, pickView } = s;
  const { filters, money } = r.all;
  if (!filters.length && !money) return null;
  const on = filters.some((x) => x.view === r.view);
  return (
    <div className="pipe-summary" data-testid="pipeline-summary">
      {filters.length ? (
        <div className={`pipe-filters${on ? " is-on" : ""}`} role="group" aria-label="Show">
          {filters.map((x) => (
            <Button
              key={x.view}
              variant="plain"
              size="sm"
              className="pipe-filter"
              aria-pressed={r.view === x.view}
              onClick={() => pickView(x.view)}
              data-testid={`pipeline-filter-${x.view}`}
            >
              <span className={`pipe-filter-dot tone-${x.tone}`} aria-hidden="true" />
              {x.words}
            </Button>
          ))}
        </div>
      ) : null}
      {money ? <p className="pipe-money">{money}</p> : null}
    </div>
  );
}

/** A selection on a phone: Select is on, or a deal is picked. */
const pipeSelecting = (s: PipelineState) => s.f.controls.phone && (s.f.controls.selectMode || s.picked.length > 0);

/** The bar's Select walks a selection as People's does (screen.tsx selectStep): Select, Select all, Cancel. */
function pipeSelectStep(s: PipelineState) {
  const { sel, setSel, setSelectMode, clearSelection } = s.f.controls;
  const shown = s.r.shown;
  if (!pipeSelecting(s)) return { word: "Select", press: () => setSelectMode(true) };
  if (shown.length && shown.every((row) => sel.has(row.id))) return { word: "Cancel", press: clearSelection };
  return { word: "Select all", press: () => setSel(new Set(shown.map((row) => row.id))) };
}

/**
 * The bar's words, as People's Select, Sort and Export stand (Ruben, 10 Oct 2026): Select walks a selection, Sort opens
 * the sorts a desk's headings give (contracts PIPELINE_PHONE_SORTS), Export writes the deals shown as a file.
 */
function phoneBarWords(s: PipelineState) {
  const { f, r } = s;
  const { sortBy, sortDir, pickSort, canExport, plFlash } = f.controls;
  const select = pipeSelectStep(s);
  const exportDeals = () => {
    downloadCsv(`pipeline-${new Date().toISOString().slice(0, 10)}.csv`, pipelineCsv(r.shown));
    plFlash({ msg: <>{r.shown.length} exported as a CSV</> });
  };
  return (
    <div className="pp-bar-acts">
      {r.selectable && r.shown.length > 0 ? (
        <Button variant="plain" size="sm" onClick={select.press} data-testid="pipeline-phone-select">
          <BarWord word={select.word} words={SELECT_WORDS} />
        </Button>
      ) : null}
      <Menu
        label="Sort"
        groups={menuGroups(
          PIPELINE_PHONE_SORTS.map((x) => ({
            label: x.label,
            checked: sortBy === x.by && sortDir === x.dir,
            onClick: () => pickSort(x.by, x.dir),
          })),
        )}
        trigger={
          <Button variant="plain" size="sm" data-testid="pipeline-phone-sort">
            Sort
          </Button>
        }
      />
      <Button
        variant="plain"
        size="sm"
        onClick={exportDeals}
        data-testid="pipeline-phone-export"
        {...(canExport ? {} : gate("export", "export these deals"))}
      >
        Export
      </Button>
    </div>
  );
}

/** The controls row: the search, which columns show, the list or the board, and the page's one filled button. */
function controlsRow(s: PipelineState) {
  const { f, r } = s;
  const { q, setQ, searchRef, colOptions, pickColumn, layout: tableLayout, clearSelection, setExtraView } = f.controls;
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
        {!board ? <PeopleColumnsMenu options={colOptions} onPick={pickColumn} layout={tableLayout} /> : null}
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
        {/* The page's one filled button stands in the frame's head, at the right of the row of views (standing.tsx,
            canvas D1), not here. */}
      </div>
    </div>
  );
}

/** The rows: the board, or the table in its groups. */
function rowsView(s: PipelineState) {
  const { f, ui, r, place, d, tableColumns, boardColumns, boardActs, emptyWords } = s;
  const { phone, sel, toggleSel, sortBy, sortDir, onSort, setQ, scrolledX, setScrolledX, selectMode } = f.controls;
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
      noun="deal"
      selectMode={phone && selectMode}
      columns={tableColumns}
      ctx={d.ctx}
      selectable={selectable}
      sel={sel}
      onToggle={toggleSel}
      onToggleAll={toggleAll}
      rows={shown}
      sections={sections}
      swapRef={f.swap}
      total={viewCount}
      sortBy={sortBy}
      sortDir={sortDir}
      onSort={onSort}
      // While a phone selects, a tap on a row picks it rather than opening it, as People's does.
      onOpen={pipeSelecting(s) ? toggleSel : s.doors.openPeek}
      filtered={searching}
      onClearFilters={() => setQ("")}
      cursor={cursor}
      onCursor={setCursor}
      rowClass={phone ? pipeCardRow : null}
      scrolled={scrolledX}
      onScrolled={setScrolledX}
      layout={f.controls.layout}
      empty={emptyWords}
    />
  );
}

/**
 * A phone's top: the scopes as the Inbox's tab strip, then the bar -- the view shown (its rows in a sheet), the bar's words
 * and search. New proposal is the head's act beside the page's name, with its words (standing.tsx, 7 Oct 2026). While a
 * selection is on, how many stands in the view's place.
 */
function phoneBar(s: PipelineState) {
  const { f, ui, r } = s;
  const { q, setQ, searchRef } = f.controls;
  return (
    <PeoplePhoneBar
      listLabel={P.viewLabel(r.view, r.pace)}
      listCount={r.viewCount}
      onLists={() => ui.setListsOpen(true)}
      listsOpen={ui.listsOpen}
      q={q}
      onQ={setQ}
      searchRef={searchRef}
      searchLabel={PL_SEARCH_LABEL}
      testid="pipeline"
      title={pipeSelecting(s) ? (s.picked.length ? `${s.picked.length} selected` : "Select deals") : null}
      trailing={phoneBarWords(s)}
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
      onOpenPage={() => d.pageRef.current(P.personOf(vm.id))}
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
  return f.controls.phone ? (
    <PeopleListsSheet open={ui.listsOpen} title={words.rail.sheet} onClose={() => ui.setListsOpen(false)}>
      {ui.listsOpen ? (
        <aside className="cl-rail pipe-rail" data-testid="pipeline-rail">
          <PipelineRailRows compact sections={r.rail} view={r.view} onPick={pickView} />
        </aside>
      ) : null}
    </PeopleListsSheet>
  ) : null;
}

/** New proposal: pick or add a person, then the sheet. */
function newBlock(s: PipelineState) {
  const { f, ui, r, newActs } = s;
  return (
    <PipelineNew
      open={ui.newOpen}
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

/**
 * A selection: People's own bar, with the Pipeline's Mark as passed first and People's lists and export; on a phone its
 * dock (Clear, Passed, Add to list, Export), drawn from Select's press, before anyone is picked.
 */
function bulkBlock(s: PipelineState) {
  const { f, r, picked } = s;
  const { sel, setSel, canExport, clearSelection, plFlash, phone, bulkSheet, setBulkSheet } = f.controls;
  const { people } = f;
  if (!(picked.length > 0) && !pipeSelecting(s)) return null;
  const passed = (ids: string[]) =>
    setSel((cur) => {
      const n = new Set(cur);
      for (const id of ids) n.delete(id);
      return n;
    });
  // People's bar acts on people (0029: a person with two open deals has a row for each): the people shown, each once,
  // and those with any row picked; what it keeps of a selection is every picked row of theirs.
  const shownPeople = [...new Map(r.shown.map((row) => [row.person.id, row.person])).values()];
  const pickedPeople = new Set(r.shown.filter((row) => sel.has(row.id)).map((row) => row.person.id));
  return (
    <PeopleBulkBar
      fileColumns={PL_FILE_COLUMNS}
      sel={pickedPeople}
      rows={shownPeople}
      saved={people.saved || []}
      savedRead={people.savedRead !== false}
      canEdit={r.canRecord}
      canExport={canExport}
      onClear={clearSelection}
      onKeep={(rest) => {
        const keep = new Set(rest);
        setSel(new Set(r.shown.filter((row) => sel.has(row.id) && keep.has(row.person.id)).map((row) => row.id)));
      }}
      flash={plFlash}
      acts={PIPE_BULK_ACTS}
      phone={phone}
      sheet={phone ? bulkSheet : null}
      onSheet={setBulkSheet}
      lead={
        phone ? (
          <PipelinePassDock rows={picked} flash={plFlash} onDone={passed} />
        ) : (
          <PipelinePassMany rows={picked} flash={plFlash} onDone={passed} />
        )
      }
    />
  );
}

export function pipelineScreen(s: PipelineState) {
  const { f, pk } = s;
  const { phone, scrollRef, toastNode } = f.controls;
  return (
    <div className="clients pipe-scope" data-testid="pipeline">
      {/* People's switch is the frame's strip of views over this page (surfaces/people/chrome.ts). A phone's rail is the bar's list button. */}
      {!phone && (
        <aside className="cl-rail pipe-rail" data-testid="pipeline-rail">
          <PipelineRailRows sections={s.r.rail} view={s.r.view} onPick={s.pickView} />
        </aside>
      )}
      <div className={`cl-main${pk.compact ? " has-peek" : ""}`}>
        {phone && phoneBar(s)}
        <div className="cl-main-scroll pl-main" ref={scrollRef}>
          {phone ? phoneFilters(s) : standingLine(s)}
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
