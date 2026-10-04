/**
 * The phone's top (<=900px, the band People's own rows begin at), Leads' way (moved from legacy/pages/leads-scope.jsx,
 * decision 0015): People's bar (PeoplePhoneBar), the scopes as the Inbox's tab strip over the bar: lists, search, and Find
 * leads as the three's still mark. Find leads is Ask (spec F1): at a phone's width the shell's ✦ is its one door and the
 * mark gives way (leads.css); from 721px to 900px the controls row is gone and the shell draws no ✦, so the mark is the
 * page's one door. The same top on every scope, and nothing else sits above the rows -- no title, no sub-headline, no
 * stat cards and no second control row (legacy/CLAUDE.md, the phone shows the work first).
 * A search's reach-out (Reach out Part 4 PR 6): its sheet, or its chain (ReachOutDoor); Find leads steps back beside it on
 * a desk, and on a phone it is the sticky full-width button over the rows.
 */
import type { ReactNode, RefObject } from "react";
import type { LeadSearchDto } from "@chanlytics/contracts";
import { ReachOutDoor } from "../../campaigns/reach-out/door";
import { Icon } from "../../kit/icon/icon";
import { gate, leaving, touchSwipe } from "../../legacy-verbs";
import { PeoplePhoneBar } from "../../people/rail/phone-bar";

interface LeadsPhoneBarProps {
  scope: string;
  onScope: (to: string) => void;
  dealsOn?: boolean;
  listLabel?: ReactNode;
  listCount?: number | string | null;
  onLists?: (() => void) | null;
  listsOpen?: boolean;
  q: string;
  onQ: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null> | null;
  searchOpen?: boolean;
  onSearchOpen?: (open: boolean) => void;
  onFind?: () => void;
  canFind?: boolean;
  mapOn?: boolean;
  onMap?: (on: boolean) => void;
  canMap?: boolean;
  search?: LeadSearchDto | null;
}

/**
 * The map, from the bar (Ruben, 25 Sep): the desktop's toggle stood in the controls row, which a phone never draws, so the
 * streets had no door here. It is a switch of two, the rows and the places, the one shown pressed: a lone push-pin said
 * neither which view this was nor what it would open (Ruben: it read as a hammer). Drawn only where the rows have places.
 */
function viewSwitch(mapOn: boolean, onMap: (on: boolean) => void) {
  return (
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
  );
}

export const LeadsPhoneBar = ({
  scope,
  onScope,
  dealsOn = false,
  listLabel,
  listCount = null,
  onLists,
  listsOpen,
  q,
  onQ,
  searchRef,
  searchOpen = false,
  onSearchOpen = () => undefined,
  onFind = () => undefined,
  canFind = false,
  mapOn = false,
  onMap = () => undefined,
  canMap = false,
  search = null,
}: LeadsPhoneBarProps) => (
  <>
    <PeoplePhoneBar
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
      trailing={
        <>
          {canMap ? viewSwitch(mapOn, onMap) : null}
          <button
            type="button"
            className="pp-bar-icon ld-bar-find"
            aria-label="Find leads"
            title="Find leads"
            data-testid="leads-bar-find"
            onClick={() => onFind()}
            {...(canFind ? {} : gate("find", "find businesses for you"))}
          >
            <Icon name="three" size={16} />
          </button>
        </>
      }
    />
    <ReachOutDoor search={search} phone />
  </>
);

/**
 * The plan panel, as a sheet from the bottom of a phone. No listener of its own: the page's one keydown listener closes
 * the panel on Esc before anything else and holds every other key while it is open (Task 2), so a second listener here
 * would take the key twice and close the panel and then the selection on one press.
 */
export const LeadPlanSheet = ({ onClose, children }: { onClose: () => void; children?: ReactNode }) => (
  <>
    <div className="sb-sheet-backdrop" role="presentation" onClick={onClose} />
    {/* A phone's alone: its handle says a thumb pulls it down, and it goes the way it came (touchSwipe, leaving). */}
    <div
      className="sb-sheet pl-plan"
      role="dialog"
      aria-label="The plan"
      data-testid="lead-plan-sheet"
      ref={leaving("lead-plan")}
      {...touchSwipe({ onDown: onClose })}
    >
      <div className="ld-sheet-handle" />
      {children}
    </div>
  </>
);
