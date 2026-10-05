/**
 * The desk's controls at the right of the search (moved from legacy/pages/leads-scope.jsx, decision 0015): the map,
 * Values ⁄ Signals, which columns show, the file, Reach out's door and Ask's (spec F1: the three's still mark, never a
 * second live canvas). The canvas (L1) folds the map, Values ⁄ Signals and the file under one ⋯ beside Columns.
 */
import type { LeadSearchDto } from "@chanlytics/contracts";
import { ReachOutDoor } from "../../campaigns/reach-out/door";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { gate } from "../../legacy-verbs";
import { MenuInPlace, menuGroups, moreButton } from "../../people/menu-groups";
import type { ColumnOption } from "../../people/table/columns";
import { PeopleColumnsMenu } from "../../people/table/columns-menu";

interface ControlsProps {
  canFind: boolean;
  canExport: boolean;
  exportHref: string | null;
  mapOpen: boolean;
  onMap: (on: boolean) => void;
  values: boolean;
  onValues: (on: boolean) => void;
  colOptions: readonly ColumnOption[];
  onPickColumn: (key: string) => void;
  onFind: () => void;
}

export const LeadsControlsRight = ({ p, search }: { p: ControlsProps; search: LeadSearchDto | null }) => {
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
      <ReachOutDoor search={search} />
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={p.onFind}
        data-testid="leads-find"
        {...(p.canFind ? {} : gate("find", "find leads"))}
      >
        <Icon name="three" size={12} /> Find leads
      </button>
    </div>
  );
};
