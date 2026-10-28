/**
 * How the table is laid out, for People, Leads and the Pipeline: the kit's Menu holding which columns show (switches,
 * which stay open while each is flipped, as a menu of acts does not, Person drawn on and refusing a press), how tall a row
 * stands, and the way back from widths and places the member changed. Escape and a press outside close it and give focus
 * back to its button, and while it is open it is in PL_OVERLAY (words.ts), so the page's keys hold still behind it. A
 * phone draws cards, not columns: each page leaves its controls row, and this with it, off a phone, and clients.css
 * hides its place there too.
 */
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import type { MenuGroup } from "../../kit/menu/menu";
import type { ColumnOption } from "./columns";
import type { Density } from "./layout";
import type { TableLayout } from "./use-layout";

const DENSITY_WORDS: readonly { value: Density; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

export function PeopleColumnsMenu({
  options,
  onPick,
  layout = null,
  rowHeight = true,
}: {
  options: readonly ColumnOption[];
  onPick: (key: string) => void;
  /** The widths and the row height: where the table has them (a desktop's), the menu offers them beside the columns. */
  layout?: TableLayout | null;
  /** Whether the table's rows can stand at two heights: Leads' rows have the height of their card, and say nothing of it. */
  rowHeight?: boolean;
}) {
  const tick = <Icon name="check" size={13} />;
  // The row height and the way back come first: under fifteen switches the way back stood below the menu's fold, at the
  // foot of a scroll nobody knew was there (691px of menu on a 900px window, 27 Oct 2026), and it is the one way out of
  // a layout that went wrong.
  const groups: MenuGroup[] = [];
  if (layout) {
    groups.push(
      ...(rowHeight
        ? [
            {
              header: "Row height",
              choose: {
                value: layout.density,
                onChoose: (v: string) => layout.onDensity(v === "compact" ? "compact" : "comfortable"),
                tick,
                options: DENSITY_WORDS,
              },
            },
          ]
        : []),
      {
        items: [
          {
            label: "Reset widths and order",
            title: "Put every column back where it started, at the width it started",
            onSelect: layout.onResetAll,
            disabled: !layout.changed,
          },
        ],
      },
    );
  }
  groups.push({
    header: "Show on the table",
    toggles: {
      onToggle: onPick,
      tick,
      items: options.map((c) => ({
        value: c.key,
        label: c.label,
        on: c.on,
        locked: c.locked ? "Always" : undefined,
      })),
    },
  });
  return (
    <div className="more-wrap pl-cols">
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
