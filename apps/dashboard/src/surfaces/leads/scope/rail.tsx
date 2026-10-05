/**
 * The rail under Leads (moved from legacy/pages/leads-scope.jsx, decision 0015), drawn with People's kit (RailSection,
 * RailRow) and picked the way People's is: one row at a time, a list or a search. The lists, then the searches, each with
 * its count, a live dot while it runs and a "?" in the accent while it waits on the owner. Renaming and removing are asked
 * where the search is, so the rail never loses the row that is being named.
 */
import type { ReactNode } from "react";
import type { leadRail } from "@chanlytics/contracts";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { gate } from "../../legacy-verbs";
import { RailEmpty, RailRow, RailSection, railQuiet } from "../../people/rail/rail-kit";

export type LeadRail = ReturnType<typeof leadRail>;
type RailSearch = LeadRail["searches"][number];
interface SearchWords {
  askedLine: string;
  keepsLine: string;
}

/**
 * A kept search says what was asked (§8.10). The menu closes after each item (MoreMenu), and every item is a route:
 * nothing here renames or removes on the spot.
 */
const LeadSearchMenu = ({
  s,
  words,
  canFind,
  onRename,
  onMore,
  onAgain,
  onRemove,
  onUndo,
  exportHref,
}: {
  s: RailSearch;
  words: SearchWords;
  canFind: boolean;
  onRename: (s: RailSearch) => void;
  onMore: (s: RailSearch) => void;
  onAgain: (s: RailSearch) => void;
  onRemove: (s: RailSearch) => void;
  onUndo: (s: RailSearch) => void;
  exportHref: string | null;
}) => (
  <MoreMenu
    // It escapes the rail: the rail scrolls and cuts off whatever crosses its edge, so opening rightward showed 51px of 194,
    // and a menu held inside it (196px) broke its words onto three to six lines. Placed against the window, it opens
    // rightward over the table at a menu's full width.
    escape
    align="left"
    // Its name is what it holds, for a screen reader and on hover: "What independent bookstores asked for" read as if the
    // bookstores had asked. What the search asked for is the row's own tip (LeadsRailRows).
    title={`More for ${s.name}`}
    btnClass="btn btn-ghost btn-icon btn-sm ld-search-more"
    items={[
      { header: words.askedLine },
      {
        label: "Rename",
        icon: "pencil",
        onClick: () => onRename(s),
        gate: canFind ? undefined : gate("find", "rename this search"),
      },
      // A list of your own (00242) is never searched again: its menu offers neither way back to the finder.
      ...(s.list
        ? []
        : [
            {
              label: "Find new ones",
              icon: "refresh",
              meta: "Only places not already in your leads count",
              onClick: () => onMore(s),
              gate: canFind ? undefined : gate("find", "search again"),
            },
            // A door wears the three's mark, as Find leads does: the sparkle means written by Claude, and this is a press.
            {
              label: "Search again, changed",
              icon: "three",
              meta: "Opens the plan with what you asked",
              onClick: () => onAgain(s),
              gate: canFind ? undefined : gate("find", "search again"),
            },
          ]),
      {
        label: `Export these ${s.count}`,
        icon: "external",
        onClick: () => {
          if (exportHref) window.open(exportHref, "_self");
        },
        gate: canFind ? undefined : gate("find", "export these leads"),
      },
      // For a day after a round ends: the leads nobody has touched leave and the month is credited (§8.6). Named for what
      // it does; the toast it answers with carries its own Undo, which puts them back.
      ...(s.undoable
        ? [
            {
              label: "Remove the ones you haven't touched",
              icon: "undo",
              meta: `Up to ${s.count} given back this month`,
              onClick: () => onUndo(s),
              gate: canFind ? undefined : gate("find", "remove these leads"),
            },
          ]
        : []),
      { divider: true },
      {
        label: "Remove this search",
        icon: "x",
        danger: true,
        meta: words.keepsLine,
        onClick: () => onRemove(s),
        gate: canFind ? undefined : gate("find", "remove this search"),
      },
    ]}
  />
);

interface RailRowsProps {
  rail: LeadRail;
  list: string;
  searchId: string | null;
  canFind: boolean;
  wordsFor: (id: string) => SearchWords;
  onPickList: (id: string) => void;
  onPickSearch: (id: string) => void;
  onWarmList?: (id: string) => void;
  onWarmSearch?: (id: string) => void;
  renaming: { id: string } | null;
  onRename: (s: RailSearch) => void;
  onRenameSave: (s: RailSearch, name: string) => void;
  onRenameCancel: () => void;
  removing: { id: string } | null;
  onRemoveAsk: (s: RailSearch) => void;
  onRemoveYes: (s: RailSearch) => void;
  onRemoveNo: () => void;
  removeBusy: boolean;
  removeError: string | null;
  onMore: (s: RailSearch) => void;
  onAgain: (s: RailSearch) => void;
  onUndo: (s: RailSearch) => void;
  hrefFor: (s: RailSearch) => string | null;
  onNew: () => void;
  importDoor?: ReactNode;
  compact?: boolean;
}

/** A search being renamed: its name in a field, and Save. */
const renamingField = (s: RailSearch, p: RailRowsProps) => (
  <span className="cl-bulk-naming ld-search-renaming">
    <input
      autoFocus
      defaultValue={s.name}
      maxLength={80}
      aria-label="The search's name"
      data-testid="leads-rename-name"
      onKeyDown={(e) => {
        if (e.key === "Enter") p.onRenameSave(s, (e.target as HTMLInputElement).value);
        if (e.key === "Escape") p.onRenameCancel();
      }}
    />
    <button
      type="button"
      className="btn btn-sm btn-primary"
      onClick={(e) => {
        const box = e.currentTarget.parentNode && e.currentTarget.parentNode.querySelector("input");
        p.onRenameSave(s, box ? box.value : "");
      }}
      data-testid="leads-rename-save"
    >
      Save
    </button>
  </span>
);

/** One kept search's row: its count, its mark, its menu, and the rename or the question before Remove where it is. */
const railSearchRow = (s: RailSearch, p: RailRowsProps) => (
  <RailRow
    key={s.id}
    className="ld-search-row"
    pickClass="ld-search-pick"
    label={s.name}
    count={s.count}
    active={p.searchId === s.id}
    onPick={() => p.onPickSearch(s.id)}
    onWarm={() => (p.onWarmSearch || (() => undefined))(s.id)}
    // Most names are cut off at the rail's width; the row names the whole ask, and when, on hover (the shared tip).
    tip={p.wordsFor(s.id).askedLine || null}
    testid={`leads-search-${s.id}`}
    mark={
      s.mark === "live" ? (
        <span className="live-dot" aria-hidden="true" />
      ) : s.mark === "question" ? (
        <span className="rail-q" title="This search needs you">
          ?
        </span>
      ) : null
    }
    menu={
      <LeadSearchMenu
        s={s}
        words={p.wordsFor(s.id)}
        canFind={p.canFind}
        onRename={p.onRename}
        onMore={p.onMore}
        onAgain={p.onAgain}
        onRemove={p.onRemoveAsk}
        onUndo={p.onUndo}
        exportHref={p.hrefFor(s)}
      />
    }
    edit={p.renaming && p.renaming.id === s.id ? renamingField(s, p) : null}
    after={
      p.removing && p.removing.id === s.id ? (
        <Confirm
          question={`Remove “${s.name}”?`}
          detail={p.wordsFor(s.id).keepsLine}
          yes="Yes, remove"
          danger
          busy={p.removeBusy}
          error={p.removeError}
          onYes={() => p.onRemoveYes(s)}
          onNo={p.onRemoveNo}
          testid="leads-remove"
        />
      ) : null
    }
  />
);

/**
 * `compact` is the phone's sheet (People's RailEmpty): a list with no lead in it is said in a line, not drawn -- all leads
 * and the one picked always are. Searches are always drawn: each is a thing kept, with its own menu.
 */
export const LeadsRailRows = (p: RailRowsProps) => {
  const {
    rail,
    list,
    searchId,
    canFind,
    onPickList,
    onWarmList = () => undefined,
    onNew,
    importDoor = null,
    compact = false,
  } = p;
  const quiet = compact ? railQuiet(rail.lists, (l) => l.id === "all" || (!searchId && list === l.id)) : [];
  return (
    <>
      {/* "Lists", not "Leads": the switch right above already says which scope this is. */}
      <RailSection label="Lists" testid="leads-lists">
        {rail.lists
          .filter((l) => !quiet.includes(l))
          .map((l) => (
            <RailRow
              key={l.id}
              label={l.label}
              count={l.count}
              active={!searchId && list === l.id}
              onPick={() => onPickList(l.id)}
              onWarm={() => onWarmList(l.id)}
              testid={`leads-list-${l.id}`}
            />
          ))}
        <RailEmpty labels={quiet.map((l) => l.label)} testid="leads-lists-empty" />
      </RailSection>
      <RailSection label="Searches" testid="leads-searches">
        {rail.searches.map((s) => railSearchRow(s, p))}
        {rail.searches.length === 0 && (
          <div className="cl-rail-hint">No searches yet. Describe the businesses you want and Claude finds them.</div>
        )}
      </RailSection>
      <div className="cl-rail-foot">
        <button
          type="button"
          className="cl-rail-newseg"
          onClick={onNew}
          data-testid="leads-new-search"
          {...(canFind ? {} : gate("find", "find leads"))}
        >
          <Icon name="plus" size={11} /> New search
        </button>
        {/* A list of your own (Reach out Part 7): a file of businesses, checked first, as a search. */}
        {importDoor}
      </div>
    </>
  );
};
