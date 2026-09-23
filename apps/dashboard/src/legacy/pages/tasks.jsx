/* global React, Icon, StatStrip, StatCell, TASKS_DATA */
// Chanlytics — Tasks ledger
// Pending → what needs you. Scheduled → what's coming. Done → what happened.
// Failed → the error, the retry, and what the agent learned from it.

const { useState: useTkState, useMemo: useTkMemo } = React;

const TK_FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "scheduled", label: "Scheduled" },
  { id: "running", label: "Running" },
  { id: "done", label: "Done" },
  { id: "failed", label: "Failed" },
];

const TkPill = ({ s }) =>
  s === "pending" ? <span className="pill pill-accent">Needs you</span>
  : s === "running" ? <span className="pill pill-accent"><span className="live-dot" style={{ width: 5, height: 5 }} />Running</span>
  : s === "scheduled" ? <span className="pill">Scheduled</span>
  : s === "failed" ? <span className="pill pill-danger">Failed</span>
  : <span className="pill pill-ok">Done</span>;

const TasksPage = () => {
  const { TASKS } = window.TASKS_DATA;
  const [filter, setFilter] = useTkState("all");
  const [openId, setOpenId] = useTkState("t-sms-fail");
  const [retried, setRetried] = useTkState({});   // taskId -> true (session)
  const [, setTick] = useTkState(0);
  const [toastNode, ppFlash] = window.usePPToast();

  // Re-render when a decision lands anywhere (Inbox or here) or an integration is fixed
  React.useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("inbox:decisions", bump);
    window.addEventListener("integrations:changed", bump);
    window.addEventListener("store:listing", bump);
    window.addEventListener("fleet:handoff", bump);
    return () => {
      window.removeEventListener("inbox:decisions", bump);
      window.removeEventListener("integrations:changed", bump);
      window.removeEventListener("store:listing", bump);
      window.removeEventListener("fleet:handoff", bump);
    };
  }, []);

  const decisions = (window.IX_STORE && window.IX_STORE.decisions) || {};

  // Overlay: thread-linked tasks reflect session decisions from the decide engine;
  // the deferred nurture releases the moment Gmail is reauthorized in Settings.
  const tasks = TASKS.map((t) => {
    if (t.id === "t-gmail-fail" && window.INT_STORE && window.INT_STORE.isFixed("gmail")) {
      return {
        ...t,
        status: "scheduled",
        result: "Releasing — Gmail reconnected.",
        error: null,
        retry: "Sends today · Gmail reconnected ✓",
        link: { label: "Connections", to: "admin/integrations" },
      };
    }
    const d = t.threadId && decisions[t.threadId];
    if (retried[t.id] && t.status === "failed") {
      return {
        ...t,
        status: "running",
        error: null,
        retry: null,
        result: `Retrying — attempt 2 dispatched just now. ${t.agentName} reports back here.`,
      };
    }
    if (t.id === "t-verdict-timer" && d && d.kind === "decided") {
      return { ...t, status: "done", when: d.at, decided: d,
        result: `Cancelled — you recorded “${d.action}” at ${d.at}; the timer never fired.` };
    }
    if (!d || t.status !== "pending") return t;
    if (d.kind === "snoozed") {
      return { ...t, status: "scheduled", when: d.wake || "tomorrow 10:00", decided: d,
        result: `Snoozed — wakes ${d.wake || "tomorrow 10:00"}. ${t.agentName} holds until then.` };
    }
    return { ...t, status: "done", when: d.at, decided: d,
      result: `You chose “${d.action}” at ${d.at} — ${t.agentName} is executing.` };
  });

  // Session listing reviews surface in the ledger — derived straight from
  // STORE_LISTINGS (single source), so status here always matches the Store.
  const listingTasks = (((window.STORE_DATA || {}).STORE_LISTINGS) || [])
    .filter(l => l.review)
    .map(l => {
      const total = l.review.length;
      const passed = l.review.filter(c => c.state === "ok" || c.state === "warn").length;
      const hadEdit = l.review.some(c => c.state === "warn");
      const base = { id: "t-lst-" + l.id, agent: "C", agentName: "Store review", target: l.name, when: "12:04 PM", noRetry: true };
      if (l.status === "submitted") return { ...base, status: "running", task: "Listing review — 5 checks",
        result: `Check ${Math.min(passed + 1, total)} of ${total} running · ${passed} passed.`,
        link: { label: "Watch in Store", to: "store" } };
      if (l.status === "rejected") return { ...base, status: "failed", task: "Listing review — 5 checks",
        result: `Stopped at the copy check — ${passed} of ${total} passed.`,
        error: l.rejectReason,
        retry: "Fix the copy in Studio and resubmit — review re-runs all 5 checks.",
        link: { label: "Fix in Studio", to: "studio" } };
      return { ...base, status: "done", task: "Listing review — passed",
        result: `All ${total} checks passed${hadEdit ? " · 1 copy edit" : ""} — live in the Store.`,
        link: { label: "Your listings", to: "store" } };
    });
  // Scripted handoffs from connected agents land as pending ledger rows
  const handoffTasks = ((window.AS_STORE && window.AS_STORE.handoffs()) || []).map(h => ({
    id: "t-ho-" + h.agentId, status: "pending", task: h.kind + " — handoff",
    agent: h.glyph, agentName: h.agentName, target: h.target, when: "12:05 PM",
    result: h.result + " Unmapped work always lands with you.",
    noRetry: true,
    link: { label: "Its card in Fleet", to: "fleet/" + h.agentId },
  }));
  const allTasks = [...listingTasks, ...handoffTasks, ...tasks];

  const counts = useTkMemo(() => {
    const m = { all: allTasks.length };
    TK_FILTERS.slice(1).forEach(f => { m[f.id] = allTasks.filter(t => t.status === f.id).length; });
    return m;
  }, [allTasks]);

  const visible = filter === "all" ? allTasks : allTasks.filter(t => t.status === filter);

  // Decide straight from the ledger — same store the Inbox uses
  const approveFromTask = (e, t) => {
    if (!window.canDo("approve")) return;
    e.stopPropagation();
    const thread = ((window.INBOX_DATA || {}).THREADS || []).find(x => x.id === t.threadId);
    const action = thread?.approval?.recommended || "Approve";
    if (window.IX_STORE) window.IX_STORE.set(t.threadId, { action, at: window.CHANLY.IX_NOW, kind: "decided" });
    setOpenId(t.id);
    ppFlash({ msg: `${action} — ${t.target}`, undo: () => { if (window.IX_STORE) window.IX_STORE.clear(t.threadId); } });
  };
  const retryNow = (e, t) => {
    if (!window.canDo("approve")) return;
    e.stopPropagation();
    setRetried(m => ({ ...m, [t.id]: true }));
    setOpenId(t.id);
    ppFlash({
      msg: <>Retrying <b>{t.task}</b> — attempt 2 dispatched</>,
      undo: () => setRetried(m => { const n = { ...m }; delete n[t.id]; return n; }),
    });
  };

  const doneBase = ((window.TASKS_DATA.TASKS_BASELINE || {}).completedToday ?? 41) + tasks.filter(t => t.decided && t.status === "done").length;
  // Rate shares the "Completed today" baseline — sums must agree (CLAUDE.md)
  const success = Math.round((doneBase / Math.max(1, doneBase + counts.failed)) * 100);
  const recovered = tasks.filter(t => (t.status === "scheduled" || t.status === "running") && (retried[t.id] || (t.id === "t-gmail-fail" && window.INT_STORE && window.INT_STORE.isFixed("gmail")))).length;

  return (
    <div className="reports">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Tasks</div>
          <div className="cl-page-sub">
            Every unit of agent work — what needs you, what's coming, what happened, and what each failure taught the fleet.
          </div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label="Pending on you" value={counts.pending} meta={counts.pending > 0 ? "decisions waiting" : "queue clear"} metaTone={counts.pending > 0 ? "neg" : "pos"} />
          <StatCell label="Completed today" value={doneBase} meta={`${allTasks.length} recent shown below`} />
          <StatCell label="Success rate" tip="Completed runs ÷ all agent runs · failed runs retry automatically" value={`${success}%`} meta={`${counts.failed} failed${recovered > 0 ? ` · ${recovered} recovering` : ""}`} metaTone={counts.failed > 0 ? "neg" : "pos"} />
        </StatStrip>
      </div>

      <div className="cl-controls">
        <div className="cl-controls-right" style={{ marginLeft: 0 }}>
          <div className="fleet-filter">
            {TK_FILTERS.map(f => (
              <button key={f.id} className={`fleet-filter-chip ${filter === f.id ? "active" : ""}`} onClick={() => setFilter(f.id)}>
                {f.label}
                <span className="fleet-filter-count tally">{counts[f.id]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rp-body">
        <section className="fl-card rp-agents">
          <table className="tbl">
            <thead>
              <tr><th>Task</th><th>Agent</th><th>Target</th><th>Status</th><th>When</th><th></th></tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={6}>
                  <div className="cl-table-empty">
                    <Icon name={filter === "failed" ? "check" : "search"} size={15} />
                    <span>
                      {filter === "pending" ? "Queue clear — decisions you make in the Inbox or Today land here."
                        : filter === "failed" ? "Nothing failed — recoveries and retries land here when they happen."
                        : filter === "running" ? "Nothing running this second — agents pick work up within a minute."
                        : filter === "scheduled" ? "Nothing scheduled — approved batches and playbook steps queue here."
                        : "Nothing here yet."}
                    </span>
                    <button className="cl-bucket-link" onClick={() => setFilter("all")}>Show all <Icon name="arrow-right" size={10} /></button>
                  </div>
                </td></tr>
              )}
              {visible.map(t => (
                <React.Fragment key={t.id}>
                  <tr className={t.status === "pending" ? "tk-pending" : undefined} style={{ cursor: "pointer" }} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                    <td style={{ fontWeight: 500 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{t.task}{t.policyClass && <PolicyChip cls={t.policyClass} />}</span></td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span className="agent-avatar" style={{ width: 18, height: 18, fontSize: 9 }}>{t.agent}</span>
                        <span className="muted">{t.agentName}</span>
                      </span>
                    </td>
                    <td className="muted">{t.target}</td>
                    <td><TkPill s={t.status} /></td>
                    <td className="dim num">{t.when}</td>
                    <td className="shrink">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {t.status === "pending" && t.threadId && (
                          <button className="btn btn-sm btn-primary" onClick={(e) => approveFromTask(e, t)} {...window.gate("approve")}>
                            <Icon name="check" size={11} /> Approve
                          </button>
                        )}
                        {t.status === "failed" && !t.noRetry && (
                          <button className="btn btn-sm" onClick={(e) => retryNow(e, t)} {...window.gate("approve")}>
                            <Icon name="refresh" size={11} /> Retry now
                          </button>
                        )}
                        {t.status === "failed" && t.noRetry && (
                          <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); window.CHANLY.nav("studio"); }}>
                            <Icon name="sparkle" size={11} /> Fix in Studio
                          </button>
                        )}
                        <Icon name={openId === t.id ? "chevron-up" : "chevron-down"} size={12} style={{ color: "var(--ink-faint)" }} />
                      </span>
                    </td>
                  </tr>
                  {openId === t.id && (
                    <tr className="tk-detail-row">
                      <td colSpan={6}>
                        <div className="tk-detail">
                          <div className="tk-detail-result">{t.result}</div>
                          {t.decided && (
                            <div className="tk-decided">
                              <Icon name="check" size={11} />
                              <span>Decided via the same engine as your Inbox — undo is available there.</span>
                              <button className="cl-bucket-link" onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(CHANLY.R.thread(t.threadId)); }}>
                                View thread <Icon name="arrow-right" size={10} />
                              </button>
                            </div>
                          )}
                          {t.error && (
                            <div className="tk-error">
                              <Icon name="alert" size={11} />
                              <span><strong>Error:</strong> {t.error}{t.retry && <> — <em>{t.retry}</em></>}</span>
                            </div>
                          )}
                          {t.learning && (
                            <button className="tk-learning" onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(CHANLY.R.admin("memory")); }}>
                              <Icon name="sparkle" size={11} />
                              <span>{t.learning}</span>
                              <Icon name="arrow-right" size={10} />
                            </button>
                          )}
                          {t.link && (
                            <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(t.link.to); }}>
                              {t.link.label} <Icon name="arrow-right" size={11} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div className="cl-table-foot">
            <span>Showing {allTasks.length} recent tasks</span>
            <span>Aggregates live in Reports</span>
          </div>
        </section>
      </div>

      {toastNode}
    </div>
  );
};

window.TasksPage = TasksPage;
