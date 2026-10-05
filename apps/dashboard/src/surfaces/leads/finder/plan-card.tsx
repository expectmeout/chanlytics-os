/**
 * The plan card (moved from legacy/pages/leads-finder.jsx, decision 0015): the plan as one sentence whose words are
 * pickers, what it leaves out, how many are likely to have an email, the facts in leads, and the two buttons (sections 8.3,
 * 0.1, 0.2). A picked word re-plans here, on the page, through planVersionOf and planWords: no model call, ever.
 */
import {
  LEAD_COUNT_CHOICES,
  leadPlanAsk,
  leadPlanFacts,
  leadPlanLikely,
  planCeiling,
  planMinutes,
  planVersionOf,
  planWhere,
  planWords,
  type LeadPlanFacts,
  type LeadSearchPlan,
} from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LeadPick, type PickOption } from "./pick";
import type { FinderMore } from "./types";

type PlanPatch = Parameters<typeof planVersionOf>[1];

const NO_FACTS: LeadPlanFacts = {
  dupes: 0,
  leadsLeft: 0,
  bound: null,
  prior: null,
  priorOf: null,
  cannotSee: null,
  renewsOn: "",
  nearby: [],
};

/** What each picker offers: how many, where, what to find, and a criterion's one choice, whether it stays. */
function planOptions(
  id: string,
  plan: LeadSearchPlan,
  f: LeadPlanFacts,
  change: (over: PlanPatch) => void,
): PickOption[] {
  if (id === "count") {
    const choices: readonly number[] = LEAD_COUNT_CHOICES || [50, 100, 200, 500];
    const counts = choices.includes(plan.count) ? [...choices] : [...choices, plan.count].sort((a, b) => a - b);
    // A count one area cannot hold says so, rather than quoting a time it will not take: five real searches all ended
    // "few new matches" short of 50, because three terms return the same places.
    return counts.map((n) => ({
      id: String(n),
      label: String(n),
      note:
        planCeiling && n > planCeiling(plan)
          ? "more than this area likely holds"
          : `about ${planMinutes({ ...plan, count: n })} min`,
      on: n === plan.count,
      apply: () => change({ count: n }),
    }));
  }
  if (id === "area") {
    return [plan.area, ...(f.nearby || [])].map((a) => ({
      id: a.label,
      label: planWhere(a),
      on: a.label === plan.area.label,
      apply: () => change({ area: a }),
    }));
  }
  if (id === "contact") {
    return [
      // Which way to reach them comes first (decision 0010): either one checked makes a lead count.
      {
        id: "email",
        label: "reached by a checked email or a phone",
        on: plan.contact === "email",
        apply: () => change({ contact: "email" }),
      },
      {
        id: "phone",
        label: "reached by phone or a checked email",
        on: plan.contact === "phone",
        apply: () => change({ contact: "phone" }),
      },
    ];
  }
  if (id === "who") return [];
  const c = plan.criteria.filter((x) => x.key === id)[0];
  if (!c) return [];
  // How sure a criterion has to be is the planner's call (it knows what a listing can show); the owner's choice on one is
  // whether it stays. Rewording it is "Change what I asked".
  return [
    {
      id: "drop",
      label: "Take it out of the plan",
      apply: () => change({ criteria: plan.criteria.filter((x) => x.key !== c.key) }),
    },
  ];
}

const PICK_TITLES: Record<string, string> = {
  count: "Change how many",
  who: "Change who you want",
  area: "Change where to look",
  contact: "Change what to find",
};

/** The sentence, a picker for each word that picks. */
function planSentenceOf(
  plan: LeadSearchPlan,
  f: LeadPlanFacts,
  a: {
    pick: string | null;
    onPick: (pick: string | null) => void;
    change: (over: PlanPatch) => void;
    answering: FinderMore | null;
  },
) {
  return planWords(plan).map((w, i) => {
    if (!w.pick || (a.answering && w.pick === "count")) return <span key={`w${i}`}>{w.text}</span>;
    const id = (w.pick === "criterion" ? w.key : w.pick === "where" ? "area" : w.pick) ?? "";
    return (
      <LeadPick
        key={`w${i}`}
        id={id}
        cls={w.pick === "count" ? "num" : ""}
        label={w.text}
        title={PICK_TITLES[id] || "Keep or take out"}
        open={a.pick === id}
        options={planOptions(id, plan, f, a.change)}
        onOpen={a.onPick}
        onPick={(o) => o.apply()}
      />
    );
  });
}

/** The listing cannot show a criterion asked for as seen: the two ways on, and nothing spent. */
const cannotSeeRow = (
  cannot: NonNullable<LeadPlanFacts["cannotSee"]>,
  plan: LeadSearchPlan,
  change: (over: PlanPatch) => void,
) => (
  <div className="lf-cannot" role="status" data-testid="plan-cannot-see">
    <Icon name="dashring" size={13} />
    <span>A listing doesn't show that, so "{cannot.text}" can't be confirmed. Nothing has been spent.</span>
    <button
      type="button"
      className="btn btn-sm"
      data-testid="plan-take-likely"
      onClick={() =>
        change({
          criteria: plan.criteria.map((x) =>
            x.key === cannot.key ? { ...x, standard: "likely", text: cannot.likely } : x,
          ),
        })
      }
    >
      {cannot.likely}
    </button>
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      data-testid="plan-drop-unseen"
      onClick={() => change({ criteria: plan.criteria.filter((x) => x.key !== cannot.key) })}
    >
      Take it out
    </button>
  </div>
);

/** What the plan leaves out, each a chip that keeps it. */
const leavingRow = (plan: LeadSearchPlan, change: (over: PlanPatch) => void) => (
  <div className="lf-leaving" data-testid="plan-leaving">
    <span>Leaving out</span>
    {plan.exclusions.map((e) => (
      <span key={e.key} className="tok-x" data-testid={`plan-leaving-${e.key}`}>
        {e.text}
        <button
          type="button"
          aria-label={`Keep ${e.text}`}
          title="Don't leave these out"
          onClick={() => change({ exclusions: plan.exclusions.filter((x) => x.key !== e.key) })}
        >
          <Icon name="x" size={11} />
        </button>
      </span>
    ))}
  </div>
);

interface PlanCardProps {
  plan: LeadSearchPlan | null;
  view: { title?: string } | null;
  facts: LeadPlanFacts | null;
  busy: boolean;
  refusal: string | null;
  baseVersion?: number;
  pick?: string | null;
  onPick?: (pick: string | null) => void;
  onChange: (plan: LeadSearchPlan) => void;
  onApprove: (plan: LeadSearchPlan) => void;
  onBack: () => void;
  answering?: FinderMore | null;
}

export const LeadPlanCard = ({
  plan,
  view,
  facts,
  busy,
  refusal,
  baseVersion = 1,
  pick = null,
  onPick = () => undefined,
  onChange,
  onApprove,
  onBack,
  answering = null,
}: PlanCardProps) => {
  if (!plan) return null;
  const f = facts || NO_FACTS;
  const change = (over: PlanPatch) => onChange(planVersionOf(plan, over));
  const likely = leadPlanLikely(plan, f);
  // An answer spends from the round's own reservation: its count is the one reserved, and the month's clamp is not this
  // round's to apply (nothing new is reserved).
  const ask = answering ? { count: plan.count, label: "Update the search", covers: null } : leadPlanAsk(plan, f);
  const cannot =
    f.cannotSee && plan.criteria.some((c) => c.key === f.cannotSee?.key && c.standard === "seen") ? f.cannotSee : null;
  return (
    <div className="lf-plan" data-testid="lead-plan">
      <p className="lf-sentence" data-testid="plan-sentence">
        {planSentenceOf(plan, f, { pick, onPick, change, answering })}
      </p>
      {plan.version > baseVersion ? (
        <span className="lf-changed" data-testid="plan-changed">
          changed
        </span>
      ) : null}
      {cannot ? cannotSeeRow(cannot, plan, change) : null}
      {plan.exclusions.length ? leavingRow(plan, change) : null}
      <div className="lf-likely" data-testid="plan-likely">
        {likely.emailPct === null ? null : (
          <span className="bar" aria-hidden="true">
            <span className="b-email" style={{ width: `${likely.emailPct}%` }} />
            <span className="b-phone" style={{ width: `${likely.phonePct}%` }} />
          </span>
        )}
        <span>{likely.line}</span>
      </div>
      <div className="lf-facts" data-testid="plan-facts">
        {leadPlanFacts(plan, f).map((t, i) => (
          <span key={t} className="lf-fact">
            <Icon name={["clock", "users", "shield"][i] || "shield"} size={13} />
            {t}
          </span>
        ))}
      </div>
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
        <button
          type="button"
          className="btn btn-primary btn-lg"
          data-testid="plan-approve"
          disabled={!!busy || !!cannot || ask.count < 1}
          onClick={() => onApprove(ask.count === plan.count ? plan : planVersionOf(plan, { count: ask.count }))}
        >
          {busy ? "Starting…" : ask.label}
        </button>
        <button type="button" className="btn btn-ghost" data-testid="plan-back" onClick={onBack}>
          Change what I asked
        </button>
        {view && view.title && !answering ? (
          <span className="lf-said" data-testid="plan-title">
            {view.title}
          </span>
        ) : null}
      </div>
    </div>
  );
};
