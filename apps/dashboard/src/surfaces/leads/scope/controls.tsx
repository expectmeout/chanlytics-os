/**
 * The desk's controls at the right of the search (moved from legacy/pages/leads-scope.jsx, decision 0015): the map,
 * Values ⁄ Signals, which columns show, the file, Reach out's door and Ask's (spec F1: the three's still mark, never a
 * second live canvas). In Glass the canvas (L1) folds the map, Values ⁄ Signals and the file under one ⋯ beside Columns
 * (the look is read where the frame stamps it, as the top bar reads it); Classic keeps each as its own button.
 */
import type { LeadSearchDto } from "@chanlytics/contracts";
import { ReachOutDoor } from "../../campaigns/reach-out/door";
import { Icon } from "../../kit/icon/icon";
import { lookNow } from "../../kit/look/look";
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

/** Classic's two buttons: the same leads as places (D5), and the number and address in the row (D5), kept per viewer. */
function classicToggles(p: ControlsProps) {
  return (
    <>
      <button
        type="button"
        className={`btn btn-ghost btn-sm${p.mapOpen ? " on" : ""}`}
        aria-pressed={!!p.mapOpen}
        onClick={() => p.onMap(!p.mapOpen)}
        data-testid="leads-map-toggle"
        title="See these leads on the ground"
      >
        <Icon name={p.mapOpen ? "list" : "map"} size={12} /> {p.mapOpen ? "Table" : "Map"}
      </button>
      <button
        type="button"
        className={`btn btn-ghost btn-sm ld-values${p.values ? " on" : ""}`}
        aria-pressed={!!p.values}
        onClick={() => p.onValues(!p.values)}
        data-testid="leads-values"
        title="Show the numbers and addresses in the rows"
      >
        {p.values ? "Signals" : "Values"}
      </button>
    </>
  );
}

/** The file: a link where the member may export, the button that says why where they may not. */
function exportControl(p: ControlsProps) {
  return p.canExport ? (
    <a
      className="btn btn-ghost btn-sm"
      href={p.exportHref || undefined}
      download
      title="Download these leads as a CSV file"
      data-testid="leads-export"
    >
      <Icon name="external" size={12} /> Export
    </a>
  ) : (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      {...gate("export", "export these leads")}
      data-testid="leads-export"
    >
      <Icon name="external" size={12} /> Export
    </button>
  );
}

export const LeadsControlsRight = ({ p, search }: { p: ControlsProps; search: LeadSearchDto | null }) => {
  const glass = lookNow() === "glass";
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
      {glass ? null : classicToggles(p)}
      <PeopleColumnsMenu options={p.colOptions} onPick={p.onPickColumn} />
      {glass ? (
        // The kit's Menu, as People's ⋯ beside it is (people/page/screen.tsx).
        <MenuInPlace>
          <Menu
            label="More"
            trigger={moreButton({ title: "More", testid: "leads-more" })}
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
      ) : (
        exportControl(p)
      )}
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
