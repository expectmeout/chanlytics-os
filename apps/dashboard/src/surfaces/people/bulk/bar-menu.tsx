/**
 * The selection bar's menus, written once for a desk's bar and a phone's: the kit's Menu behind the kit's Button, opened by
 * words with a chevron, its groups under their headings. A change still saving keeps a menu shut and says why where it is
 * pressed (the honesty gate, never `disabled`, which no key or finger reaches). The act itself is the page's (bulk-acts.ts).
 */
import type { ReactNode } from "react";
import { Button } from "../../kit/button/button";
import { Menu } from "../../kit/menu/menu";
import type { MenuGroup } from "../../kit";
import { Icon } from "../../kit/icon/icon";
import { gatedProps } from "../../legacy-verbs";
import type { BulkActs } from "./bulk-acts";
import type { BulkCtx } from "./bulk-state";

const SAVING = "One moment — the last change is still saving";

/** A menu of the bar: its words and what they do on hover, its groups, and the size of the bar's buttons (a phone's is large). */
export function barMenu(o: {
  words: ReactNode;
  hover: string;
  groups: MenuGroup[];
  busy: boolean;
  size: "sm" | "lg";
  testid?: string;
}) {
  const { words, hover, groups, busy, size, testid } = o;
  const label = (
    <>
      {words} <Icon name="chevron-down" size={10} />
    </>
  );
  if (busy)
    return (
      <Button size={size} title={hover} data-testid={testid} {...gatedProps(SAVING)}>
        {label}
      </Button>
    );
  return (
    <Menu
      label={hover}
      groups={groups}
      trigger={
        <Button size={size} title={hover} data-testid={testid}>
          {label}
        </Button>
      }
    />
  );
}

/** The bar's Add to list: the lists kept by hand, or, where the saved lists could not be read, a new one alone. */
export function addToListMenu(b: BulkCtx, a: BulkActs, newList: () => void, size: "sm" | "lg") {
  const { st, saved, savedRead } = b;
  const make = { label: "New list…", glyph: <Icon name="plus" size={13} />, onSelect: newList };
  const groups: MenuGroup[] = savedRead
    ? [
        {
          header: "Add to",
          items: [
            ...saved
              .filter((s) => s.byHand)
              .map((s) => ({
                label: s.name,
                glyph: <Icon name="filter" size={13} />,
                onSelect: () => void a.addTo(s),
              })),
            make,
          ],
        },
      ]
    : // Lists that could not be read are not offered; a new one can still be made.
      [{ header: "Your saved lists couldn't be read", items: [make] }];
  return barMenu({ words: "Add to list", hover: "Add to a list", groups, busy: st.busy, size });
}
