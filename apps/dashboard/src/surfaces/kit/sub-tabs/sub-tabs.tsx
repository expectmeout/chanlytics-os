/**
 * The kit's sub-tabs (kit.css, "Sub-tabs"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4): a page's own
 * sub-menu, the few ways to cut the list it shows (the Inbox's buckets, Conversations' channels), as small text tabs on
 * a line: the picked one in ink with a bar under it, the others dim, a figure beside each where it has something to say.
 * It is not the strip of views a page sits in (`.stabs`, the shell's SurfaceTabs): that strip is the page, this one is
 * what is on it, so the two are drawn apart (the frame's capsule over a line of words).
 *
 * Its behaviour is Base UI's Tabs (`@base-ui/react/tabs`, the plan's decision 15): a tablist with one tab stop, on the
 * picked tab; the arrows, Home and End walk the tabs, and Enter or Space picks the one reached (a pick can move the
 * address or read a list, so an arrow alone only moves focus). The bar is the Tabs' indicator, one element that slides
 * between tabs on the page's ease and never draws at a place it has not been (kit.css). A tab is a press that acts where
 * it stands (`onSelect`); a strip whose tabs are pages of their own, with an address each, is a strip of links and
 * draws them as the Button draws one (../press.tsx) when its first such page moves here.
 *
 * On a phone (the kit's 900px) a tab is a thumb's 44px by an invisible margin round its 34px, the bar sits above its
 * foot, and `quietCounts` keeps only the warn tab's figure: the others' say what the line above says again. A strip
 * with more tabs than its pane has room for at the desk's size is `dense`: the phone's sizes, on a desk's line; and
 * where even that is too wide, the strip scrolls across.
 *
 * It draws what the gallery's Sub-tabs family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser, and the node suite holds to a server's draw of it
 * (tests/styles/kit-behaves.test.mjs). `className` is for the page's layout (where the strip stands in its column and
 * the sides it keeps), and comes last; it is on the strip's wrapper, the line itself is the kit's.
 */
import { Tabs } from "@base-ui/react/tabs";
import type { ReactElement } from "react";
import { cx } from "../variants";

/** A tab: the value the page keeps, its words, and what it may say beside them. */
export type SubTab = {
  id: string;
  label: string;
  /** The figure beside its words, where there is one to say (a zero is the page's to say or not). */
  count?: number;
  /** The tab whose figure matters: someone is waiting there. It is the one a phone keeps (`quietCounts`). */
  tone?: "warn";
  /** A glyph before the words, for a strip with room for one. */
  glyph?: ReactElement;
  /** What pressing it does, on hover. */
  hint?: string;
  /** The page's test id for this tab. */
  testid?: string;
};

/** A strip of sub-tabs: its name, the one picked, the tabs, what picking another does, and how loud its figures are. */
export type SubTabsProps = {
  /** What the strip is, to a screen reader ("Conversations by status"). */
  label: string;
  value: string;
  tabs: readonly SubTab[];
  onSelect: (id: string) => void;
  /** On a phone, say only the warn tab's figure. */
  quietCounts?: boolean;
  /** At the desk's size, set the tabs as a phone does: for a strip with more of them than its pane has room for. */
  dense?: boolean;
  className?: string;
};

/** A line of sub-tabs, one picked. */
export function SubTabs({ label, value, tabs, onSelect, quietCounts, dense, className }: SubTabsProps) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={(next) => onSelect(String(next))}
      className={cx("subtabs-stand", className)}
    >
      <Tabs.List
        aria-label={label}
        className="subtabs"
        data-quiet={quietCounts ? "true" : undefined}
        data-dense={dense ? "true" : undefined}
      >
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.id}
            value={tab.id}
            className="subtab"
            data-tone={tab.tone}
            data-testid={tab.testid}
            title={tab.hint}
          >
            {tab.glyph}
            <span className="subtab-label" data-text={tab.label}>
              {tab.label}
            </span>
            {tab.count === undefined ? null : <span className="subtab-count">{tab.count}</span>}
          </Tabs.Tab>
        ))}
        <Tabs.Indicator className="subtab-bar" />
      </Tabs.List>
    </Tabs.Root>
  );
}
