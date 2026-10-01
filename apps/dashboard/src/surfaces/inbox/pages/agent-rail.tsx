/**
 * Inbox right rail — perfectionist refinement (moved from pages/inbox-rail.jsx, decision 0015, step 3). The mockup's:
 * it is drawn for a seeded thread only (inbox-page.tsx).
 * Replaces the old duplicate "Recent reasoning" feed with high-leverage content:
 *   1. Agent identity + tone chip (so operator knows what voice the agent uses)
 *   2. Sources scanned (NEW — what's in agent's HEAD that didn't make timeline)
 *   3. Quick stats (LTV at stake, decision confidence, similar cases)
 *   4. Ask the agent — composer back to the agent ("Why did you draft this?")
 *   5. Train the agent — single segmented control replacing 3 flat buttons
 */
import { useEffect, useReducer, useState } from "react";
import { askAbout } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { ROUTES } from "../constants";
import { agentByName, agentIdFor, canDo, gate, navigate, policy, useToast, type PolicyRow } from "../shell";
import type { SeededThread } from "../types";

const POL_MODE_HINT: Record<string, string> = {
  Auto: "Agent sends without asking.",
  Veto: "Agent sends after a short countdown you can stop.",
  Ask: "Agent drafts and waits for you.",
  Never: "Agent escalates without drafting — no reply written.",
};

/** One question put to the agent, and what it said. */
interface AskedOfAgent {
  q: string;
  a: string;
}

/** What the rail asks Ask: the demo's seed palette also takes a canned `answer` and `links` (legacy CLAUDE.md, "Window contracts"). */
interface RailAsk {
  prompt?: string;
  mode?: string;
  answer?: string;
  links?: Array<{ label: string; to: string }>;
}
const ask: (about: RailAsk) => void = askAbout;

/** The workspace policy the rail edits directly, as the shell holds it. */
type Policy = NonNullable<ReturnType<typeof policy>>;

/** What the agent says to a question: the evidence it checked, or the playbook it followed. */
function agentAnswer(thread: SeededThread): string {
  const approval = thread.approval;
  const ev = approval?.evidence || [];
  const cites = ev
    .slice(0, 2)
    .map((e) => e.label)
    .join(" and ");
  // A seeded agent always carries its autonomy (the mockup's roster): the rail is drawn for no other.
  const autonomy = thread.agent.autonomy as string;
  return approval && ev.length > 0
    ? `I checked ${cites}. ${approval.summary} My call stands unless you loosen that guardrail in Autonomy.`
    : `I handled it per my playbook — ${autonomy.toLowerCase()}. Full reasoning is on my Fleet page.`;
}

/** The head: the eyebrow, and the menu to the agent and to a word about its reasoning. */
function railHead(agentId: string) {
  return (
    <header className="ix-rail-head">
      <span className="ix-rail-eyebrow">Agent context</span>
      <MoreMenu
        btnClass="btn btn-icon btn-sm"
        items={[
          { header: "Agent context" },
          { label: "Open agent", icon: "arrow-right", onClick: () => navigate(ROUTES.agent(agentId)) },
          {
            label: "Why this call?",
            icon: "sparkle",
            onClick: () =>
              ask({
                prompt: "Why did the agent make this call?",
                answer:
                  "It weighed the client's history, your policies, and the likely outcomes. The full reasoning trail lives on the agent's Fleet page.",
                links: [{ label: "Open Fleet", to: "fleet" }],
              }),
          },
          {
            label: "Report bad reasoning",
            icon: "flag",
            onClick: () => ask({ mode: "compose", prompt: "This reasoning was off because " }),
          },
        ]}
      />
    </header>
  );
}

/** Agent identity card with tone chip */
function agentCard(thread: SeededThread) {
  return (
    <section className="ix-rail-section">
      <div className="ix-rail-agent-card">
        <span className="agent-avatar active" style={{ width: 36, height: 36, fontSize: 14 }}>
          {thread.agent.glyph}
        </span>
        <div className="ix-rail-agent-body">
          <div className="ix-rail-agent-name">{thread.agent.name}</div>
          <div className="ix-rail-agent-autonomy">
            <Icon name="shield" size={10} />
            {thread.agent.autonomy}
          </div>
        </div>
      </div>
      {thread.agent.tone && (
        <div className="ix-rail-tone">
          <span className="ix-rail-tone-label">Voice</span>
          {/* tone falls back to the FLEET_ROSTER registry (one source of truth) */}
          <span className="ix-rail-tone-text">{thread.agent.tone || agentByName(thread.agent.name)?.tone}</span>
        </div>
      )}
    </section>
  );
}

/** Sources scanned — UNIQUE value, not in timeline */
function sourcesScanned(thread: SeededThread) {
  const approval = thread.approval;
  return (
    approval?.evidence &&
    approval.evidence.length > 0 && (
      <section className="ix-rail-section">
        <div className="ix-rail-label">Sources scanned</div>
        <ul className="ix-sources">
          {approval.evidence.map((e, i) => (
            <li key={i} className="ix-source">
              <span className={`ix-source-kind kind-${e.kind}`}>{e.kind}</span>
              <span className="ix-source-label">{e.label}</span>
            </li>
          ))}
        </ul>
      </section>
    )
  );
}

/** What was considered & rejected */
function alsoConsidered(thread: SeededThread) {
  const approval = thread.approval;
  return (
    approval?.alternatives &&
    approval.alternatives.length > 0 && (
      <section className="ix-rail-section">
        <div className="ix-rail-label">Also considered</div>
        <ul className="ix-considered">
          {approval.alternatives.map((a, i) => (
            <li key={i} className="ix-cons">
              <Icon name="x" size={9} />
              <div className="ix-cons-body">
                <div className="ix-cons-label">{a.label}</div>
                <div className="ix-cons-why">{a.why}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    )
  );
}

/** Quick stats */
function quickStats(thread: SeededThread) {
  const value = thread.value ?? 0;
  return (
    (thread.confidence !== undefined || value > 0) && (
      <section className="ix-rail-section">
        <div className="ix-rail-stats">
          {thread.confidence !== undefined && (
            <div className="ix-stat">
              <div className="ix-stat-label">Confidence</div>
              <div className="ix-stat-value tabular">{Math.round(thread.confidence * 100)}%</div>
            </div>
          )}
          {value > 0 && (
            <div className="ix-stat">
              <div className="ix-stat-label">LTV at stake</div>
              <div className="ix-stat-value tabular">${value.toLocaleString()}</div>
            </div>
          )}
          <div className="ix-stat">
            <div className="ix-stat-label">Similar cases</div>
            <div className="ix-stat-value tabular">
              {thread.approval?.evidence?.filter((e) => e.kind === "case").length ?? 0}
            </div>
          </div>
        </div>
      </section>
    )
  );
}

/** Ask the agent — direct chat with the agent's reasoning */
function askTheAgent(p: {
  thread: SeededThread;
  askLog: AskedOfAgent[];
  askText: string;
  setAskText: (v: string) => void;
  askSend: (q?: string) => void;
}) {
  const { thread, askLog, askText, setAskText, askSend } = p;
  return (
    <section className="ix-rail-section ix-ask-section">
      <div className="ix-rail-label">Ask {thread.agent.name}</div>
      <div className="ix-ask">
        {askLog.length > 0 && (
          <div className="ix-ask-log">
            {askLog.map((x, i) => (
              <div key={i} className="ix-ask-qa">
                <div className="ix-ask-q">{x.q}</div>
                <div className="ix-ask-a">
                  <span className="agent-avatar" style={{ width: 14, height: 14, fontSize: 8 }}>
                    {thread.agent.glyph}
                  </span>
                  <span>{x.a}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <textarea
          className="ix-ask-input"
          placeholder={`Why did you ${thread.approval ? "draft this" : "handle it this way"}?`}
          value={askText}
          onChange={(e) => setAskText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              askSend();
            }
          }}
          rows={2}
        />
        <div className="ix-ask-suggestions">
          <button className="ix-ask-chip" onClick={() => askSend("What policies did you check?")}>
            Policies?
          </button>
          <button className="ix-ask-chip" onClick={() => askSend("Show me similar past cases")}>
            Similar cases
          </button>
          <button className="ix-ask-chip" onClick={() => askSend("What if I want to be more generous?")}>
            More generous?
          </button>
        </div>
      </div>
    </section>
  );
}

/** A class of decision whose policy is Owner-only: the charter's lock, and the way to it. */
function policyLocked(row: PolicyRow) {
  return (
    <div className="ix-pol-locked">
      <Icon name="shield" size={13} />
      <div>
        <b>Owner-only — {row.chip}.</b> Agents never decide money; the plan {row.note}.
        <button className="ix-pol-link" onClick={() => navigate(ROUTES.admin("autonomy"))}>
          Autonomy charter <Icon name="arrow-right" size={9} />
        </button>
      </div>
    </div>
  );
}

/** The modes a class of decision can be set to, and what the one it is on does. */
function policyModes(p: { pol: Policy; polCls: string; setPolicy: (mode: string) => void }) {
  const { pol, polCls, setPolicy } = p;
  return (
    <>
      <div className="ix-autonomy-seg ix-pol-seg">
        {pol.MODES.map((m) => (
          <button
            key={m}
            className={`ix-aut-seg ${pol.modeOf(polCls) === m ? "active" : ""}`}
            onClick={() => setPolicy(m)}
            {...gate("autonomy")}
          >
            <span>{m}</span>
          </button>
        ))}
      </div>
      <div className="ix-aut-hint">
        {POL_MODE_HINT[String(pol.modeOf(polCls))]}
        {" · "}
        <button className="ix-pol-link" onClick={() => navigate(ROUTES.admin("autonomy"))}>
          full matrix
        </button>
      </div>
    </>
  );
}

/** For decisions like this — edits the ONE workspace policy row this class maps to */
function policySection(p: {
  pol: Policy | undefined;
  polCls: string | null;
  polRow: PolicyRow | null;
  setPolicy: (mode: string) => void;
}) {
  const { pol, polCls, polRow, setPolicy } = p;
  return (
    polRow &&
    pol &&
    polCls && (
      <section className="ix-rail-section">
        <div className="ix-rail-label">For {polRow.chip.toLowerCase()} decisions like this</div>
        {polRow.locked ? policyLocked(polRow) : policyModes({ pol, polCls, setPolicy })}
      </section>
    )
  );
}

export const InboxAgentRail = ({ thread }: { thread: SeededThread | null }) => {
  // Hooks first, unconditionally. The early return used to sit above these
  // four, so React saw a different hook count whenever `thread` went from a
  // selection to none — the classic way state ends up attached to the wrong
  // component. None of them reads `thread`, so the guard simply moves below.
  const [askText, setAskText] = useState("");
  const [askLog, setAskLog] = useState<AskedOfAgent[]>([]);
  const [toastNode, ppFlash] = useToast();
  const [, polTick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener("policy:changed", polTick);
    return () => window.removeEventListener("policy:changed", polTick);
  }, []);
  if (!thread) return null;

  const agentId = agentIdFor(thread.agent.name);

  // The class this decision belongs to — the SAME class the card chips. One
  // control, one source: this edits the workspace policy row directly.
  const polCls = (thread.approval && thread.approval.policyClass) || (thread.veto && thread.veto.policyClass) || null;
  const pol = policy();
  const polRow = polCls && pol ? pol.row(polCls) : null;

  const setPolicy = (mode: string) => {
    if (!polRow || !pol || !polCls || polRow.locked || !canDo("autonomy")) return;
    const prev = pol.modeOf(polCls);
    if (prev === mode) return;
    pol.set(polCls, mode);
    ppFlash({
      msg: (
        <>
          <b>{polRow.chip} decisions</b> set to {mode} — every agent follows this now.
        </>
      ),
      undo: () => {
        if (prev !== null) pol.set(polCls, prev);
      },
    });
  };

  const askSend = (q?: string) => {
    const question = (q || askText).trim();
    if (!question) return;
    const answer = agentAnswer(thread);
    setAskLog((l) => [...l, { q: question, a: answer }]);
    setAskText("");
  };

  return (
    <aside className="ix-agent-rail">
      {railHead(agentId)}
      {agentCard(thread)}
      {sourcesScanned(thread)}
      {alsoConsidered(thread)}
      {quickStats(thread)}
      {askTheAgent({ thread, askLog, askText, setAskText, askSend })}
      {policySection({ pol, polCls, polRow, setPolicy })}
      {toastNode}
    </aside>
  );
};
