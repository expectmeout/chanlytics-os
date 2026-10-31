/**
 * How a table is laid out (moved from people/table/columns-menu.tsx, decision 0083), for People, Leads and the
 * Pipeline: the kit's Menu holding which columns show (switches, which stay open while each is flipped, as a menu of
 * acts does not, the fill column drawn on and refusing a press), how tall a row stands, and the way back from widths and
 * places the member changed. Escape and a press outside close it and give focus back to its button, and while it is open
 * it is in PL_OVERLAY (people/words.ts), so the page's keys hold still behind it. A phone draws cards, not columns: each
 * page leaves its controls row, and this with it, off a phone.
 */
import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import { Menu } from "../menu/menu";
import type { MenuGroup } from "../menu/menu";
import { columnOptionsOf, orderedColumns, type AnyDataColumn, type Density } from "./columns";
import type { TableState } from "./state";
import { useSlice } from "./use-table";

const DENSITY_WORDS: readonly { value: Density; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

/**
 * Whether a member sized any column: what the way back reads of the widths, and all it reads. The way back is offered
 * while any width or place differs from the page's own.
 */
const anySized = (widths: Readonly<Record<string, number>>): boolean => Object.keys(widths).length > 0;

export function TableColumnsMenu({
  state,
  columns,
  desk = true,
  rowHeight = true,
}: {
  state: TableState;
  /** The columns this workspace declares (columns.ts `columnsIn`). */
  columns: readonly AnyDataColumn[];
  /** The widths and the row height are a desk's: where the table has them, the menu offers them beside the columns. */
  desk?: boolean;
  /** Whether the table's rows can stand at two heights: Leads' rows have the height of their card, and say nothing of it. */
  rowHeight?: boolean;
}) {
  // The menu reads of the widths only whether any is a member's, so a drag draws neither the page nor the menu: only the
  // first width a member sets, and the way back, change what it says.
  const sized = useSlice(state.atoms.columnSizing, anySized);
  const tick = <Icon name="check" size={13} />;
  // The row height and the way back come first: under fifteen switches the way back stood below the menu's fold, at the
  // foot of a scroll nobody knew was there (691px of menu on a 900px window, 27 Oct 2026), and it is the one way out of
  // a layout that went wrong.
  const groups: MenuGroup[] = [];
  if (desk) {
    groups.push(
      ...(rowHeight
        ? [
            {
              header: "Row height",
              choose: {
                value: state.density,
                onChoose: (v: string) => state.setDensity(v === "compact" ? "compact" : "comfortable"),
                tick,
                options: DENSITY_WORDS,
              },
            },
          ]
        : []),
      {
        items: [
          {
            label: "Fit all columns",
            title: "Make every column as wide as what it holds",
            onSelect: state.fitAll,
          },
          {
            label: "Reset widths and order",
            title: "Put every column back where it started, at the width it started",
            onSelect: state.resetLayout,
            disabled: !sized && state.order.length === 0,
          },
        ],
      },
    );
  }
  groups.push({
    header: "Show on the table",
    toggles: {
      onToggle: state.toggleColumn,
      tick,
      items: columnOptionsOf(orderedColumns(columns, state.order), state.visibility).map((c) => ({
        value: c.key,
        label: c.label,
        on: c.on,
        locked: c.locked ? "Always" : undefined,
      })),
    },
  });
  return (
    <div className="more-wrap dtable-cols">
      <Menu
        label="Columns"
        trigger={
          <Button variant="quiet" size="sm" data-testid="people-columns">
            <Icon name="eye" size={12} /> Columns
          </Button>
        }
        groups={groups}
      />
    </div>
  );
}
