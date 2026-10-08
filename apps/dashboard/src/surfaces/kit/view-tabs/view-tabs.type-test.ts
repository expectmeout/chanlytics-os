/**
 * What the kit's ViewTabs takes, proved where the compiler reads it (view-tabs.tsx): which strip it is, its name to a
 * screen reader, the view picked, the views with an address each, and what picking another does. A view may carry a
 * count, the warn tone, a mark that something is on now, a hover, a test id and a way to start its read; what would
 * draw a view with no address, a strip with no name or a tone the kit does not have stops compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { ViewTab, ViewTabsProps } from "../index";
import { ViewTabs } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _viewTabsTake(): void {
  const pick = (_id: string) => undefined;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof ViewTabs>, ViewTabsProps>>,
    Holds<Exactly<ViewTab["tone"], "warn" | undefined>>,
    Holds<Exactly<ViewTab["count"], number | null | undefined>>,
    Holds<Exactly<ViewTab["live"], boolean | undefined>>,
    Holds<Exactly<ViewTabsProps["mayLeave"], (() => boolean) | undefined>>,
  ];
  ViewTabs({
    name: "inbox",
    label: "Section views",
    picked: "inbox",
    tabs: [{ id: "inbox", label: "Needs you", href: "/w/studio/inbox" }],
    onPick: pick,
  });
  // A count in its tone, a view with something on now, a hover, a test id, a read to start, a page that may not be left
  // yet, and the page's layout.
  ViewTabs({
    name: "inbox",
    label: "Section views",
    testid: "the-strip",
    className: "ix-strip",
    picked: "live",
    mayLeave: () => false,
    tabs: [
      { id: "inbox", label: "Needs you", href: "/w/studio/inbox", count: 3, tone: "warn", tip: "Waiting on you" },
      { id: "live", label: "Live", href: "/w/studio/live", live: true, testid: "tab-live", warm: () => undefined },
    ],
    onPick: pick,
  });
  ViewTabs({
    name: "inbox",
    label: "Section views",
    picked: "inbox",
    // @ts-expect-error a view has an address: a tab is a link
    tabs: [{ id: "inbox", label: "Needs you" }],
    onPick: pick,
  });
  // @ts-expect-error a strip says which strip it is
  ViewTabs({ label: "Section views", picked: "inbox", tabs: [], onPick: pick });
  // @ts-expect-error a strip is named for a screen reader
  ViewTabs({ name: "inbox", picked: "inbox", tabs: [], onPick: pick });
  ViewTabs({
    name: "inbox",
    label: "Section views",
    picked: "inbox",
    // @ts-expect-error the one tone a count takes is the warn's
    tabs: [{ id: "inbox", label: "Needs you", href: "/w/studio/inbox", count: 3, tone: "danger" }],
    onPick: pick,
  });
}
