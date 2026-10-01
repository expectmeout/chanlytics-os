/**
 * The elements People's page returns, made where they always stood (moved whole from legacy/pages/people.jsx,
 * decision 0015): plain functions of the page's state (`s`), called in the order JSX made them, so every component draws in
 * its place and keeps its state there.
 */
import { canDo, gate, navigate } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { PeopleBulkBar } from "../bulk/bulk-bar";
import { plCardRowClass } from "../cells/columns";
import { PeopleImportSheet } from "../import/import-sheet";
import { DeleteListButton, ListTitle } from "../lists/list-title";
import { plArchivedWords } from "../lists/doors";
import { RuleEditor } from "../lists/rule-editor";
import { SaveShownAsList } from "../lists/save-shown";
import { PeopleRail } from "../rail/people-rail";
import { PeopleListsSheet } from "../rail/lists-sheet";
import { PeoplePhoneBar } from "../rail/phone-bar";
import { PeopleScopeTabs } from "../rail/scope-tabs";
import { PeopleStanding } from "../rail/standing";
import { PeopleAddSheet, PeopleListActSheet } from "../sheets/list-sheets";
import { AddPersonButton } from "../sheets/add-person";
import { PeopleColumnsMenu } from "../table/columns-menu";
import { PeopleTable } from "../table/table";
import type { TableEmpty } from "../types";
import { PL_DEFAULT_GROUPS, PL_NO_LISTS, PL_SEARCH_LABEL, PL_TAB_LABEL, plLoadedWords, plScopeRoute } from "../words";
import type { PeopleState } from "./state";
import { peoplePhoneMenu } from "./phone-menu";
import type { MoreMenuItem } from "../../kit/more-menu/more-menu";

/** Nobody to show: a list that isn't here, or one of the member's own with nobody on it. */
function peopleTableEmpty(s: PeopleState): TableEmpty | null {
  const { listGone, canEditLists, restoreList, setListId, setSavedId, activeSaved, tab, listId, q } = s;
  const showEveryone = { label: "Show everyone", onClick: () => setSavedId(null) };
  if (listGone) {
    const archived = listGone.archived;
    return {
      title: listGone.title,
      body: listGone.body,
      action:
        archived && canEditLists
          ? { label: "Bring it back", onClick: () => void restoreList(archived) }
          : {
              label: "Show everyone",
              onClick: () => {
                setListId(null);
                setSavedId(null);
              },
            },
    };
  }
  if (activeSaved && activeSaved.count === 0 && tab === "all" && !listId && !q.trim()) {
    return activeSaved.unknown
      ? { title: `${activeSaved.name} can't be counted right now`, body: activeSaved.unknown, action: showEveryone }
      : activeSaved.byHand
        ? {
            title: `Nobody on ${activeSaved.name} yet`,
            body: "Pick people and use Add to list, or add them from their profile.",
            action: showEveryone,
          }
        : {
            title: `Nobody on ${activeSaved.name} right now`,
            body: "It keeps itself current: its people appear here when its rule holds for them.",
            action: showEveryone,
          };
  }
  return null;
}

/** The list's head: its title (the list IS the page's title while it is open), what it can do, and the state filter's chip. */
function peopleListHead(s: PeopleState) {
  const {
    activeSaved,
    activeList,
    listGone,
    canEditLists,
    plFlash,
    setRuleEditing,
    setListId,
    setSavedId,
    canPin,
    pinned,
    pinBusy,
    togglePin,
    tab,
    setTab,
    filtered,
    shown,
    viewRule,
    shownIds,
    openMade,
  } = s;
  return (
    <div className="cl-section-head">
      <div className="cl-section-lead">
        {/* The count is the line above and the table's own foot; here it would be a third. A list picked is the title, not a
            chip beside "Everyone": the table IS that list, so its name, its rename and its delete sit on the one line, where
            the Lists page had them over a second table of the same people. */}
        {activeSaved ? (
          <ListTitle
            list={activeSaved}
            canEdit={canEditLists}
            onRenamed={(n) =>
              plFlash({
                msg: (
                  <>
                    Renamed to <b>{n}</b>
                  </>
                ),
              })
            }
            onEditRule={() => setRuleEditing(true)}
          />
        ) : activeList ? (
          <span className="cl-section-title" data-testid="smart-filter">
            <Icon name="sparkle" size={12} />
            {activeList.label}
          </span>
        ) : listGone ? (
          <span className="cl-section-title" data-testid="list-gone">
            {listGone.title}
          </span>
        ) : (
          <span className="cl-section-title">Everyone</span>
        )}
        {(activeList || activeSaved || listGone) && (
          <button
            type="button"
            className="cl-bucket-link"
            onClick={() => {
              setListId(null);
              setSavedId(null);
            }}
            data-testid="show-everyone"
          >
            Show everyone
          </button>
        )}
        {canPin && (
          <button
            type="button"
            className={`cl-bucket-link cl-list-pin${pinned ? " is-on" : ""}`}
            aria-pressed={pinned}
            disabled={pinBusy}
            onClick={togglePin}
            data-testid="list-pin"
          >
            {pinned ? "On Today" : "Pin to Today"}
          </button>
        )}
        {activeSaved && canEditLists && (
          <DeleteListButton
            list={activeSaved}
            onDeleted={(r) => {
              if (r.archived) plFlash({ msg: plArchivedWords(activeSaved.name, r) });
              setSavedId(null);
            }}
          />
        )}
        {tab !== "all" && (
          <span className="chip" data-testid="state-filter">
            <Icon name="filter" size={10} />
            {PL_TAB_LABEL[tab]}
            <button className="chip-x" title="Show everyone" aria-label="Show everyone" onClick={() => setTab("all")}>
              <Icon name="x" size={9} />
            </button>
          </span>
        )}
      </div>
      <span className="cl-section-sub">
        {filtered && (shown.length > 0 || viewRule) && canEditLists ? (
          <SaveShownAsList
            ids={shownIds}
            rule={viewRule}
            onMade={openMade}
            suggested={
              activeList
                ? activeList.label
                : activeSaved
                  ? `${activeSaved.name} copy`
                  : tab !== "all"
                    ? (PL_TAB_LABEL[tab] ?? "")
                    : ""
            }
            flash={plFlash}
          />
        ) : filtered ? (
          "Filtered"
        ) : (
          ""
        )}
      </span>
    </div>
  );
}

/** The list's section: a desktop's title line, a smart list's rule being changed, and the list's own step. */
function peopleListSection(s: PeopleState) {
  const { phone, ruleEditing, activeSaved, canEditLists, plFlash, setRuleEditing, listStep } = s;
  return (
    <div className="cl-section">
      {!phone && peopleListHead(s)}
      {!phone && ruleEditing && activeSaved && activeSaved.rule && canEditLists && (
        <RuleEditor list={activeSaved} flash={plFlash} onDone={() => setRuleEditing(false)} />
      )}
      {/* The list's own step: a smart list's next move, or a kept list's one door, a broadcast to those on it who said yes
          (contracts peopleListAction and savedListAction, the one sentence for both). */}
      {listStep && (
        <div className="cl-list-action" data-testid="list-action">
          <span className="cl-list-action-text">{listStep.text}</span>
          <button
            className={`btn btn-sm ${listStep.enabled ? "btn-primary" : ""}`}
            disabled={!listStep.enabled}
            onClick={() => navigate(listStep.to)}
          >
            {listStep.cta} <Icon name="arrow-right" size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

/** A desktop's controls: the search, Add a person, Import, the file of everyone, and the Columns menu. */
function peopleDeskControls(s: PeopleState) {
  const {
    searchRef,
    q,
    setQ,
    canEditLists,
    onOpenProfile,
    plFlash,
    canExport,
    setImportOpen,
    exportBlocked,
    exportHref,
    exportName,
    colsOpen,
    setColsOpen,
    colOptions,
    pickColumn,
    colsButton,
  } = s;
  return (
    <div className="cl-controls">
      <div className="cl-search-wrap">
        <Icon name="search" size={13} />
        <input ref={searchRef} placeholder={`${PL_SEARCH_LABEL}…`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="cl-controls-right">
        {canEditLists && <AddPersonButton onAdded={onOpenProfile} flash={plFlash} />}
        {/* A client list as a file, for the owner: read in the browser, counted, then written in parts of fifty
            (import/import-sheet.tsx). */}
        {canExport && (
          <button className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)} data-testid="import-people">
            <Icon name="download" size={12} /> Import
          </button>
        )}
        {/* Everyone as a CSV, from the route: owner only, and the button says so for anyone else instead of leading to a refusal. */}
        {!canDo("export") ? (
          <button className="btn btn-ghost btn-sm" {...gate("export")}>
            <Icon name="external" size={12} /> Export CSV
          </button>
        ) : exportBlocked ? (
          <button className="btn btn-ghost btn-sm" disabled data-tip={exportBlocked} data-testid="people-export">
            <Icon name="external" size={12} /> Export CSV
          </button>
        ) : (
          <a
            className="btn btn-ghost btn-sm"
            href={exportHref}
            download
            title={
              exportName ? `Download the people on ${exportName} as a CSV file` : "Download everyone as a CSV file"
            }
            data-testid="people-export"
          >
            <Icon name="external" size={12} /> Export CSV
          </a>
        )}
        {/* No sort button: every heading that sorts is a button with its arrow (cl-th-sort), so "Z → A" beside them only
            turned round an order the table already shows and changes. */}
        <PeopleColumnsMenu
          open={colsOpen}
          onOpenChange={setColsOpen}
          options={colOptions}
          onPick={pickColumn}
          buttonRef={colsButton}
        />
      </div>
    </div>
  );
}

/** The scroller: the standing line, a desktop's controls and the list's head, the table, and the line under it. */
function peopleScroll(s: PeopleState) {
  const {
    scrollRef,
    agg,
    listId,
    setSavedId,
    setTab,
    setListId,
    phone,
    listStep,
    rowBudget,
    columns,
    cellCtx,
    canEditLists,
    canExport,
    sel,
    toggleSel,
    toggleAll,
    cursor,
    setCursor,
    shown,
    people,
    rows,
    sortBy,
    sortDir,
    onSort,
    rowOpen,
    selectMode,
    filtered,
    setQ,
    scrolledX,
    setScrolledX,
    searching,
    hasMore,
    q,
    searchFailed,
    searchMore,
    loadingMore,
    loadMore,
  } = s;
  return (
    <div className="cl-main-scroll pl-main" ref={scrollRef}>
      <PeopleStanding
        scope="people"
        agg={agg}
        needsShown={listId === "needs_you"}
        onNeeds={() => {
          setSavedId(null);
          setTab("all");
          setListId((l) => (l === "needs_you" ? null : "needs_you"));
        }}
      />

      {!phone && peopleDeskControls(s)}

      {/* A phone draws no list head: the bar names the list, the Lists sheet has Everyone and the more-menu the list's own
          acts. A list's own step stays, one card. */}
      {(!phone || listStep) && peopleListSection(s)}

      <PeopleTable
        budget={rowBudget}
        noun="person"
        columns={columns}
        ctx={cellCtx}
        selectable={canEditLists || canExport}
        sel={sel}
        onToggle={toggleSel}
        onToggleAll={toggleAll}
        cursor={cursor}
        onCursor={setCursor}
        rows={shown}
        rowClass={phone ? plCardRowClass : null}
        total={people.page && people.page.has_more ? people.page.total : rows.length}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={onSort}
        onOpen={rowOpen}
        selectMode={phone && selectMode}
        filtered={filtered}
        onClearFilters={() => {
          setQ("");
          setTab("all");
          setListId(null);
          setSavedId(null);
        }}
        scrolled={scrolledX}
        onScrolled={setScrolledX}
        busy={searching}
        empty={peopleTableEmpty(s)}
      />
      {hasMore && (
        <div className="cl-section-sub pl-more" data-testid="people-more">
          {plLoadedWords(rows.length, people.page?.total ?? 0)}
          {q.trim()
            ? searching
              ? " · searching everyone…"
              : searchFailed
                ? " · couldn't search past them, so these are matches among the loaded"
                : ` · names and numbers searched across everyone, words among the ${rows.length.toLocaleString()} loaded${searchMore ? " · the first 1,000 matches" : ""}`
            : ""}{" "}
          <button
            className="btn btn-ghost btn-sm"
            disabled={loadingMore}
            onClick={loadMore}
            data-testid="people-more-btn"
          >
            {loadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}

/** A phone's one bar: the switch, the list, search and the more-menu (PeoplePhoneBar). */
function phoneBar(s: PeopleState, phoneMenu: ReturnType<typeof peoplePhoneMenu>) {
  const {
    nav,
    dealsOn,
    activeSaved,
    activeList,
    listGone,
    setListsOpen,
    listsOpen,
    q,
    setQ,
    searchRef,
    searchOpen,
    setSearchOpen,
  } = s;
  return (
    <PeoplePhoneBar
      scope="people"
      onScope={(to) => nav(plScopeRoute(to))}
      dealsOn={dealsOn}
      listLabel={
        activeSaved ? activeSaved.name : activeList ? activeList.label : listGone ? listGone.title : "Everyone"
      }
      onLists={() => setListsOpen(true)}
      listsOpen={listsOpen}
      q={q}
      onQ={setQ}
      searchRef={searchRef}
      searchOpen={searchOpen}
      onSearchOpen={setSearchOpen}
      searchLabel={PL_SEARCH_LABEL}
      testid="people"
      trailing={<MoreMenu items={phoneMenu} title="More" size={18} btnClass="pp-bar-icon" escape />}
    />
  );
}

/** The phone's rail, as a sheet: its first row is Everyone, and a press opens the list and closes the sheet. */
function listsSheet(s: PeopleState) {
  const {
    nav,
    lists,
    people,
    listId,
    saved,
    savedId,
    canEditLists,
    createList,
    restoreList,
    newListSignal,
    setListsOpen,
    agg,
    setListId,
    setSavedId,
  } = s;
  return (
    <PeopleListsSheet onClose={() => setListsOpen(false)}>
      <PeopleRail
        compact
        scope="people"
        everyone={{
          count: agg.total,
          active: !listId && !savedId,
          onPick: () => {
            setListId(null);
            setSavedId(null);
            setListsOpen(false);
          },
        }}
        onScope={(to: string) => nav(plScopeRoute(to))}
        lists={lists}
        groups={people.groups || PL_DEFAULT_GROUPS}
        active={listId}
        // In the sheet a press opens the list and closes the sheet, never toggles back to Everyone (Leads' too).
        onPick={(id) => {
          setSavedId(null);
          setListId(id);
          setListsOpen(false);
        }}
        saved={saved}
        activeSaved={savedId}
        onPickSaved={(id) => {
          setListId(null);
          setSavedId(id);
          setListsOpen(false);
        }}
        canEdit={canEditLists}
        onCreateList={createList}
        savedRead={people.savedRead !== false}
        archived={people.archived || PL_NO_LISTS}
        onRestore={restoreList}
        newListSignal={newListSignal}
      />
    </PeopleListsSheet>
  );
}

export function peopleScreen(s: PeopleState) {
  const {
    phone,
    nav,
    dealsOn,
    lists,
    people,
    listId,
    pickSmart,
    saved,
    savedId,
    pickSaved,
    canEditLists,
    createList,
    restoreList,
    newListSignal,
    activeSaved,
    listsOpen,
    selecting,
    sel,
    shown,
    canExport,
    clearSelection,
    setSel,
    plFlash,
    bulkSheet,
    setBulkSheet,
    shownIds,
    addOpen,
    addDraft,
    setAddDraft,
    addOnPhone,
    closePhoneSheet,
    listAct,
    viewRule,
    listDraft,
    setListDraft,
    listActGo,
    importOpen,
    setImportOpen,
    toastNode,
  } = s;
  const phoneMenu: MoreMenuItem[] = peoplePhoneMenu(s);
  return (
    <div className="clients">
      {/* The switch between the scopes, over the rail and the rows; a phone's is the bar's first row (PeoplePhoneBar). */}
      {!phone && <PeopleScopeTabs scope="people" onScope={(to) => nav(plScopeRoute(to))} dealsOn={dealsOn} />}
      <PeopleRail
        scope="people"
        lists={lists}
        groups={people.groups || PL_DEFAULT_GROUPS}
        active={listId}
        onPick={pickSmart}
        saved={saved}
        activeSaved={savedId}
        onPickSaved={pickSaved}
        canEdit={canEditLists}
        onCreateList={createList}
        savedRead={people.savedRead !== false}
        archived={people.archived || PL_NO_LISTS}
        onRestore={restoreList}
        newListSignal={newListSignal}
      />

      <div className="cl-main">
        {/* A phone's one bar: the switch, the list, search and the more-menu (PeoplePhoneBar). It stands over the scroller, as
            the Inbox's strip does: the rows scroll and bounce under it, and a pull down never takes it. */}
        {phone && phoneBar(s, phoneMenu)}
        {peopleScroll(s)}
        {/* The bar counts, and acts on, the people shown and selected. */}
        {selecting && (
          <PeopleBulkBar
            sel={sel}
            rows={shown}
            saved={saved}
            savedRead={people.savedRead !== false}
            canEdit={canEditLists}
            canExport={canExport}
            onClear={clearSelection}
            onKeep={(rest) => setSel(new Set(rest))}
            flash={plFlash}
            activeSaved={activeSaved || null}
            phone={phone}
            sheet={phone ? bulkSheet : null}
            onSheet={setBulkSheet}
            onSelectAll={() => setSel(new Set(shownIds))}
          />
        )}
        {/* The phone's rail, as a sheet (the rail itself is not drawn at 900px and under), last in the tree. Its switch is
            the bar's; its first row is Everyone. */}
        {listsOpen && listsSheet(s)}
        {/* People's own two sheets on a phone, last in the tree like the Lists sheet. */}
        {phone && addOpen && (
          <PeopleAddSheet
            draft={addDraft}
            onDraft={(patch) => setAddDraft((d) => ({ ...d, ...patch }))}
            onAdd={addOnPhone}
            onClose={closePhoneSheet}
          />
        )}
        {phone && listAct && (listAct === "save" || activeSaved) && (
          <PeopleListActSheet
            act={listAct}
            list={activeSaved}
            count={shown.length}
            rule={viewRule}
            flash={plFlash}
            draft={listDraft}
            onDraft={(patch) => setListDraft((d) => ({ ...d, ...patch }))}
            onGo={listActGo}
            onClose={closePhoneSheet}
          />
        )}
        {/* Import people, at every width: the record kit's sheet, drawn in .app-root, where the page's keys hold still
            while it is open (PL_OVERLAY) and it closes on its own Esc. */}
        {importOpen && <PeopleImportSheet onClose={() => setImportOpen(false)} flash={plFlash} />}
        {toastNode}
      </div>
    </div>
  );
}
