/**
 * The kit's sub-tabs (kit.css, "Sub-tabs"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4): a page's own
 * sub-menu, the few ways to cut the list it shows (the Inbox's buckets, Conversations' channels), as small text tabs on
 * a line: the picked one in ink with a bar under it, the others dim, a figure beside each where it has something to say.
 * It is not the strip of views a page sits in (`.stabs`, the shell's SurfaceTabs): that strip is the page, this one is
 * what is on it, so the two are drawn apart (the frame's capsule over a line of words).
 *
 * A tab is a press that acts where it stands (`onSelect`), as the house's buckets and filters were: one is picked, as
 * `aria-pressed` says, and a press of another picks it. A strip whose tabs are pages of their own, with an address each,
 * is a strip of links and draws them as the Button draws one (../press.tsx) when its first such page moves here.
 *
 * On a phone (the kit's 900px) a tab is a thumb's 44px by an invisible margin round its 34px, the bar sits above its
 * foot, and `quietCounts` keeps only the warn tab's figure: the others' say what the line above says again. A strip
 * with more tabs than its pane has room for at the desk's size is `dense`: the phone's sizes, on a desk's line; and
 * where even that is too wide, the strip scrolls across.
 *
 * It draws what the gallery's Sub-tabs family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * tooling/scripts/tests/styles/kit-components.test.mjs holds to it. `className` is for the page's layout (where the strip
 * stands in its column and the sides it keeps), and comes last.
 */
import type { ReactElement } from "react";
import { Press } from "../press";
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
    <div
      role="group"
      aria-label={label}
      className={cx("subtabs", className)}
      data-quiet={quietCounts ? "true" : undefined}
      data-dense={dense ? "true" : undefined}
    >
      {tabs.map((tab) => (
        <Press
          key={tab.id}
          className="subtab"
          aria-pressed={tab.id === value}
          data-tone={tab.tone}
          data-testid={tab.testid}
          title={tab.hint}
          onClick={() => onSelect(tab.id)}
        >
          {tab.glyph}
          {tab.label}
          {tab.count === undefined ? null : <span className="subtab-count">{tab.count}</span>}
        </Press>
      ))}
    </div>
  );
}
