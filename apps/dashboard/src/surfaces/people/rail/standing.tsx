/**
 * One line above the table: how many people there are, how many need a person, and how many were reached this week --
 * and the middle one is the tap that shows them (moved whole from legacy/pages/people.jsx, decision 0015). On a phone the
 * list being shown is the bar's (PeoplePhoneBar); the line keeps the counts. Under Leads the line is leadsStanding's
 * (contracts leads.ts): "322 leads · 272 ready · 3 searches", and "1 search needs you" is the tap that opens the search
 * waiting on an answer.
 */

/** Leads' standing line, as contracts' `leadsStanding` says it. */
interface LeadsStanding {
  total: number | string;
  parts: readonly string[];
  needsYou: { searchId: string; count: number } | null;
}

/** People's counts, as the surface's aggregates hold them. */
interface StandingAgg {
  total: number;
  needsYou: number;
  reachedWeek: number;
}

type StandingProps =
  | { scope: "leads"; leads: LeadsStanding; onNeeds: (id: string) => void }
  | { scope?: "people" | "pipeline"; agg: StandingAgg; needsShown?: boolean; onNeeds: () => void };

function leadsLine(leads: LeadsStanding, onNeeds: (id: string) => void) {
  const needs = leads.needsYou;
  return (
    <div className="pl-standing" data-testid="leads-standing">
      <span className="pl-standing-total">{leads.total}</span>
      {leads.parts.map((part) => (
        <span key={part} className="pl-standing-part">
          <span className="pl-standing-dot" aria-hidden="true">
            ·
          </span>
          <span className="pl-standing-reached">{part}</span>
        </span>
      ))}
      {needs && (
        <span className="pl-standing-part">
          <span className="pl-standing-dot" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            className="pl-standing-needs on"
            onClick={() => onNeeds(needs.searchId)}
            data-testid="leads-standing-needs"
          >
            {needs.count} {needs.count === 1 ? "search needs" : "searches need"} you
          </button>
        </span>
      )}
    </div>
  );
}

export function PeopleStanding(props: StandingProps) {
  if (props.scope === "leads") return leadsLine(props.leads, props.onNeeds);
  const { agg, needsShown = false, onNeeds } = props;
  return (
    <div className="pl-standing" data-testid="people-standing">
      <span className="pl-standing-total">
        {agg.total.toLocaleString()} {agg.total === 1 ? "person" : "people"}
      </span>
      {agg.needsYou > 0 && (
        <span className="pl-standing-part">
          <span className="pl-standing-dot" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            className={`pl-standing-needs ${needsShown ? "on" : ""}`}
            aria-pressed={needsShown}
            onClick={onNeeds}
            data-testid="people-standing-needs"
          >
            {agg.needsYou} need you
          </button>
        </span>
      )}
      {agg.reachedWeek > 0 && (
        <span className="pl-standing-part">
          <span className="pl-standing-dot" aria-hidden="true">
            ·
          </span>
          <span className="pl-standing-reached">{agg.reachedWeek} reached this week</span>
        </span>
      )}
    </div>
  );
}
