/**
 * The desk's controls at the right of the search (moved from legacy/pages/leads-scope.jsx, decision 0015): the map,
 * Values ⁄ Signals, which columns show and the file. The canvas (L1) folds the map, Values ⁄ Signals and the file under
 * one ⋯ beside Columns. The page's acts, Reach out's door and Ask's (spec F1: the three's still mark, never a second live
 * canvas), stand at the right of the strip over the list, as People's Add a person does (`LeadsActs`).
 */
import type { LeadSearchDto } from "@chanlytics/contracts";
import type { ReactNode } from "react";
import { ReachOutDoor } from "../../campaigns/reach-out/door";
import { ActWords } from "../../kit/head/act-words";
import { useStanding } from "../../kit/head/standing";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { gate } from "../../legacy-verbs";
import { MenuInPlace, menuGroups, moreButton } from "../../people/menu-groups";
import type { ColumnOption } from "../../people/table/columns";
import { PeopleColumnsMenu } from "../../people/table/columns-menu";

interface ControlsProps {
  canExport: boolean;
  exportHref: string | null;
  mapOpen: boolean;
  onMap: (on: boolean) => void;
  values: boolean;
  onValues: (on: boolean) => void;
  colOptions: readonly ColumnOption[];
  onPickColumn: (key: string) => void;
}

/**
 * The page's acts on a desk, said to the frame's head (people/rail/standing.tsx): an open search's reach-out door, then
 * Find leads, which steps back from primary beside it (campaigns.css) so the view has one accent (Ruben, 6 Oct 2026: it
 * stood in the controls row, inside the pane).
 */
export const LeadsActs = ({
  canFind,
  onFind,
  search,
}: {
  canFind: boolean;
  onFind: () => void;
  search: LeadSearchDto | null;
}) => (
  <>
    <ReachOutDoor search={search} />
    <button
      type="button"
      className="btn btn-primary btn-sm"
      onClick={() => onFind()}
      data-testid="leads-find"
      {...(canFind ? {} : gate("find", "find leads"))}
    >
      <ActWords icon={<Icon name="three" size={12} />} words="Find leads" />
    </button>
  </>
);

/**
 * Leads' head where no standing line is drawn: People's name, and the act it is handed. A desk says its standing with its
 * line (people/rail/standing.tsx) and Find leads beside it; a phone drew no line and said nothing, so the frame named the
 * page from its crumbs and it had no act (Ruben, 7 Oct 2026).
 *
 * A phone's act is Import leads (reach-out/lists.tsx `importAct`), on the first day too: the door that brings leads in,
 * as People's is Add a person and the Pipeline's New proposal, each at the right of the row of views. Find leads is Ask
 * on a phone, whose circle stands over every page (spec F1), and the first day's own door. A desk's first day says the
 * name alone: the page's door is the one press there, and "0 leads · 0 ready · 0 searches" is no standing to say. Draws
 * nothing of its own.
 */
export const LeadsHead = ({ act }: { act?: ReactNode }) => {
  useStanding({ title: "People", back: null, act });
  return null;
};

export const LeadsControlsRight = ({ p }: { p: ControlsProps }) => {
  const exportItem = p.canExport
    ? {
        label: "Export",
        icon: "external",
        title: "Download these leads as a CSV file",
        onClick: () => {
          if (p.exportHref) window.open(p.exportHref, "_self");
        },
      }
    : { label: "Export", icon: "external", gate: gate("export", "export these leads") };
  return (
    <div className="cl-controls-right">
      <PeopleColumnsMenu options={p.colOptions} onPick={p.onPickColumn} />
      {/* The kit's Menu, as People's ⋯ beside it is (people/page/screen.tsx). */}
      <MenuInPlace>
        <Menu
          label="More"
          trigger={moreButton({ title: "More", testid: "leads-file-menu" })}
          groups={menuGroups([
            {
              label: p.mapOpen ? "Table" : "Map",
              icon: p.mapOpen ? "list" : "map",
              title: "See these leads on the ground",
              onClick: () => p.onMap(!p.mapOpen),
            },
            {
              label: p.values ? "Signals" : "Values",
              icon: "eye",
              title: "Show the numbers and addresses in the rows",
              onClick: () => p.onValues(!p.values),
            },
            exportItem,
          ])}
        />
      </MenuInPlace>
    </div>
  );
};
