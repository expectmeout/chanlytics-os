/**
 * What the kit's Menu takes, proved where the compiler reads it (menu.tsx): the page's control that opens it, and its
 * groups, each a list of items or a set to choose one of, under a heading or none. An item acts where it stands, red
 * where the act destroys, or opens a page of its own as a link. What would draw an item that does nothing, a red
 * link, a disabled door, words typing cannot find, a group that is two things at once, or a menu with no control stops
 * compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { MenuChoice, MenuGroup, MenuItem, MenuProps, MenuToggles, SharedMenuProps } from "../index";
import { Menu, MenuTrigger, SharedMenu, menuHandle } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _menuTakes(
  glyph: ReactElement,
  trigger: ReactElement,
  menu: RefObject<HTMLDivElement | null>,
  flag: boolean,
): void {
  const act = () => undefined;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Menu>, MenuProps>>,
    Holds<Exactly<MenuProps["align"], "start" | "end" | undefined>>,
    Holds<Exactly<MenuItem["tone"], "danger" | undefined>>,
    Holds<Exactly<MenuItem["label"], string>>,
    Holds<Exactly<MenuGroup["header"], string | undefined>>,
    Holds<Exactly<MenuChoice["onChoose"], (value: string) => void>>,
    Holds<Exactly<MenuToggles["onToggle"], (value: string) => void>>,
    Holds<Exactly<MenuToggles["items"][number]["locked"], string | undefined>>,
  ];
  // A set of switches the menu stays open over (a table's columns), one locked on with its word.
  Menu({
    trigger,
    label: "Columns",
    groups: [
      {
        header: "Show on the table",
        toggles: {
          onToggle: act,
          tick: glyph,
          items: [
            { value: "name", label: "Person", on: true, locked: "Always" },
            { value: "email", label: "Email", on: false },
          ],
        },
      },
    ],
  });
  Menu({ trigger, groups: [{ items: [{ label: "Copy number", glyph, onSelect: act }] }] });
  // A heading over a group, a second line, a word at the end, a door, the danger item, one off as the page runs, and
  // a set to choose one of; hung from its control's start, named where its control's words do not, with the ref.
  Menu({
    trigger,
    align: "start",
    label: "More for Sam Ortega",
    ref: menu,
    className: "pl-menu-wide",
    groups: [
      {
        header: "Sam Ortega",
        items: [
          { label: "Send booking link", meta: "By text", onSelect: act },
          { label: "Pause the receptionist", hint: "until 10:00", disabled: flag, onSelect: act },
          { label: "Open their page", glyph, href: "/w/studio/#/clients/c-1" },
          { label: "Delete person…", tone: "danger", onSelect: act },
          // One a role refuses (the honesty gate's props, spread after its act), with what it says on hover.
          { label: "Export people", title: "Download them as a file", gate: { "aria-disabled": true }, onSelect: act },
        ],
      },
      {
        choose: { value: "newest", onChoose: act, tick: glyph, options: [{ value: "newest", label: "Newest first" }] },
      },
    ],
  });

  // @ts-expect-error an item acts or opens a page: one that does neither does nothing
  Menu({ trigger, groups: [{ items: [{ label: "Copy number" }] }] });
  // @ts-expect-error a door is a link, never red: the act that destroys is a button that acts
  Menu({ trigger, groups: [{ items: [{ label: "Delete", href: "#/clients", tone: "danger" }] }] });
  // @ts-expect-error a door is never disabled: a link that goes nowhere is no door
  Menu({ trigger, groups: [{ items: [{ label: "Open their page", href: "#/clients", disabled: true }] }] });
  // @ts-expect-error an item's words are what typing finds, so they are words
  Menu({ trigger, groups: [{ items: [{ label: glyph, onSelect: act }] }] });
  // @ts-expect-error danger is an item's one tone
  Menu({ trigger, groups: [{ items: [{ label: "Pause", tone: "warn", onSelect: act }] }] });
  // @ts-expect-error a group holds items or a set to choose from, never both
  Menu({ trigger, groups: [{ items: [], choose: { value: "a", onChoose: act, tick: glyph, options: [] } }] });
  // @ts-expect-error a group is one kind of thing: items, a set to choose one of, or switches, never two
  Menu({ trigger, groups: [{ items: [], toggles: { onToggle: act, tick: glyph, items: [] } }] });
  // @ts-expect-error a switch says whether it is on: one with no state draws nothing true
  Menu({ trigger, groups: [{ toggles: { onToggle: act, tick: glyph, items: [{ value: "email", label: "Email" }] } }] });
  // A menu its controls share (a table's rows): each control carries its row, and the menu's items are that row's.
  const calls = menuHandle<{ name: string; dial: () => void }>();
  MenuTrigger({ handle: calls, payload: { name: "Sam's Gym", dial: act }, trigger });
  SharedMenu({
    handle: calls,
    label: (row) => `Call ${row.name}`,
    groups: (row) => [{ header: row.name, items: [{ label: "Call from your phone", onSelect: row.dial }] }],
  });
  type _Shares = [Holds<Exactly<Parameters<SharedMenuProps<{ name: string }>["groups"]>[0], { name: string }>>];
  // @ts-expect-error a control carries what its menu is about, in the shape the menu reads
  MenuTrigger({ handle: calls, payload: { name: "Sam's Gym" }, trigger });
  // @ts-expect-error the shared menu reads its items from the payload, not a list of its own
  SharedMenu({ handle: calls, groups: [] });

  // @ts-expect-error it hangs from its control's start or its end
  Menu({ trigger, align: "center", groups: [] });
  // @ts-expect-error a menu opens from the page's control, which it is drawn as
  Menu({ groups: [] });
}
