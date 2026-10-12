/**
 * The work column of a person's page (canvas A §4): the figures, the tabs, and what the tab the address names holds.
 * The tabs are addresses (decision 0052, 13: `clients/<id>[/history|visits|deals|campaigns]`, `/about` on a phone): a
 * press replaces the address, so the page is not mounted again and Back leaves the person. A figure is a door to the tab
 * that says more, or to the business sheet. A thin record (no thread, no deal, little history) has neither, and reads as
 * one scroll. Every word is contracts'.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { flushSync } from "react-dom";
import {
  NEW_SINCE_WORDS,
  PERSON_FIGURES_LABEL,
  PERSON_TAB_WORDS,
  PERSON_TABS_LABEL,
  PERSON_WASH_WORDS,
} from "@chanlytics/contracts";
import type { PersonFigureVM, PersonVM } from "@chanlytics/contracts";
import { Figure } from "../../kit/figure/figure";
import { useWash } from "../../kit/motion/wash";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { touchSwipe, type SwipeHandlers } from "../../legacy-verbs";
import { PersonDealCard } from "../deal/person-deal";
import { Overview } from "./overview";
import { campaignsCard, comingUpSection, historySection } from "./sections";
import { PersonTimeline } from "./timeline";
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
  return <Figure id={f.id} label={f.label} value={f.value} meta={f.sub} washed={washed} {...figureDoor(c, f)} />;
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
 * Whether the strip has left its place and stands stuck under the top bar (canvas A: the glass only once stuck): a mark just
 * above it, watched against the page's scroller.
 */
function useStuck(): [RefObject<HTMLSpanElement | null>, boolean] {
  const mark = useRef<HTMLSpanElement | null>(null);
  const [stuck, setStuck] = useState(false);
  // Judged on every scroll against the scroller the mark is in at that moment, the mark read as the scroll comes: a thin
  // record draws no strip, and an observer rooted on the scroller at mount kept one the page had since drawn again.
  useEffect(() => {
    const judge = () => {
      const el = mark.current;
      const scroller = el && el.isConnected ? el.closest(".cl-profile") : null;
      // Two rectangles a scroll; a state set to what it holds draws nothing.
      if (el && scroller) setStuck(el.getBoundingClientRect().top < scroller.getBoundingClientRect().top);
    };
    document.addEventListener("scroll", judge, true);
    return () => document.removeEventListener("scroll", judge, true);
  }, []);
  return [mark, stuck];
}

/**
 * The tabs this width draws: a desk's with their counts, a phone's with About. None on a thin record. The strip sticks
 * under the top bar as the tab's panes scroll (canvas A), and wears the glass once it is stuck.
 */
export function PersonTabs({ c }: { c: PageCtx }) {
  const [mark, stuck] = useStuck();
  const tabs = c.phone ? c.p.tabs.phone : c.p.tabs.desk;
  if (!tabs.length) return null;
  return (
    <>
      <span ref={mark} className="cl-prof-strip-sentinel" aria-hidden="true" />
      <div className="cl-prof-strip-stand" data-stuck={stuck || undefined} data-testid="person-strip">
        {strip(c, tabs)}
      </div>
    </>
  );
}

/**
 * On a phone a swipe across the work column walks its tabs (canvas A): the column follows the thumb, leaves, and comes back
 * in on the tab beside, as the Calendar's days turn (data-bits touchSwipe, a page that stays). Never from 24px of either
 * edge, the phone's own back, nor from a field or a row that scrolls across. Nothing on a desk.
 */
export function tabSwipe(c: PageCtx): SwipeHandlers {
  if (!c.phone) return {};
  const tabs = c.p.tabs.phone;
  const at = tabs.findIndex((t) => t.id === c.tab);
  if (at < 0 || tabs.length < 2) return {};
  return touchSwipe({
    pages: () => ({
      prev: at > 0,
      next: at < tabs.length - 1,
      stays: true,
      go: (step: number) => {
        const to = tabs[at + step];
        if (to) flushSync(() => c.goTab(to.id));
      },
    }),
    when: () => c.phone,
  });
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

/** Their visits: those not yet over, then those that were, each as History draws it. */
function visitsTab(c: PageCtx, past: PersonVM["timeline"]) {
  const visits = past.filter((t) => t.kind === "visit");
  return (
    <>
      {comingUpSection(c.p.comingUp || [])}
      {visits.length > 0 ? (
        <section className="cl-prof-section cl-prof-history" aria-labelledby="person-visits-title">
          <div className="cl-prof-section-head">
            <h2 className="cl-prof-section-title" id="person-visits-title">
              {PERSON_TAB_WORDS.visits}
            </h2>
          </div>
          <PersonTimeline
            items={visits}
            initials={c.p.initials}
            name={c.p.name}
            showAll={c.tlAll}
            onShowAll={() => c.setTlAll(true)}
            dealsOn={c.p.dealsOn}
          />
        </section>
      ) : null}
    </>
  );
}

/**
 * What the tab picked holds. A thin record is one scroll: the Overview, what is known of them on a phone (no About tab
 * there to hold it), then the History.
 */
export function TabBody({ c, past, about }: { c: PageCtx; past: PersonVM["timeline"]; about: ReactNode }) {
  if (c.p.thin)
    return (
      <>
        <Overview c={c} />
        {c.phone ? about : null}
        {historySection(c, past)}
      </>
    );
  if (c.tab === "history") return historySection(c, past);
  if (c.tab === "visits") return visitsTab(c, past);
  if (c.tab === "deals")
    return <PersonDealCard p={c.dealP} canRecord={c.canRecord} onCompose={c.compose} flash={c.flash} />;
  if (c.tab === "campaigns") return campaignsCard(c.p) || null;
  if (c.tab === "about") return about;
  return <Overview c={c} />;
}
