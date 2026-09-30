/**
 * The cards a seeded thread draws over its story (moved from pages/inbox-thread.jsx, decision 0015): the context strip,
 * the narrative summary, the approval card, the post-meeting verdict and the confidence meter. A real thread has none
 * of them: each fact was said again by its status line and its reply box.
 *
 * The approval card is a function per part, called by the card and not drawn as a component of its own, so the tree is
 * the tree it was.
 */
import { useState, type ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";
import { PolicyChip } from "../../kit/policy-chip/policy-chip";
import { confTone, fmtDelta, ROUTES } from "../constants";
import { gate, keyPress, navigate } from "../shell";
import type { Approval, Evidence, NextStep, Thread, Verdict, VerdictOption } from "../types";

/** What the decision row asks of a plan's parameter: the label picked. */
export interface DecideExtra {
  param?: string;
}

// =============== CONTEXT STRIP — a seeded thread's micro-facts under the header ===============
// A real thread has none: each fact was said again by its status line and its reply box, and "Paused — you have it"
// sat over a thread nobody had taken.
export const ContextStrip = ({ thread }: { thread: Thread }) => {
  if (!thread.contextStrip || thread.contextStrip.length === 0) return null;
  return (
    <div className="ix-context-strip">
      {thread.contextStrip.map((f, i) => {
        const Tag = f.to ? "button" : "div";
        const to = f.to;
        return (
          <Tag
            key={i}
            className={`ix-ctx ${f.warn ? "warn" : ""} ${f.info ? "info" : ""} ${f.to ? "linked" : ""}`}
            title={f.to ? "Open" : undefined}
            onClick={to ? () => navigate(to) : undefined}
          >
            <span className="ix-ctx-label">{f.label}</span>
            <span className="ix-ctx-value">
              {f.value}
              {f.to && <Icon name="arrow-right" size={8} />}
            </span>
          </Tag>
        );
      })}
    </div>
  );
};

// =============== NARRATIVE SUMMARY ===============
export const NarrativeSummary = ({ thread }: { thread: Thread }) => {
  // A real thread's banner says its one sentence; this said it again below it (I1). The mockup keeps its story.
  if (!thread.summary || thread.real) return null;
  return (
    <div className="ix-summary">
      <span className="ix-summary-eyebrow">{thread.real ? "Where this stands" : "The story so far"}</span>
      <span className="ix-summary-text">{thread.summary}</span>
    </div>
  );
};

// =============== APPROVAL CARD v2 ===============
type Expanded = "evidence" | "alternatives" | "next" | null;

interface ApprovalCardProps {
  thread: Thread;
  approval: Approval;
  onDecide?: (threadId: string, action: string, extra?: DecideExtra) => void;
  planParam?: number;
  onPlanParam?: (i: number) => void;
}

// Format $ delta with sign
const fmtLtv = (n: number | undefined) => (n === 0 || n === undefined ? null : fmtDelta(n) + " LTV");

/** Header — neutral framing, no coral fanfare. */
function approvalHead(thread: Thread, approval: Approval) {
  return (
    <div className="ix-approval-head">
      <div className="ix-approval-meta">
        <span className="ix-approval-kind">{approval.kind}</span>
        {approval.policyClass && <PolicyChip cls={approval.policyClass} className="ix-policy" />}
        <span className="ix-approval-summary">{approval.summary}</span>
      </div>
      <div className="ix-approval-conf">
        <span className="ix-approval-conf-label">Decision confidence</span>
        <ConfidenceMeter level={thread.confidence} />
      </div>
    </div>
  );
}

/** The plan's dollars, today and over a lifetime, each in the tone of its sign. */
function planImpact(plan: Approval["plan"]) {
  return (
    <div className="ix-outcome-impact">
      <div className="ix-outcome-impact-row">
        <span className="ix-outcome-impact-key">Today</span>
        <span
          className={`ix-outcome-impact-val tabular ${plan.dollarDelta < 0 ? "neg" : plan.dollarDelta > 0 ? "pos" : "neu"}`}
        >
          {fmtDelta(plan.dollarDelta)}
        </span>
      </div>
      <div className="ix-outcome-impact-row">
        <span className="ix-outcome-impact-key">LTV</span>
        <span className={`ix-outcome-impact-val tabular ${plan.ltv < 0 ? "neg" : plan.ltv > 0 ? "pos" : "neu"}`}>
          {fmtLtv(plan.ltv) || "—"}
        </span>
      </div>
    </div>
  );
}

/**
 * The plan — ONE deterministic action. Approve executes it; Decline runs the stated fallback. Nuance lives in the draft,
 * never in new verbs (closed set).
 */
function approvalPlan(props: ApprovalCardProps) {
  const { approval, planParam = 0, onPlanParam = () => {} } = props;
  const plan = approval.plan;
  return (
    <div className="ix-outcomes ix-one">
      <div className="ix-outcome recommended selected ix-plan">
        <span className="ix-outcome-rec-tag">Agent's plan</span>
        <div className="ix-outcome-action-line">
          <span className="ix-outcome-action">{plan.label}</span>
          {plan.confidence !== undefined && (
            <span className="ix-outcome-conf tabular">{Math.round(plan.confidence * 100)}%</span>
          )}
        </div>
        {planImpact(plan)}
        <div className="ix-outcome-oneliner">{plan.oneLine}</div>
        {plan.param && (
          <div className="cl-tabs ix-param">
            <span className="ix-param-label">{plan.param.label}</span>
            {plan.param.options.map((o, i) => (
              <button key={i} className={`cl-tab ${planParam === i ? "active" : ""}`} onClick={() => onPlanParam(i)}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        {approval.fallback && <div className="ix-outcome-fallback">If you decline: {approval.fallback}</div>}
      </div>
    </div>
  );
}

/** Expander row — Why / Alternatives / Next. */
function approvalExpanders(approval: Approval, expanded: Expanded, setExpanded: (e: Expanded) => void) {
  return (
    <div className="ix-approval-expanders">
      <ExpanderToggle
        open={expanded === "evidence"}
        onClick={() => setExpanded(expanded === "evidence" ? null : "evidence")}
        icon="search"
        label="Why this recommendation"
        count={approval.evidence?.length}
      />
      <ExpanderToggle
        open={expanded === "alternatives"}
        onClick={() => setExpanded(expanded === "alternatives" ? null : "alternatives")}
        icon="filter"
        label="What was considered"
        count={approval.alternatives?.length}
      />
      <ExpanderToggle
        open={expanded === "next"}
        onClick={() => setExpanded(expanded === "next" ? null : "next")}
        icon="arrow-right"
        label="What happens next"
        count={approval.nextSteps?.length}
      />
    </div>
  );
}

/** One piece of evidence: a door where it names a page. */
function evidenceRow(e: Evidence, i: number) {
  const to = e.to;
  return (
    <div
      key={i}
      className={`ix-evid ${e.to ? "linked" : ""}`}
      onClick={to ? () => navigate(to) : undefined}
      onKeyDown={to ? keyPress(() => navigate(to)) : undefined}
      role={e.to ? "button" : undefined}
      tabIndex={e.to ? 0 : undefined}
    >
      <span className={`ix-evid-kind kind-${e.kind}`}>{e.kind}</span>
      <div className="ix-evid-body">
        <div className="ix-evid-label">
          {e.label}
          {e.to && <Icon name="arrow-right" size={9} style={{ marginLeft: 5, color: "var(--ink-faint)" }} />}
        </div>
        <div className="ix-evid-detail">{e.detail}</div>
      </div>
    </div>
  );
}

/** One step the agent will take, and whether it does it alone. */
function nextStepRow(s: NextStep, i: number) {
  return (
    <div key={i} className="ix-next-step">
      <span className={`ix-next-mark ${s.auto ? "auto" : "manual"}`}>
        {s.auto ? <Icon name="check" size={10} /> : <Icon name="agents" size={10} />}
      </span>
      <div className="ix-next-body">
        <div className="ix-next-label">{s.label}</div>
        {s.hint && <div className="ix-next-hint">{s.hint}</div>}
      </div>
      <span className={`ix-next-tag ${s.auto ? "auto" : "manual"}`}>{s.auto ? "auto" : "next"}</span>
    </div>
  );
}

/** The panel the open expander shows, or nothing. Three of its children are the card's, each drawn only while its toggle is open. */
function approvalPanels(thread: Thread, approval: Approval, expanded: Expanded): ReactNode[] {
  return [
    expanded === "evidence" && (
      <ExpanderPanel>
        <div className="ix-approval-evidence">{approval.evidence?.map((e, i) => evidenceRow(e, i))}</div>
      </ExpanderPanel>
    ),
    expanded === "alternatives" && (
      <ExpanderPanel>
        <div className="ix-approval-alts">
          {approval.alternatives?.map((a, i) => (
            <div key={i} className="ix-alt">
              <Icon name="x" size={11} />
              <div className="ix-alt-body">
                <div className="ix-alt-label">{a.label}</div>
                <div className="ix-alt-why">{a.why}</div>
              </div>
            </div>
          ))}
        </div>
      </ExpanderPanel>
    ),
    expanded === "next" && (
      <ExpanderPanel>
        <div className="ix-approval-next">
          <div className="ix-next-title">
            If you {approval.recommended.toLowerCase()}, {thread.agent.name} will:
          </div>
          {approval.nextSteps?.map((s, i) => nextStepRow(s, i))}
        </div>
      </ExpanderPanel>
    ),
  ];
}

/** Footer — decide row + agent attribution. A, D and E still decide (the ? sheet lists them). */
function approvalFoot(props: ApprovalCardProps) {
  const { thread, approval, onDecide = () => {}, planParam = 0 } = props;
  const plan = approval.plan;
  return (
    <div className="ix-approval-foot">
      <div className="ix-approval-decide">
        <button
          className="btn btn-primary btn-sm"
          onClick={() =>
            onDecide(thread.id, "Approve", plan.param ? { param: plan.param.options[planParam]?.label } : {})
          }
          {...gate("approve")}
        >
          <Icon name="check" size={12} /> {plan.cta || "Approve"}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => window.dispatchEvent(new CustomEvent("inbox:focus-composer"))}
        >
          Edit reply
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onDecide(thread.id, "Decline")} {...gate("approve")}>
          Decline
        </button>
      </div>
      <span className="ix-approval-hint">
        <span>
          {thread.agent.name} · {thread.agent.autonomy}
        </span>
      </span>
    </div>
  );
}

export const ApprovalCard = (props: ApprovalCardProps) => {
  const [expanded, setExpanded] = useState<Expanded>(null); // 'evidence' | 'alternatives' | 'next' | null
  const { thread, approval } = props;
  const [evidence, alternatives, next] = approvalPanels(thread, approval, expanded);

  return (
    <div className="ix-approval">
      {approvalHead(thread, approval)}

      {approvalPlan(props)}

      {approvalExpanders(approval, expanded, setExpanded)}

      {evidence}

      {alternatives}

      {next}

      {approvalFoot(props)}
    </div>
  );
};

const ExpanderToggle = ({
  open,
  onClick,
  icon,
  label,
  count,
}: {
  open: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  count?: number;
}) => (
  <button className={`ix-exp-toggle ${open ? "open" : ""}`} onClick={onClick}>
    <Icon name={icon} size={11} />
    <span>{label}</span>
    {count !== undefined && <span className="ix-exp-count tabular">{count}</span>}
    <Icon name={open ? "chevron-up" : "chevron-down"} size={10} />
  </button>
);

const ExpanderPanel = ({ children }: { children?: ReactNode }) => <div className="ix-exp-panel">{children}</div>;

// =============== CONFIDENCE METER (linear) ===============
const ConfidenceMeter = ({ level }: { level: number | undefined }) => {
  // An unread level is NaN, as `undefined * 100` was: the bar, the words and the tone read it the same.
  const known = level ?? NaN;
  const pct = Math.round(known * 100);
  const tone = confTone(known);
  return (
    <div className={`conf-meter conf-${tone}`}>
      <div className="conf-meter-bar">
        <div className="conf-meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="conf-meter-label tabular">{pct}%</span>
    </div>
  );
};

// =============== VERDICT CARD — post-meeting, human-only (closed set) ===============
/** A seeded thread with its post-meeting verdict still to give. */
type VerdictThread = Thread & { verdict: Verdict };

/** Whether a thread holds a verdict: the card's guard, which the type follows. */
export const hasVerdict = (thread: Thread): thread is VerdictThread => !!thread.verdict;

export const VerdictCard = ({
  thread,
  onVerdict = () => {},
}: {
  thread: VerdictThread;
  onVerdict?: (threadId: string, option: VerdictOption) => void;
}) => {
  const v = thread.verdict;
  return (
    <div className="ix-approval ix-verdict">
      <div className="ix-approval-head">
        <div className="ix-approval-meta">
          <span className="ix-approval-kind">Meeting verdict</span>
          <span className="ix-approval-summary">Agents stood down at meeting start.</span>
        </div>
      </div>
      <div className="ix-verdict-opts">
        {v.options.map((o) => (
          <button key={o.verb} className="ix-verdict-opt" onClick={() => onVerdict(thread.id, o)} {...gate("approve")}>
            <Icon name={o.icon} size={14} />
            <span className="ix-verdict-label">{o.label}</span>
            <span className="ix-verdict-sub">{o.sub}</span>
          </button>
        ))}
      </div>
      <div className="ix-approval-foot">
        <span className="ix-approval-hint">Unanswered → Interested in 48h. Details editable later.</span>
        {v.apptId && (
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(ROUTES.appt(v.apptId ?? ""))}>
            On the calendar <Icon name="arrow-right" size={10} />
          </button>
        )}
      </div>
    </div>
  );
};
