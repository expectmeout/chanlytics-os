/**
 * Which columns show, for People, Leads and the Pipeline: the kit's Menu of switches (kit/menu/menu.tsx, `toggles`),
 * which stays open while each is flipped, as a menu of acts does not, Person drawn on and refusing a press. Escape and a
 * press outside close it and give focus back to its button, and while it is open it is in PL_OVERLAY (words.ts), so the
 * page's keys hold still behind it. A phone draws cards, not columns: each page leaves its controls row, and this with
 * it, off a phone, and clients.css hides its place there too.
 */
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import type { ColumnOption } from "./columns";

export function PeopleColumnsMenu({
  options,
  onPick,
}: {
  options: readonly ColumnOption[];
  onPick: (key: string) => void;
}) {
  return (
    <div className="more-wrap pl-cols">
      <Menu
        label="Columns"
        trigger={
          <Button variant="quiet" size="sm" data-testid="people-columns">
            <Icon name="eye" size={12} /> Columns
          </Button>
        }
        groups={[
          {
            header: "Show on the table",
            toggles: {
              onToggle: onPick,
              tick: <Icon name="check" size={13} />,
              items: options.map((c) => ({
                value: c.key,
                label: c.label,
                on: c.on,
                locked: c.locked ? "Always" : undefined,
              })),
            },
          },
        ]}
      />
    </div>
  );
}
