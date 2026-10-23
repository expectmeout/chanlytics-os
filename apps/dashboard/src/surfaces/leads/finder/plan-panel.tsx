/**
 * The plan panel (moved from legacy/pages/leads-finder.jsx, decision 0015): the card for a plan born from the strip (more,
 * nearby, look further, carry on, try again) or an idea (a people idea's is its own card, people-plan-card.tsx), and,
 * when a search stopped to ask, the answer row that runs the amend turn
 * (spec F5): the question, one input, "Send my answer", and the trace line while Claude reads. A fresh Find is Ask's (F1,
 * F2); nothing here composes one, so the row is drawn only under a question.
 *
 * stage: compose (answering only) | thinking | plan | starting. `answering` is what the page hands it under a waiting
 * search's question, or null; it is the row's discriminator, so every caller says it. Hookless, as every part of People is:
 * all of its state lives in the page, which closes the panel on Esc, and arrives here as props.
 */
import type { LeadPeoplePlan, LeadPlanFacts, LeadSearchPlan, PeopleMonth } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LeadPlanCard } from "./plan-card";
import { LeadPeoplePlanCard } from "./people-plan-card";
import type { FinderMore, FinderProposal, FinderStage, LeadSearchCardPayload } from "./types";

interface PlanPanelProps {
  open: boolean;
  /** A phone's sheet: pickers are its steps (plan-card.tsx). */
  asSteps?: boolean;
  stage: FinderStage;
  words: string;
  proposal: FinderProposal | null;
  plan?: LeadSearchPlan | null;
  facts?: LeadPlanFacts | null;
  refusal: string | null;
  busy: boolean;
  trace: string | null;
  pick?: string | null;
  answering: FinderMore | null;
  onWords: (words: string) => void;
  onAnswer: (words: string) => unknown;
  onChangePlan?: (plan: LeadSearchPlan) => void;
  onApprove: (plan: LeadSearchPlan) => unknown;
  onBack: () => void;
  onClose: () => void;
  onPick?: (pick: string | null) => void;
  /** A people idea's plan (decision 0070), drawn as its own card in the places plan's place, and the month it reads. */
  people?: LeadPeoplePlan | null;
  month?: PeopleMonth | null;
  onApprovePeople?: (plan: LeadPeoplePlan) => unknown;
}

/** The answer row: the words, the trace line while Claude reads, Send my answer, and Close. */
const answerRow = (p: PlanPanelProps, composing: boolean, thinking: boolean) => {
  const typed = !!(p.words || "").trim();
  return (
    <div className={`lf-compose${thinking ? " thinking" : ""}`}>
      <input
        className="lf-input"
        type="text"
        value={p.words || ""}
        maxLength={400}
        placeholder="Tell Claude what you meant"
        aria-label="Tell Claude what you meant"
        data-testid="plan-answer-input"
        disabled={!composing}
        onChange={(e) => p.onWords(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && composing && !p.busy && typed) {
            e.preventDefault();
            p.onAnswer(p.words);
          }
        }}
      />
      {thinking ? (
        <span className="lf-think" role="status" data-testid="plan-thinking">
          {p.trace || "Reading what you asked"}
        </span>
      ) : null}
      {composing ? (
        <button
          type="button"
          className="btn btn-primary btn-sm lf-go"
          data-testid="plan-answer-send"
          disabled={!!p.busy || !typed}
          onClick={() => p.onAnswer(p.words)}
        >
          Send my answer
        </button>
      ) : null}
      <button
        type="button"
        className="lf-close"
        aria-label="Close"
        title="Close"
        data-testid="plan-close"
        onClick={p.onClose}
      >
        <Icon name="x" size={12} />
      </button>
      {thinking ? <span className="lf-sweep" aria-hidden="true" /> : null}
    </div>
  );
};

/** The card the plan is drawn in, while there is one: a people idea's own (people-plan-card.tsx), else the places plan's. */
const planCardOf = (props: PlanPanelProps) => {
  const { stage, proposal, plan = null, facts = null, refusal, busy, pick = null, answering } = props;
  const { onChangePlan = () => undefined, onApprove, onBack, onPick = () => undefined } = props;
  const { people = null, month = null, onApprovePeople = () => undefined } = props;
  const card: LeadSearchCardPayload = proposal && proposal.payload ? proposal.payload : {};
  const shown = plan || card.plan || null;
  const starting = stage === "starting" || !!busy;
  if (people)
    return (
      <LeadPeoplePlanCard
        plan={people}
        month={month}
        busy={starting}
        refusal={refusal}
        asSteps={!!props.asSteps}
        onApprove={onApprovePeople}
        onBack={onBack}
      />
    );
  if (!shown) return null;
  return (
    <LeadPlanCard
      plan={shown}
      view={card.view || null}
      facts={card.facts || facts || null}
      baseVersion={(card.plan && card.plan.version) || 1}
      busy={starting}
      refusal={refusal}
      pick={pick}
      onPick={onPick}
      onChange={onChangePlan}
      onApprove={onApprove}
      onBack={onBack}
      answering={answering}
      asSteps={!!props.asSteps}
    />
  );
};

export const LeadPlanPanel = (props: PlanPanelProps) => {
  const { open, stage, refusal, answering } = props;
  if (!open) return null;
  const composing = stage === "compose" && !!answering;
  const thinking = stage === "thinking";
  const planning = stage === "plan" || stage === "starting";
  return (
    <div
      className="lf-panel pl-plan"
      role="dialog"
      aria-label={answering ? "Change the search" : "The plan"}
      data-testid="lead-plan-panel"
    >
      {composing && answering ? (
        <p className="lf-answering" data-testid="plan-answering">
          {answering.question}
        </p>
      ) : null}
      {composing || thinking ? answerRow(props, composing, thinking) : null}
      {composing && refusal ? (
        <p className="lf-said" role="status" data-testid="plan-refusal">
          {refusal}
        </p>
      ) : null}
      {planning ? planCardOf(props) : null}
    </div>
  );
};
