/**
 * The work column of a person's page (canvas A §4): the figures, the tabs, and what the tab the address names holds.
 * The tabs are addresses (decision 0052, 13: `clients/<id>[/history|visits|deals|campaigns]`, `/about` on a phone): a
 * press replaces the address, so the page is not mounted again and Back leaves the person. A figure is a door to the tab
 * that says more, or to the business sheet. A thin record (no thread, no deal, little history) has neither, and reads as
 * one scroll. Every word is contracts'.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  NEW_SINCE_WORDS,
  PERSON_FIGURES_LABEL,
  PERSON_TABS_LABEL,
  PERSON_WASH_WORDS,
  personTabRoute,
} from "@chanlytics/contracts";
import type { PersonFigureVM, PersonVM } from "@chanlytics/contracts";
import { hrefOfRoute } from "@/legacy-bridge/workspace";
import { Figure } from "../../kit/figure/figure";
import { useSlide } from "../../kit/motion/use-slide";
import { viewDeck } from "../../kit/motion/view-deck";
import { useWash } from "../../kit/motion/wash";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { viewPager, type ViewPage } from "../../kit/view-tabs/pager";
import { ViewTabs } from "../../kit/view-tabs/view-tabs";
import { PersonDealCard } from "../deal/person-deal";
import { Overview } from "./overview";
import { campaignsCard, historySection } from "./sections";
import { VisitsTab } from "./tabs/visits";
import type { PageCtx } from "./ctx";

/** Where a figure goes: its tab, or the business sheet; a figure with nowhere to go is a number alone. */
function figureDoor(c: PageCtx, f: PersonFigureVM) {
  const to = f.to;
  if (!to) return {};
  return { door: { onClick: () => (to === "business" ? c.setSheet(true) : c.goTab(to)) } };
}

/** One figure, washed when someone else moves it while the page is open (canvas A's wash). */
function WatchedFigure({ c, f }: { c: PageCtx; f: PersonFigureVM }) {
  const washed = useWash(c.p.id, f.value, PERSON_WASH_WORDS.figure(f.label, f.value));
  // On a phone each figure is a tile of its own, two to a line (canvas A, P1); on a desk a share of one pane's line.
  return (
    <Figure
      id={f.id}
      label={f.label}
      value={f.value}
      meta={f.sub}
      washed={washed}
      look={c.phone ? "tile" : undefined}
      {...figureDoor(c, f)}
    />
  );
}

/** The figures: four at most, each a door. None on a thin record. */
export function Figures({ c }: { c: PageCtx }) {
  const figures = c.p.figures;
  if (!figures.length) return null;
  return (
    <dl className="cl-prof-figures" aria-label={PERSON_FIGURES_LABEL} data-testid="person-figures">
      {figures.map((f) => (
        <WatchedFigure key={f.id} c={c} f={f} />
      ))}
    </dl>
  );
}

/**
 * Whether a desk's strip has left its place and stands stuck under the top bar (canvas A: the glass only once stuck): the
 * stand sticks a pixel above the scroller's edge, so it is stuck while its top is above that edge. A phone's capsule is
 * glass already and is never judged.
 */
function useStuck(phone: boolean): [RefObject<HTMLDivElement | null>, boolean] {
  const stand = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);
  // Judged on every scroll against the scroller the stand is in at that moment, read as the scroll comes: a thin record
  // draws no strip, and an observer rooted on the scroller at mount kept one the page had since drawn again.
  useEffect(() => {
    if (phone) {
      setStuck(false);
      return;
    }
    const judge = () => {
      const el = stand.current;
      const scroller = el && el.isConnected ? el.closest(".cl-profile") : null;
      // Two rectangles a scroll; a state set to what it holds draws nothing.
      if (el && scroller) setStuck(el.getBoundingClientRect().top < scroller.getBoundingClientRect().top);
    };
    document.addEventListener("scroll", judge, true);
    return () => document.removeEventListener("scroll", judge, true);
  }, [phone]);
  return [stand, stuck];
}

/**
 * The tabs this width draws: a desk's with their counts, a phone's with About. None on a thin record. The strip sticks
 * under the top bar as the tab's panes scroll (canvas A): on a desk it wears the glass once it is stuck; on a phone it is
 * the kit's capsule of views (`.stabs`), glass already, its tabs links and the tab's panes the view a press moves.
 */
export function PersonTabs({ c }: { c: PageCtx }) {
  const [stand, stuck] = useStuck(c.phone);
  const tabs = c.phone ? c.p.tabs.phone : c.p.tabs.desk;
  if (!tabs.length) return null;
  return (
    <div ref={stand} className="cl-prof-strip-stand" data-stuck={stuck || undefined} data-testid="person-strip">
      {c.phone ? capsule(c, tabs) : strip(c, tabs)}
    </div>
  );
}

/**
 * What the tab picked holds, as a view of the page (the kit's view deck, kit/motion/view-deck.ts): replaced as the tab
 * changes, arriving from the side the tab stands on (a phone slides it, a desk cross-fades it). The head and the figures
 * hold still, and so does the page's scroll (tabs/tab-scroll.ts). On a phone a swipe across it walks the capsule over it:
 * the page's thumb (person-real.tsx pageSwipe) asks `tabPages`.
 */
export function TabView({ c, children }: { c: PageCtx; children: ReactNode }) {
  const tabs = c.phone ? c.p.tabs.phone : c.p.tabs.desk;
  const slide = useSlide(
    tabs.map((t) => t.id),
    c.tab,
  );
  return (
    <div className="cl-prof-deck" key={c.tab} ref={viewDeck.view("person-tab")} data-slide={slide}>
      {children}
    </div>
  );
}

/**
 * The tab a swipe across walks on a phone (the kit's viewPager over the tab's panes: they follow the thumb, the capsule's
 * light with them), for a touch that began in the panes; none for one that began on the head or the figures, which a
 * swipe right takes back to People instead. A page with no strip (a thin record) walks none.
 */
export function tabPages(page: Element, from: EventTarget | null): ViewPage | null {
  const deck = page.querySelector(".cl-prof-deck:not(.view-leaving)");
  return deck && from instanceof Node && deck.contains(from) ? viewPager(deck, from) : null;
}

/** A phone's strip: the kit's capsule of views, each tab its address, a press moving the tab's panes by the deck. */
function capsule(c: PageCtx, tabs: PersonVM["tabs"]["phone"]) {
  return (
    <ViewTabs
      name="person"
      label={PERSON_TABS_LABEL}
      picked={c.tab}
      tabs={tabs.map((t) => ({
        id: t.id,
        label: t.label,
        href: hrefOfRoute(personTabRoute(c.p.id, t.id)),
        testid: `person-tab-${t.id}`,
      }))}
      onPick={(id) => {
        const picked = tabs.find((t) => t.id === id);
        if (picked) c.goTab(picked.id);
      }}
      fill
    />
  );
}

/** The strip itself: the kit's sub-tabs, a press moving the address. */
function strip(c: PageCtx, tabs: PersonVM["tabs"]["desk"]) {
  return (
    <SubTabs
      label={PERSON_TABS_LABEL}
      value={c.tab}
      tabs={tabs.map((t) => ({
        id: t.id,
        label: t.label,
        ...(t.count !== null ? { count: t.count } : {}),
        // History says something there is new since the reader last looked (0052): the dot, never a second figure.
        ...(t.id === "history" && c.fresh.size > 0 ? { fresh: NEW_SINCE_WORDS } : {}),
        // Each tab is the person's address with its word (0052): a link, so it opens apart as any door does.
        href: hrefOfRoute(personTabRoute(c.p.id, t.id)),
        testid: `person-tab-${t.id}`,
      }))}
      onSelect={(id) => {
        const picked = tabs.find((t) => t.id === id);
        if (picked) c.goTab(picked.id);
      }}
      quietCounts
      className="cl-prof-strip"
    />
  );
}

/**
 * What the tab picked holds. A thin record is one scroll (canvas A, P3): the Overview, the History, then on a phone what
 * is known of them (no About tab there to hold it).
 */
export function TabBody({ c, past, about }: { c: PageCtx; past: PersonVM["timeline"]; about: ReactNode }) {
  if (c.p.thin)
    return (
      <>
        <Overview c={c} />
        {historySection(c, past)}
        {c.phone ? about : null}
      </>
    );
  if (c.tab === "history") return historySection(c, past);
  if (c.tab === "visits") return <VisitsTab c={c} />;
  if (c.tab === "deals")
    return <PersonDealCard p={c.dealP} canRecord={c.canRecord} onCompose={c.compose} flash={c.flash} />;
  if (c.tab === "campaigns") return campaignsCard(c.p) || null;
  if (c.tab === "about") return about;
  return <Overview c={c} />;
}
