/* global React, Icon */
// Inbox right rail — perfectionist refinement.
// Replaces the old duplicate "Recent reasoning" feed with high-leverage content:
//   1. Agent identity + tone chip (so operator knows what voice the agent uses)
//   2. Sources scanned (NEW — what's in agent's HEAD that didn't make timeline)
//   3. Quick stats (LTV at stake, decision confidence, similar cases)
//   4. Ask the agent — composer back to the agent ("Why did you draft this?")
//   5. Train the agent — single segmented control replacing 3 flat buttons

const POL_MODE_HINT = {
  Auto: "Agent sends without asking.",
  Veto: "Agent sends after a short countdown you can stop.",
  Ask: "Agent drafts and waits for you.",
  Never: "Agent escalates without drafting — no reply written.",
};

const InboxAgentRail = ({ thread }) => {
  // Hooks first, unconditionally. The early return used to sit above these
  // four, so React saw a different hook count whenever `thread` went from a
  // selection to none — the classic way state ends up attached to the wrong
  // component. None of them reads `thread`, so the guard simply moves below.
  const [askText, setAskText] = React.useState("");
  const [askLog, setAskLog] = React.useState([]);
  const [toastNode, ppFlash] = window.usePPToast();
  const [, polTick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("policy:changed", polTick);
    return () => window.removeEventListener("policy:changed", polTick);
  }, []);
  if (!thread) return null;

  const agentId = window.CHANLY.agentIdFor(thread.agent.name);

  // The class this decision belongs to — the SAME class the card chips. One
  // control, one source: this edits the workspace policy row directly.
  const polCls = (thread.approval && thread.approval.policyClass) || (thread.veto && thread.veto.policyClass) || null;
  const polRow = polCls ? window.POLICY.row(polCls) : null;

  const setPolicy = (mode) => {
    if (!polRow || polRow.locked || !window.canDo("autonomy")) return;
    const prev = window.POLICY.modeOf(polCls);
    if (prev === mode) return;
    window.POLICY.set(polCls, mode);
    ppFlash({
      msg: <><b>{polRow.chip} decisions</b> set to {mode} — every agent follows this now.</>,
      undo: () => window.POLICY.set(polCls, prev),
    });
  };

  const askSend = (q) => {
    const question = (q || askText).trim();
    if (!question) return;
    const ev = thread.approval?.evidence || [];
    const cites = ev.slice(0, 2).map((e) => e.label).join(" and ");
    const answer = ev.length > 0
      ? `I checked ${cites}. ${thread.approval.summary} My call stands unless you loosen that guardrail in Autonomy.`
      : `I handled it per my playbook — ${thread.agent.autonomy.toLowerCase()}. Full reasoning is on my Fleet page.`;
    setAskLog((l) => [...l, { q: question, a: answer }]);
    setAskText("");
  };

  return (
    <aside className="ix-agent-rail">
      <header className="ix-rail-head">
        <span className="ix-rail-eyebrow">Agent context</span>
        <MoreMenu btnClass="btn btn-icon btn-sm" items={[
          { header: "Agent context" },
          { label: "Open agent", icon: "arrow-right", onClick: () => window.CHANLY.nav(window.CHANLY.R.agent(agentId)) },
          { label: "Why this call?", icon: "sparkle", onClick: () => window.askAbout({ prompt: "Why did the agent make this call?", answer: "It weighed the client's history, your policies, and the likely outcomes. The full reasoning trail lives on the agent's Fleet page.", links: [{ label: "Open Fleet", to: "fleet" }] }) },
          { label: "Report bad reasoning", icon: "flag", onClick: () => window.askAbout({ mode: "compose", prompt: "This reasoning was off because " }) },
        ]} />
      </header>

      {/* Agent identity card with tone chip */}
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
            <span className="ix-rail-tone-text">{thread.agent.tone || (window.CHANLY.agentByName(thread.agent.name) || {}).tone}</span>
          </div>
        )}
      </section>

      {/* Sources scanned — UNIQUE value, not in timeline */}
      {thread.approval?.evidence && thread.approval.evidence.length > 0 && (
        <section className="ix-rail-section">
          <div className="ix-rail-label">Sources scanned</div>
          <ul className="ix-sources">
            {thread.approval.evidence.map((e, i) => (
              <li key={i} className="ix-source">
                <span className={`ix-source-kind kind-${e.kind}`}>{e.kind}</span>
                <span className="ix-source-label">{e.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* What was considered & rejected */}
      {thread.approval?.alternatives && thread.approval.alternatives.length > 0 && (
        <section className="ix-rail-section">
          <div className="ix-rail-label">Also considered</div>
          <ul className="ix-considered">
            {thread.approval.alternatives.map((a, i) => (
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
      )}

      {/* Quick stats */}
      {(thread.confidence !== undefined || thread.value > 0) && (
        <section className="ix-rail-section">
          <div className="ix-rail-stats">
            {thread.confidence !== undefined && (
              <div className="ix-stat">
                <div className="ix-stat-label">Confidence</div>
                <div className="ix-stat-value tabular">{Math.round(thread.confidence * 100)}%</div>
              </div>
            )}
            {thread.value > 0 && (
              <div className="ix-stat">
                <div className="ix-stat-label">LTV at stake</div>
                <div className="ix-stat-value tabular">${thread.value.toLocaleString()}</div>
              </div>
            )}
            <div className="ix-stat">
              <div className="ix-stat-label">Similar cases</div>
              <div className="ix-stat-value tabular">{thread.approval?.evidence?.filter(e => e.kind === "case").length ?? 0}</div>
            </div>
          </div>
        </section>
      )}

      {/* Ask the agent — direct chat with the agent's reasoning */}
      <section className="ix-rail-section ix-ask-section">
        <div className="ix-rail-label">Ask {thread.agent.name}</div>
        <div className="ix-ask">
          {askLog.length > 0 && (
            <div className="ix-ask-log">
              {askLog.map((x, i) => (
                <div key={i} className="ix-ask-qa">
                  <div className="ix-ask-q">{x.q}</div>
                  <div className="ix-ask-a">
                    <span className="agent-avatar" style={{ width: 14, height: 14, fontSize: 8 }}>{thread.agent.glyph}</span>
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
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askSend(); } }}
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

      {/* For decisions like this — edits the ONE workspace policy row this class maps to */}
      {polRow && (
        <section className="ix-rail-section">
          <div className="ix-rail-label">For {polRow.chip.toLowerCase()} decisions like this</div>
          {polRow.locked ? (
            <div className="ix-pol-locked">
              <Icon name="shield" size={13} />
              <div>
                <b>Owner-only — {polRow.chip}.</b> Agents never decide money; the plan {polRow.note}.
                <button className="ix-pol-link" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("autonomy"))}>Autonomy charter <Icon name="arrow-right" size={9} /></button>
              </div>
            </div>
          ) : (
            <>
              <div className="ix-autonomy-seg ix-pol-seg">
                {window.POLICY.MODES.map((m) => (
                  <button
                    key={m}
                    className={`ix-aut-seg ${window.POLICY.modeOf(polCls) === m ? "active" : ""}`}
                    onClick={() => setPolicy(m)}
                    {...window.gate("autonomy")}
                  >
                    <span>{m}</span>
                  </button>
                ))}
              </div>
              <div className="ix-aut-hint">
                {POL_MODE_HINT[window.POLICY.modeOf(polCls)]}{" · "}
                <button className="ix-pol-link" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("autonomy"))}>full matrix</button>
              </div>
            </>
          )}
        </section>
      )}
      {toastNode}
    </aside>
  );
};

window.InboxAgentRail = InboxAgentRail;
