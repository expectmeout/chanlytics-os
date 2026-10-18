/**
 * What the kit's SubTabs takes, proved where the compiler reads it (sub-tabs.tsx): a strip named for a screen reader,
 * the one picked, its tabs and what picking another does. A tab may carry a figure, the warn tone, a glyph, a hover
 * and a test id; what would draw a strip with no name, a tab with nothing to say or a tone the kit does not have stops
 * compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { SubTab, SubTabsProps } from "../index";
import { SubTabs } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _subTabsTake(glyph: ReactElement): void {
  const pick = (_id: string) => undefined;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof SubTabs>, SubTabsProps>>,
    Holds<Exactly<SubTab["tone"], "warn" | undefined>>,
    Holds<Exactly<SubTab["count"], number | undefined>>,
    Holds<Exactly<SubTabsProps["quietCounts"], boolean | undefined>>,
    Holds<Exactly<SubTabsProps["dense"], boolean | undefined>>,
    Holds<Exactly<SubTabsProps["look"], "capsule" | undefined>>,
    Holds<Exactly<SubTabsProps["value"], string | null>>,
  ];
  SubTabs({
    label: "Conversations by status",
    value: "needs",
    tabs: [{ id: "needs", label: "Needs you" }],
    onSelect: pick,
  });
  // A figure, the tone that keeps it on a phone, a glyph, a hover, a test id, a quiet strip and the page's layout.
  SubTabs({
    label: "Conversations by channel",
    value: "all",
    quietCounts: true,
    dense: true,
    className: "ix-buckets",
    tabs: [
      { id: "needs", label: "Needs you", count: 27, tone: "warn", hint: "Waiting on you", testid: "cv-tab-needs" },
      { id: "all", label: "All", count: 64, glyph },
    ],
    onSelect: pick,
  });
  // A pane's few tabs as the capsule, none picked yet, the picked one naming the pane it opens.
  SubTabs({
    label: "About this lead",
    look: "capsule",
    value: null,
    tabs: [{ id: "why", label: "Why", controls: "lead-sheet-pane" }],
    onSelect: pick,
  });

  // @ts-expect-error a strip is named: a group of tabs with no name says nothing to a screen reader
  SubTabs({ value: "all", tabs: [{ id: "all", label: "All" }], onSelect: pick });
  // @ts-expect-error a tab says its words: an id alone is a tab with nothing on it
  SubTabs({ label: "By channel", value: "all", tabs: [{ id: "all" }], onSelect: pick });
  // @ts-expect-error a figure is a number: the page says what a zero says
  SubTabs({ label: "By channel", value: "all", tabs: [{ id: "all", label: "All", count: "12" }], onSelect: pick });
  // @ts-expect-error the kit has the warn tone and no other
  SubTabs({ label: "By channel", value: "all", tabs: [{ id: "all", label: "All", tone: "ok" }], onSelect: pick });
  // @ts-expect-error a strip picks one: with nothing to pick another with, it is a row of words
  SubTabs({ label: "By channel", value: "all", tabs: [{ id: "all", label: "All" }] });
  // @ts-expect-error the line and the capsule are the kit's two looks
  SubTabs({ label: "By channel", look: "pills", value: "all", tabs: [{ id: "all", label: "All" }], onSelect: pick });
}
