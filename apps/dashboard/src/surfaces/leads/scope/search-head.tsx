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
const bandOf = (p: P) =>
  p.band && p.band.classes.filter((c) => c.count > 0).length > 1 ? (
    <LeadBand band={p.band} cls={p.view.cls} onPick={p.onPickClass} fit={p.fit} onPickFit={p.onPickFit} />
  ) : null;

/** The open search's head: its strip, holding the band and, on its second line, where its adds go; else the band alone. */
export const searchHeadOf = (p: P) => {
  if (!p.search) return null;
  if (!p.strip) return p.band ? bandOf(p) : null;
  return (
    <LeadStrip vm={p.strip} onAction={p.onStripAction} foot={p.addsGoTo}>
      {bandOf(p)}
    </LeadStrip>
  );
};

/** Where the search's adds go, as a line of its own only where no strip carries it on its second line. */
export const addsAloneOf = (p: P) => (p.search && p.strip ? null : p.addsGoTo);

/**
 * A phone's count on a line under the bar, as People's: the bar names the list alone. In an open search the workspace's
 * count is All leads' and the strip says the search's own ("366 leads in all" stood over "51 of 100"), so the line keeps
 * only another search that waits on an answer, where one does.
 */
export const phoneStandingOf = (p: P, phone: boolean) => {
  if (!phone || p.firstDay || p.newSearch) return null;
  if (!p.search) return <LeadsStandingRow leads={p.standing} onNeeds={p.onNeedsYou} />;
  const needs = p.standing.needsYou;
  return needs && needs.searchId !== p.search.id ? (
    <LeadsStandingRow leads={{ total: "", parts: [], needsYou: needs }} onNeeds={p.onNeedsYou} />
  ) : null;
};
