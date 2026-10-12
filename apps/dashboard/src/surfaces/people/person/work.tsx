/**
 * The work column of a person's page (canvas A §4): the figures, the tabs, and what the tab the address names holds.
 * The tabs are addresses (decision 0052, 13: `clients/<id>[/history|visits|deals|campaigns]`, `/about` on a phone): a
 * press replaces the address, so the page is not mounted again and Back leaves the person. A figure is a door to the tab
 * that says more, or to the business sheet. A thin record (no thread, no deal, little history) has neither, and reads as
 * one scroll. Every word is contracts'.
 */
import type { ReactNode } from "react";
import { PERSON_FIGURES_LABEL, PERSON_TAB_WORDS, PERSON_TABS_LABEL } from "@chanlytics/contracts";
import type { PersonFigureVM, PersonVM } from "@chanlytics/contracts";
import { Figure } from "../../kit/figure/figure";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
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

/** The figures: four at most, each a door. None on a thin record. */
export function Figures({ c }: { c: PageCtx }) {
  const figures = c.p.figures;
  if (!figures.length) return null;
  return (
    <dl className="cl-prof-figures" aria-label={PERSON_FIGURES_LABEL} data-testid="person-figures">
      {figures.map((f) => (
        <Figure key={f.id} id={f.id} label={f.label} value={f.value} meta={f.sub} {...figureDoor(c, f)} />
      ))}
    </dl>
  );
}

/** The tabs this width draws: a desk's with their counts, a phone's with About. None on a thin record. */
export function PersonTabs({ c }: { c: PageCtx }) {
  const tabs = c.phone ? c.p.tabs.phone : c.p.tabs.desk;
  if (!tabs.length) return null;
  return (
    <SubTabs
      label={PERSON_TABS_LABEL}
      value={c.tab}
      tabs={tabs.map((t) => ({
        id: t.id,
        label: t.label,
        ...(t.count !== null ? { count: t.count } : {}),
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
