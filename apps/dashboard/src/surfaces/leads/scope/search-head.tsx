/**
 * What stands over an open search's rows (out of scope.tsx, 16 Nov 2026: "cleaner, less redundant"): its strip, two lines
 * at most, what it does with its one act, then its count beside where its adds go; its piles as tabs only where there are
 * two or more to choose between; and, on a phone, the workspace's line only where another search waits on an answer.
 */
import { LeadsStandingRow } from "../../people/rail/standing";
import { LeadBand } from "../bench/band";
import { LeadStrip } from "../finder/strip-view";
import type { LeadsScopeProps } from "../page/props";

type P = LeadsScopeProps;

/**
 * The band only where it narrows something: two piles or more with leads in them (a list of the owner's own). A search the
 * finder ran keeps one, Qualified (decision 0133), and a row of one tab narrowed nothing and said the count twice, over the
 * strip's "51 of 100". Its fits stay the table's to sort and filter.
 */
const bandOf = (page: P) =>
  page.band && page.band.classes.filter((c) => c.count > 0).length > 1 ? (
    <LeadBand
      band={page.band}
      cls={page.view.cls}
      onPick={page.onPickClass}
      fit={page.fit}
      onPickFit={page.onPickFit}
    />
  ) : null;

/** The open search's head: its strip, holding the band and, on its second line, where its adds go; else the band alone. */
export const searchHeadOf = (page: P) => {
  if (!page.search) return null;
  if (!page.strip) return page.band ? bandOf(page) : null;
  return (
    <LeadStrip vm={page.strip} onAction={page.onStripAction} foot={page.addsGoTo}>
      {bandOf(page)}
    </LeadStrip>
  );
};

/** Where the search's adds go, as a line of its own only where no strip carries it on its second line. */
export const addsAloneOf = (page: P) => (page.search && page.strip ? null : page.addsGoTo);

/**
 * A phone's count on a line under the bar, as People's: the bar names the list alone. In an open search the workspace's
 * count is All leads' and the strip says the search's own ("366 leads in all" stood over "51 of 100"), so the line keeps
 * only another search that waits on an answer, where one does.
 */
export const phoneStandingOf = (page: P, phone: boolean) => {
  if (!phone || page.firstDay || page.newSearch) return null;
  if (!page.search) return <LeadsStandingRow leads={page.standing} onNeeds={page.onNeedsYou} />;
  const needs = page.standing.needsYou;
  return needs && needs.searchId !== page.search.id ? (
    <LeadsStandingRow leads={{ total: "", parts: [], needsYou: needs }} onNeeds={page.onNeedsYou} />
  ) : null;
};
