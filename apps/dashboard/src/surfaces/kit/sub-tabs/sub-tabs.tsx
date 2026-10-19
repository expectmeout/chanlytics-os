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
 * it stands (`onSelect`); a tab that is a page of its own carries its address (`href`, a person's tabs) and is drawn as
 * a link, a plain press still the strip's pick and a modified one the browser's, which opens it apart.
 *
 * On a phone (the kit's 900px) a tab is a thumb's 44px by an invisible margin round its 34px, the bar sits above its
 * foot, and `quietCounts` keeps only the warn tab's figure: the others' say what the line above says again. A strip
 * with more tabs than its pane has room for at the desk's size is `dense`: the phone's sizes, on a desk's line; and
 * where even that is too wide, the strip scrolls across.
 *
 * `look="capsule"` is a pane's few tabs drawn as the segmented capsule (.rec-seg), the picked one the lozenge, the
 * tabs sharing the row: a lead sheet's Why, Contact and Sequence. They stay tabs to a screen reader, as a radio group
 * would not, and a tab names the pane it opens where that pane stands apart from the strip (`controls`, the pane's
 * id). A capsule may have none picked (`value` null: a phone's half sheet, where any tab raises the sheet onto its
 * pane); it has no bar, and a tab's figure, tone, glyph and dot are the line's, not its.
 *
 * It draws what the gallery's Sub-tabs family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser, and the node suite holds to a server's draw of it
 * (tests/styles/kit-behaves.test.mjs). `className` is for the page's layout (where the strip stands in its column and
 * the sides it keeps), and comes last; it is on the strip's wrapper, the line itself is the kit's.
 */
import { Tabs } from "@base-ui/react/tabs";
import type { MouseEvent, ReactElement } from "react";
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
  /**
   * Something there is new to the reader: a dot after its words, named by these words for a screen reader (a person's
   * History, "New since you last looked").
   */
  fresh?: string;
  /**
   * Something there needs you: an amber dot after its figure, named by these words for a screen reader (a sequence's Leads,
   * "Something needs you"), while the figure keeps saying how many are there.
   */
  need?: string;
  /** What pressing it does, on hover. */
  hint?: string;
  /** The page's test id for this tab. */
  testid?: string;
  /** The id of the pane this tab opens, where that pane is drawn apart from the strip (a capsule's). */
  controls?: string;
  /**
   * Its address, where the tab is a page of its own (a person's History, Visits): drawn as a link, so a long press, a
   * middle click or a modified one opens it in a new tab; a plain press stays the strip's own pick (`onSelect`).
   */
  href?: string;
};

/** A strip of sub-tabs: its name, the one picked, the tabs, what picking another does, and how loud its figures are. */
export type SubTabsProps = {
  /** What the strip is, to a screen reader ("Conversations by status"). */
  label: string;
  /** The tab picked: none, in a capsule that shows no pane yet. */
  value: string | null;
  tabs: readonly SubTab[];
  onSelect: (id: string) => void;
  /** On a phone, say only the warn tab's figure. */
  quietCounts?: boolean;
  /** At the desk's size, set the tabs as a phone does: for a strip with more of them than its pane has room for. */
  dense?: boolean;
  /** The segmented capsule in place of the line: a pane's few tabs, sharing its row. */
  look?: "capsule";
  className?: string;
};

/**
 * A tab that is a link: its address on the element, a plain press the strip's pick (the browser's own way there held
 * back), and a press with a modifier or the middle button left to the browser, which opens it apart.
 */
function linkTab(href: string) {
  return {
    nativeButton: false,
    // eslint-disable-next-line jsx-a11y-x/anchor-has-content -- Base UI draws the tab's words inside the link it renders
    render: <a href={href} />,
    onClick: (e: MouseEvent<HTMLElement> & { preventBaseUIHandler: () => void }) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) e.preventBaseUIHandler();
      else e.preventDefault();
    },
  };
}

/** A pane's few tabs as the segmented capsule: each its words alone, the picked one the lozenge. */
function capsuleOf({ label, value, tabs, onSelect, className }: SubTabsProps) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={(next) => onSelect(String(next))}
      className={cx("subtabs-stand", className)}
    >
      <Tabs.List aria-label={label} className="rec-seg" data-look="capsule">
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.id}
            value={tab.id}
            className="rec-seg-btn"
            data-testid={tab.testid}
            title={tab.hint}
            aria-controls={tab.controls}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

/** A line of sub-tabs, one picked; or a pane's few, as the capsule. */
export function SubTabs(props: SubTabsProps) {
  if (props.look === "capsule") return capsuleOf(props);
  const { label, value, tabs, onSelect, quietCounts, dense, className } = props;
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
            aria-controls={tab.controls}
            {...(tab.href ? linkTab(tab.href) : {})}
          >
            {tab.glyph}
            <span className="subtab-label" data-text={tab.label}>
              {tab.label}
            </span>
            {tab.count === undefined ? null : <span className="subtab-count">{tab.count}</span>}
            {tab.need ? (
              <span className="subtab-dot is-warn" role="img" aria-label={tab.need} />
            ) : tab.fresh ? (
              <span className="subtab-dot" role="img" aria-label={tab.fresh} />
            ) : null}
          </Tabs.Tab>
        ))}
        <Tabs.Indicator className="subtab-bar" />
      </Tabs.List>
    </Tabs.Root>
  );
}
