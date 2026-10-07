/**
 * One line above the table: how many people there are, how many need a person, and how many were reached this week --
 * and the middle one is the tap that shows them (moved whole from legacy/pages/people.jsx, decision 0015). On a phone the
 * list being shown is the bar's (PeoplePhoneBar); the line keeps the counts. Under Leads the line is leadsStanding's
 * (contracts leads.ts): "322 leads · 272 ready · 3 searches", and "1 search needs you" is the tap that opens the search
 * waiting on an answer.
 *
 * In Glass the frame's head says the line beside the page's name (kit/head/standing.ts), as People's and the Pipeline's
 * are said (page/people-head.tsx); the line under the controls stays for Classic (clients.css hides it in Glass).
 */
import type { ReactNode } from "react";
import { useStanding } from "../../kit/head/standing";

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
  | { scope: "leads"; leads: LeadsStanding; onNeeds: (id: string) => void; act?: ReactNode }
  | { scope?: "people" | "pipeline"; agg: StandingAgg; needsShown?: boolean; onNeeds: () => void };

/** The search waiting on an answer, as the tap that opens it: in the line, and in the head's sentence. */
function leadsNeeds(needs: NonNullable<LeadsStanding["needsYou"]>, onNeeds: (id: string) => void) {
  return (
    <button
      type="button"
      className="pl-standing-needs on"
      onClick={() => onNeeds(needs.searchId)}
      data-testid="leads-standing-needs"
    >
      {needs.count} {needs.count === 1 ? "search needs" : "searches need"} you
    </button>
  );
}

/**
 * Leads' line: drawn under the controls, and said to the frame's head as "People · 96 leads · 91 ready · 6 searches · 1
 * search needs you", with the page's acts (Reach out, Find leads) at the right of the strip.
 */
function LeadsStandingLine({
  leads,
  onNeeds,
  act,
}: {
  leads: LeadsStanding;
  onNeeds: (id: string) => void;
  act?: ReactNode;
}) {
  const needs = leads.needsYou;
  // The page is People's Leads scope, picked in the page's own strip, so it keeps People's name and has no way back (D1).
  useStanding({
    title: "People",
    sentence: (
      <>
        {[leads.total, ...leads.parts].filter((p) => p !== "").join(" · ")}
        {needs && <> · {leadsNeeds(needs, onNeeds)}</>}
      </>
    ),
    back: null,
    act: act ?? undefined,
  });
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
          {leadsNeeds(needs, onNeeds)}
        </span>
      )}
    </div>
  );
}

export function PeopleStanding(props: StandingProps) {
  if (props.scope === "leads") return <LeadsStandingLine leads={props.leads} onNeeds={props.onNeeds} act={props.act} />;
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
