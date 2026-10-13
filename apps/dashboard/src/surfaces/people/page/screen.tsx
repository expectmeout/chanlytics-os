/**
 * The elements People's page returns, made where they always stood (moved whole from legacy/pages/people.jsx,
 * decision 0015): plain functions of the page's state (`s`), called in the order JSX made them, so every component draws in
 * its place and keeps its state there.
 */
import { navigate } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { ActWords } from "../../kit/head/act-words";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { PeopleBulkBar } from "../bulk/bulk-bar";
import { plCardRowClass } from "../cells/columns";
import { PeopleAddSheet } from "../import/import-sheet";
import { DeleteListButton, ListTitle } from "../lists/list-title";
import { plArchivedWords } from "../lists/doors";
import { RuleEditor } from "../lists/rule-editor";
import { SaveShownAsList } from "../lists/save-shown";
import { PeopleRail } from "../rail/people-rail";
import { PeopleListsSheet } from "../rail/lists-sheet";
import { BarWord, PeoplePhoneBar, SELECT_WORDS } from "../rail/phone-bar";
import { PeopleStanding } from "../rail/standing";
import { PeopleListActSheet } from "../sheets/list-sheets";
import { PhoneSheetRow } from "../sheets/phone-sheet";
import { PeopleColumnsMenu } from "../table/columns-menu";
import { PeopleFileActs } from "./file-acts";
import { PeopleTable } from "../table/table";
import { PersonPeek } from "../peek/person-peek";
import type { TableEmpty } from "../types";
import { PL_DEFAULT_GROUPS, PL_NO_LISTS, PL_SEARCH_LABEL, PL_TAB_LABEL, plLoadedWords, plSortedBy } from "../words";
import type { PeopleState } from "./state";
import { peopleListActs, peopleSortItems } from "./phone-menu";
import { menuGroups } from "../menu-groups";

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
    sortBy,
  } = s;
  // The list says how it is ordered at the head's right.
  const sortedBy = plSortedBy(sortBy);
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
          sortedBy
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

/**
 * The page's act: Add people, the frame's act, said through its head (people-head.tsx), the page's one filled button at
 * every width. It opens one sheet with both ways in: one person, or a list as a file for the owner (Ruben, 10 Oct 2026:
 * Add a person and Import were two doors to one job). On a desk it stands at the right of the strip of scopes over the
 * list, where Campaigns' Library and New message stand (6 Oct 2026); on a phone beside the page's name (7 Oct). A role
 * that may not change lists has none.
 */
export function peopleAct(s: PeopleState) {
  const { canEditLists, setAddOpen } = s;
  if (!canEditLists) return null;
  return (
    <Button variant="primary" size="sm" onClick={() => setAddOpen(true)} data-testid="add-people">
      <ActWords icon={<Icon name="plus" size={12} />} words="Add people" />
    </Button>
  );
}

/** A desktop's controls: the search, the Columns menu, and Export as a word (adding people is the page's act). */
function peopleDeskControls(s: PeopleState) {
  const { searchRef, q, setQ, plFlash, exportBlocked, exportHref, exportName, colOptions, pickColumn, layout } = s;
  return (
    <div className="cl-controls">
      <div className="cl-search-wrap">
        <Icon name="search" size={13} />
        <input ref={searchRef} placeholder={`${PL_SEARCH_LABEL}…`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="cl-controls-right">
        {/* No sort button: every heading that sorts is a button with its arrow (cl-th-sort), so "Z → A" beside them only
            turned round an order the table already shows and changes. */}
        <PeopleColumnsMenu options={colOptions} onPick={pickColumn} layout={layout} />
        {/* Export stands beside Columns as a word (file-acts.tsx). */}
        <PeopleFileActs exportBlocked={exportBlocked} exportHref={exportHref} exportName={exportName} flash={plFlash} />
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
    layout,
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
    swap,
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
        swapRef={swap}
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
        layout={layout}
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

/**
 * A phone's one bar (PeoplePhoneBar): the list, its acts as words, and search. Select, Sort and Export stand as words
 * where a ⋯ folded them away (Ruben, 10 Oct 2026); Sort opens the phone's action sheet of sorts, a desktop's headings'
 * own, and the open list's acts are at the foot of the Lists sheet. A word nobody may use here is not drawn.
 */
function phoneBar(s: PeopleState) {
  const { activeSaved, activeList, listGone, setListsOpen, listsOpen, q, setQ, searchRef } = s;
  const { selecting, sel, shown } = s;
  const picked = selecting ? shown.filter((p) => sel.has(p.id)).length : 0;
  return (
    <PeoplePhoneBar
      title={selecting ? (picked ? `${picked.toLocaleString()} selected` : "Select people") : null}
      listLabel={
        activeSaved ? activeSaved.name : activeList ? activeList.label : listGone ? listGone.title : "Everyone"
      }
      onLists={() => setListsOpen(true)}
      listsOpen={listsOpen}
      q={q}
      onQ={setQ}
      searchRef={searchRef}
      searchLabel={PL_SEARCH_LABEL}
      testid="people"
      trailing={phoneBarActs(s)}
    />
  );
}

/**
 * The bar's Select walks a selection through one word (Ruben, 10 Oct 2026): Select starts one, Select all then takes
 * everyone shown, and once everyone is, Cancel ends it, back to Select. A selection begun on a face says Select all too.
 */
function selectStep(s: PeopleState) {
  const { selecting, sel, shown, shownIds, setSel, setSelectMode, clearSelection } = s;
  if (!selecting) return { word: "Select", press: () => setSelectMode(true) };
  if (shown.every((p) => sel.has(p.id))) return { word: "Cancel", press: clearSelection };
  return { word: "Select all", press: () => setSel(new Set(shownIds)) };
}

/** The bar's words: Select, where a selection could do something; Sort; and Export, as a desktop's controls say it. */
function phoneBarActs(s: PeopleState) {
  const { canEditLists, canExport, shown, exportBlocked, exportHref, exportName, plFlash } = s;
  const select = selectStep(s);
  return (
    <div className="pp-bar-acts">
      {(canEditLists || canExport) && shown.length > 0 ? (
        <Button variant="plain" size="sm" onClick={select.press} data-testid="people-phone-select">
          <BarWord word={select.word} words={SELECT_WORDS} />
        </Button>
      ) : null}
      <Menu
        label="Sort"
        groups={menuGroups(peopleSortItems(s))}
        trigger={
          <Button variant="plain" size="sm" data-testid="people-phone-sort">
            Sort
          </Button>
        }
      />
      <PeopleFileActs
        plain
        exportBlocked={exportBlocked}
        exportHref={exportHref}
        exportName={exportName}
        flash={plFlash}
      />
    </div>
  );
}

/** The phone's rail, as a sheet: its first row is Everyone, and a press opens the list and closes the sheet. */
function listsSheet(s: PeopleState) {
  const {
    lists,
    people,
    listId,
    saved,
    savedId,
    canEditLists,
    createList,
    restoreList,
    newListSignal,
    listsOpen,
    setListsOpen,
    agg,
    setListId,
    setSavedId,
  } = s;
  return (
    <PeopleListsSheet open={listsOpen} onClose={() => setListsOpen(false)}>
      {listsOpen ? (
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
      ) : null}
      {listsOpen ? listActRows(s) : null}
    </PeopleListsSheet>
  );
}

/**
 * The open list's own acts, at the foot of the Lists sheet (Ruben, 10 Oct 2026): a desktop does them on the list's title
 * line, which a phone does not draw, and they stood in the ⋯ the bar no longer has. A press closes the Lists sheet and
 * opens the act's own (PeopleListActSheet), or pins the list to Today.
 */
function listActRows(s: PeopleState) {
  const { setListsOpen, activeSaved, activeList } = s;
  const acts = peopleListActs(s);
  if (!acts.length) return null;
  return (
    <section className="pl-lists-acts" aria-label="This list" data-testid="people-list-acts">
      <h3 className="cl-rail-label">{activeSaved ? activeSaved.name : activeList ? activeList.label : "This view"}</h3>
      {acts.map((a) => (
        <PhoneSheetRow
          key={a.label}
          icon={a.icon ?? null}
          label={a.label}
          danger={!!a.danger}
          onClick={() => {
            setListsOpen(false);
            if (a.onClick) a.onClick();
          }}
          testid={`people-list-act-${(a.icon ?? "act").replace(/[^a-z]/g, "")}`}
        />
      ))}
    </section>
  );
}

/** The person peeked at beside the rows, on a desk (canvas A, PEEK-01; peek/person-peek.tsx). */
function peekBlock(s: PeopleState) {
  if (s.phone || !s.peekId) return null;
  return (
    <PersonPeek
      id={s.peekId}
      row={s.peekRow}
      person={s.peekPerson}
      failed={s.peekFailed}
      missing={s.peekMissing}
      walk={s.peekWalk}
      canRecord={s.canEditLists}
      flash={s.plFlash}
      onStep={s.stepPeek}
      onClose={s.closePeek}
      onRetry={s.peekRetry}
    />
  );
}

export function peopleScreen(s: PeopleState) {
  const {
    phone,
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
    selecting,
    sel,
    shown,
    canExport,
    clearSelection,
    setSel,
    plFlash,
    bulkSheet,
    setBulkSheet,
    fileColumns,
    addOpen,
    setAddOpen,
    onOpenProfile,
    closePhoneSheet,
    listAct,
    viewRule,
    listDraft,
    setListDraft,
    listActGo,
    toastNode,
    agg,
    setListId,
    setSavedId,
  } = s;
  return (
    <div className="clients pp-scope">
      {/* The switch between the scopes is the frame's strip of views, over this page (surfaces/people/chrome.ts). */}
      <PeopleRail
        scope="people"
        // The rail opens with everyone, the way the canvas draws it (P1).
        everyone={{
          count: agg.total,
          active: !listId && !savedId,
          onPick: () => {
            setListId(null);
            setSavedId(null);
          },
        }}
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

      <div className={`cl-main${!s.phone && s.peekId ? " has-peek" : ""}`}>
        {/* A phone's one bar: the switch, the list, search and the more-menu (PeoplePhoneBar). It stands over the scroller, as
            the Inbox's strip does: the rows scroll and bounce under it, and a pull down never takes it. */}
        {phone && phoneBar(s)}
        {peopleScroll(s)}
        {peekBlock(s)}
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
            fileColumns={fileColumns}
          />
        )}
        {/* The phone's rail, as a sheet (the rail itself is not drawn at 900px and under), last in the tree. Its switch is
            the bar's; its first row is Everyone. */}
        {phone ? listsSheet(s) : null}
        {/* The open list's acts on a phone, the kit's sheet: drawn while open, and on their way out. */}
        <PeopleListActSheet
          open={phone && !!listAct && (listAct === "save" || !!activeSaved)}
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
        {/* Add people, at every width: the record kit's sheet, drawn in .app-root, where the page's keys hold still while it
            is open (PL_OVERLAY) and it closes on its own Esc. One person for whoever may change lists, a file for the owner. */}
        {addOpen && (
          <PeopleAddSheet
            onClose={() => setAddOpen(false)}
            onAdded={onOpenProfile}
            canImport={canExport}
            // A list a rule keeps takes nobody by hand: the ones kept by hand are offered.
            lists={saved.filter((l) => !l.rule).map((l) => ({ id: l.id, name: l.name }))}
            flash={plFlash}
          />
        )}
        {toastNode}
      </div>
    </div>
  );
}
