/**
 * A people idea's card (decision 0070): the people search an idea planned, to approve as a places idea's plan is (Ruben,
 * 22 Oct 2026: a people idea opened the six boxes of Find people, filled in, where a places idea opens a card to
 * approve). The plan in one sentence, the facts in the places card's own order and shapes, where its people come from
 * (the card's source-rights note, said before anything is spent), and the two presses: Find N companies, and Change what
 * I asked, which is Ask, as on the places card. Every word is contracts'.
 */
import {
  LEAD_CARDS,
  peoplePlanAsk,
  peoplePlanFactLine,
  peoplePlanFacts,
  peoplePlanSentence,
  type LeadPeoplePlan,
  type PeopleMonth,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";

interface PeoplePlanCardProps {
  plan: LeadPeoplePlan;
  month: PeopleMonth | null;
  busy: boolean;
  refusal: string | null;
  /** A phone's sheet: the facts are one line. */
  asSteps: boolean;
  onApprove: (plan: LeadPeoplePlan) => void;
  onBack: () => void;
}

/** The card's icons, by fact: how long, what it skips, what counts (the places card's three). */
const FACT_ICONS = ["clock", "users", "shield"] as const;

export const LeadPeoplePlanCard = ({ plan, month, busy, refusal, asSteps, onApprove, onBack }: PeoplePlanCardProps) => {
  const ask = peoplePlanAsk(plan, month);
  const rights = LEAD_CARDS.find((c) => c.id === "people_at_companies")?.rights ?? "";
  return (
    <div className="lf-plan" data-testid="lead-people-plan">
      <p className="lf-sentence" data-testid="plan-sentence">
        {peoplePlanSentence(plan)}
      </p>
      {asSteps ? (
        <p className="lf-fact-line" data-testid="plan-facts">
          {peoplePlanFactLine(plan, month)}
        </p>
      ) : (
        <div className="lf-facts" data-testid="plan-facts">
          {peoplePlanFacts(plan, month).map((t, i) => (
            <span key={t} className="lf-fact">
              <Icon name={FACT_ICONS[i] ?? "shield"} size={13} />
              {t}
            </span>
          ))}
        </div>
      )}
      {rights ? (
        <p className="lf-said" data-testid="plan-rights">
          {rights}
        </p>
      ) : null}
      {ask.covers ? (
        <p className="lf-said" data-testid="plan-covers">
          {ask.covers}
        </p>
      ) : null}
      {refusal ? (
        <p className="field-error" role="alert" data-testid="plan-refusal">
          {refusal}
        </p>
      ) : null}
      <div className="lf-actions">
        <Button
          variant="primary"
          size="lg"
          data-testid="plan-approve"
          disabled={busy || ask.count < 1}
          onClick={() => onApprove(ask.count === plan.count ? plan : { ...plan, count: ask.count })}
        >
          {busy ? "Starting…" : ask.label}
        </Button>
        <Button variant="quiet" data-testid="plan-back" onClick={onBack}>
          Change what I asked
        </Button>
      </div>
    </div>
  );
};
