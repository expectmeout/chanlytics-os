/**
 * What the kit's TabBar takes, proved where the compiler reads it (tab-bar.tsx): its name to a screen reader, the
 * place on screen (none, where no place holds the page), the places with an address and a glyph each, what pressing
 * one does, and More. A place may carry a count, the warn tone, a test id and a way to start its read; what would draw
 * a place with no address or no glyph, a bar with no name or a tone the kit does not have stops compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { TabBarMore, TabBarPlace, TabBarProps } from "../index";
import { TabBar } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _tabBarTakes(): void {
  const pick = (_id: string) => undefined;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof TabBar>, TabBarProps>>,
    Holds<Exactly<TabBarProps["picked"], string | null>>,
    Holds<Exactly<TabBarProps["more"], TabBarMore | undefined>>,
    Holds<Exactly<TabBarPlace["tone"], "warn" | undefined>>,
    Holds<Exactly<TabBarPlace["count"], number | null | undefined>>,
  ];
  TabBar({
    label: "Main",
    picked: "today",
    places: [{ id: "today", label: "Today", href: "/w/studio/today", glyph: null }],
    onPick: pick,
  });
  // No place holds the page; a count in its tone, a test id, a read to start, More, and the page's layout.
  TabBar({
    label: "Main",
    picked: null,
    testid: "phone-tabs",
    className: "phone-places",
    places: [
      {
        id: "inbox",
        label: "Inbox",
        href: "/w/studio/inbox",
        glyph: null,
        count: 3,
        tone: "warn",
        testid: "tab-inbox",
      },
      { id: "calendar", label: "Calendar", href: "/w/studio/calendar", glyph: null, warm: () => undefined },
    ],
    onPick: pick,
    more: { label: "Menu", word: "More", glyph: null, onPress: () => undefined },
  });
  TabBar({
    label: "Main",
    picked: "today",
    // @ts-expect-error a place has an address: a tab is a link
    places: [{ id: "today", label: "Today", glyph: null }],
    onPick: pick,
  });
  TabBar({
    label: "Main",
    picked: "today",
    // @ts-expect-error a place has a glyph over its words
    places: [{ id: "today", label: "Today", href: "/w/studio/today" }],
    onPick: pick,
  });
  // @ts-expect-error a bar is named for a screen reader
  TabBar({ picked: "today", places: [], onPick: pick });
  TabBar({
    label: "Main",
    picked: "inbox",
    // @ts-expect-error the one tone a count takes is the warn's
    places: [{ id: "inbox", label: "Inbox", href: "/w/studio/inbox", glyph: null, count: 3, tone: "danger" }],
    onPick: pick,
  });
}
