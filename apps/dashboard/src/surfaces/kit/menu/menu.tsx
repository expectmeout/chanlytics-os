/**
 * The kit's menu (kit.css, "MoreMenu"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and step 2.5):
 * the one action menu, opened by a control of the page's (the kit's Button): its items in groups, a line between
 * two groups and a group's heading over it; an item's glyph, its words, a second line or a word at its end; the act
 * that destroys in red; an item that opens a page of its own a link (the shell's "a door is a link"); and a set the
 * page chooses one of, the tick beside the one chosen.
 *
 * Its behaviour is Base UI's Menu (`@base-ui/react/menu`, the plan's decision 15): the arrows walk the items and
 * typing a word's first letters finds one; Enter and Space act; Escape and a press outside close it and give focus
 * back to its control; the page behind holds still while it is open. It hangs under its control from the edge
 * `align` names, and turns over it where the window has no room below, placed by Base UI against the window in a
 * portal on the document's body, where no pane can cut it off or hold it under a blur. The kit writes none of it.
 *
 * It draws what the gallery's Menu family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser. `className` is for the page's layout, and comes last; the
 * ref reaches the menu.
 */
import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ReactElement, ReactNode, Ref } from "react";
import { Fragment } from "react";
import { cx, variants } from "../variants";

/** The room between the control and the menu, as the house's menu leaves it (kit.css, .more-menu's top). */
const MENU_GAP_PX = 8;

const menuClasses = variants({
  base: "more-menu",
  variants: { align: { start: "align-left", end: "align-right" } },
  defaults: { align: "end" },
});
const itemClasses = variants({ base: "more-item", variants: { tone: { danger: "danger" } } });

/** What an item says: its words, which typing finds, a glyph before them, and a second line or a word at its end. */
type MenuWords = { label: string; glyph?: ReactElement; meta?: ReactNode; hint?: ReactNode };

/** An item: words that act where they stand, red where the act destroys, or a door to a page of its own. */
export type MenuItem = MenuWords &
  (
    | { onSelect: () => void; tone?: "danger"; disabled?: boolean; href?: undefined }
    | { href: string; onSelect?: undefined; tone?: undefined; disabled?: undefined }
  );

/** A set the page chooses one of: the one chosen, the options, and the tick drawn beside the one chosen. */
export type MenuChoice = {
  value: string;
  onChoose: (value: string) => void;
  /** The tick (the Icon's `check`, at 13px): drawn on every option, and seen beside the one chosen (kit.css). */
  tick: ReactElement;
  options: readonly { value: string; label: string }[];
};

/** A group of the menu: its items, or a set to choose from, under a heading or none. A line parts two groups. */
export type MenuGroup = { header?: string } & (
  { items: readonly MenuItem[]; choose?: undefined } | { choose: MenuChoice; items?: undefined }
);

/** A menu: what opens it, its groups, the edge it hangs from, and its name where its control's words are not. */
export type MenuProps = {
  /** The page's control that opens it: the kit's Button, which it is drawn as. */
  trigger: ReactElement;
  groups: readonly MenuGroup[];
  align?: "start" | "end";
  /** Its name to a screen reader, where its control's words do not say it (a glyph alone names the control). */
  label?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

/** What an item holds, in the house's order: its glyph, its words, its second line, its word at the end. */
function itemContent({ label, glyph, meta, hint }: MenuWords) {
  return (
    <>
      {glyph}
      <span className="more-item-label">{label}</span>
      {meta ? <span className="more-item-meta">{meta}</span> : null}
      {hint ? <span className="more-item-hint">{hint}</span> : null}
    </>
  );
}

/** One item: a button that acts, or a link to a page. */
function Item({ item }: { item: MenuItem }) {
  if (item.href !== undefined) {
    return (
      <BaseMenu.LinkItem className={itemClasses()} href={item.href} label={item.label}>
        {itemContent(item)}
      </BaseMenu.LinkItem>
    );
  }
  const act = item.onSelect;
  return (
    <BaseMenu.Item
      className={itemClasses({ tone: item.tone })}
      nativeButton
      render={<button type="button" />}
      label={item.label}
      disabled={item.disabled}
      onClick={() => act()}
    >
      {itemContent(item)}
    </BaseMenu.Item>
  );
}

/** A set to choose one of: a radio item each, which closes the menu as it is chosen, as any item does. */
function Choice({ choose }: { choose: MenuChoice }) {
  return (
    <BaseMenu.RadioGroup value={choose.value} onValueChange={(value: string) => choose.onChoose(value)}>
      {choose.options.map((option) => (
        <BaseMenu.RadioItem
          key={option.value}
          value={option.value}
          className={itemClasses()}
          nativeButton
          render={<button type="button" />}
          label={option.label}
          closeOnClick
        >
          {itemContent({ label: option.label, glyph: choose.tick })}
        </BaseMenu.RadioItem>
      ))}
    </BaseMenu.RadioGroup>
  );
}

/** A group: its heading, which names it, over its items or its set. */
function Group({ group }: { group: MenuGroup }) {
  const body = group.choose ? (
    <Choice choose={group.choose} />
  ) : (
    group.items.map((item, at) => <Item key={at} item={item} />)
  );
  if (group.header === undefined) return <>{body}</>;
  return (
    <BaseMenu.Group>
      <BaseMenu.GroupLabel className="more-header">{group.header}</BaseMenu.GroupLabel>
      {body}
    </BaseMenu.Group>
  );
}

/** A menu, opened by the page's control and drawn on the document's body. */
export function Menu({ trigger, groups, align = "end", label, className, ref }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner className="pop-place" sideOffset={MENU_GAP_PX} align={align}>
          <BaseMenu.Popup ref={ref} className={cx(menuClasses({ align }), className)} aria-label={label}>
            {groups.map((group, at) => (
              <Fragment key={at}>
                {at > 0 ? <BaseMenu.Separator className="more-divider" /> : null}
                <Group group={group} />
              </Fragment>
            ))}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
