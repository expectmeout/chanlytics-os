/**
 * People's menus, drawn by the kit's Menu (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4). A People menu
 * is built as data -- a label, the name of its glyph, its act, a line between two groups (`divider`), a heading over the
 * group under it (`header`), a set the member chooses one of (`checked` on each item of it: a sort) and the honesty gate's
 * props -- by the page that knows what the acts are (phone-menu.ts, the row and card menus, the notes and lists), and this
 * writes the kit's groups from it once, so no menu spells the kit's shape a second time. `moreButton` is the control that
 * opens one: the quiet glyph, named for a screen reader, which the page places.
 */
import type { ReactNode } from "react";
import { Button } from "../kit/button/button";
import type { MenuGroup, MenuItem } from "../kit";
import { Icon } from "../kit/icon/icon";

/** One item of a People menu, or the line or heading between two groups. */
export interface PeopleMenuItem {
  label?: string;
  /** The name of its glyph (Icon's). */
  icon?: string;
  onClick?: () => void;
  danger?: boolean;
  /** A word at the item's end, and a second line under it. */
  meta?: ReactNode;
  hint?: ReactNode;
  /** What pressing does, on hover. */
  title?: string;
  /** One of a set the member chooses one of: ticked when true, and drawn on every one of the set. */
  checked?: boolean;
  /** The honesty gate's props (`gate(...)`), which a refused item keeps and is pressed through. */
  gate?: Record<string, unknown>;
  divider?: boolean;
  header?: string;
}

const noAct = () => {};

/** An item the member presses: its words, its glyph, its act, in red where it destroys. */
function itemOf(it: PeopleMenuItem): MenuItem {
  return {
    label: it.label ?? "",
    glyph: it.icon ? <Icon name={it.icon} size={13} /> : undefined,
    meta: it.meta,
    hint: it.hint,
    title: it.title,
    gate: it.gate,
    tone: it.danger ? "danger" : undefined,
    onSelect: it.onClick ?? noAct,
  };
}

/** A run of items one of which is chosen: the one ticked is the value, and a choice acts as the item would. */
function choiceOf(set: readonly PeopleMenuItem[]): MenuGroup {
  const options = set.map((it, at) => ({ value: String(at), label: it.label ?? "" }));
  const chosen = set.findIndex((it) => it.checked);
  return {
    choose: {
      value: chosen < 0 ? "" : String(chosen),
      onChoose: (value) => (set[Number(value)]?.onClick ?? noAct)(),
      tick: <Icon name="check" size={13} />,
      options,
    },
  };
}

/** A People menu's items as the kit Menu's groups: a divider or a heading starts a group, a set of choices is its own. */
export function menuGroups(items: readonly PeopleMenuItem[]): MenuGroup[] {
  const groups: MenuGroup[] = [];
  let header: string | undefined;
  let run: MenuItem[] = [];
  let set: PeopleMenuItem[] = [];
  // The group's heading goes over the first part of it that is drawn, and is spent there.
  const put = (group: MenuGroup) => {
    groups.push(header === undefined ? group : { header, ...group });
    header = undefined;
  };
  const endRun = () => {
    if (run.length) put({ items: run });
    run = [];
  };
  const endSet = () => {
    if (set.length) put(choiceOf(set));
    set = [];
  };
  for (const it of items) {
    if (it.divider || it.header !== undefined) {
      endRun();
      endSet();
      header = it.header;
    } else if (typeof it.checked === "boolean") {
      endRun();
      set.push(it);
    } else {
      endSet();
      run.push(itemOf(it));
    }
  }
  endRun();
  endSet();
  return groups;
}

/**
 * A menu standing where a press would also reach what holds it (a row that opens its lead, a card, a peek): its presses
 * are kept to itself, its control's and its items' alike (the kit's Menu is drawn on the body, and a press on it still
 * reaches its holders through React), in the `more-wrap` box the pages' layout names, as the house's MoreMenu drew it.
 */
export function MenuInPlace({ children }: { children: ReactNode }) {
  return (
    <div className="more-wrap" role="presentation" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

/** The control that opens a menu of acts: the quiet glyph (the ⋯), named for a screen reader; the page places it. */
export function moreButton(o: {
  title: string;
  testid?: string;
  className?: string;
  size?: number;
  icon?: string;
  big?: boolean;
}) {
  const { title, testid, className, size = 13, icon = "more", big = false } = o;
  return (
    <Button
      iconOnly
      variant="quiet"
      size={big ? "md" : "sm"}
      aria-label={title}
      title={title}
      data-testid={testid}
      className={className}
    >
      <Icon name={icon} size={size} />
    </Button>
  );
}
