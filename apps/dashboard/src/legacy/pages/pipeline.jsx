/* global React, Icon, StatStrip, StatCell, PIPELINE_DATA */
// Chanlytics — Pipeline
// Kanban with agent attribution: every deal shows who's working it and what
// happens next. Board / List toggle; cards deep-link to client profiles.
// Approval deals are wired to IX_STORE: deciding in Inbox/Today/Tasks moves the
// card's live state here, and deep-links land on the exact thread.

const { useState: usePipeState, useMemo: usePipeMemo, useEffect: usePipeEffect } = React;

const ppMoney = (n) => window.CHANLY.fmtMoney(n);

// Session-decision overlay for an approval deal
const ppDecisionFor = (d) =>
  d.threadId && window.IX_STORE ? window.IX_STORE.get(d.threadId) : null;

const ppOverlay = (d) => {
  const rec = ppDecisionFor(d);
  if (!rec || !d.approval) return d;
  if (rec.kind === "snoozed") {
    return { ...d, approval: false, snoozed: true, next: `Snoozed — wakes ${rec.wake || "tomorrow 10:00"}` };
  }
  const declined = rec.declined;
  return {
    ...d,
    approval: false,
    decided: rec,
    stage: declined ? d.stage : (d.stage === "qualified" ? "booked" : d.stage),
    next: declined
      ? `You declined at ${rec.at} — ${d.agent.name} sends a polite pass`
      : `You chose \u201c${rec.action}\u201d at ${rec.at} — ${d.agent.name} is executing`,
  };
};

// ---------- Deal card ----------
const DealCard = ({ d }) => {
  const openTarget = () => {
    if (d.live) { window.CHANLY.nav("live"); return; }
    if (d.threadId) { window.CHANLY.nav(window.CHANLY.R.thread(d.threadId)); return; }
    if (d.approval) { window.CHANLY.nav("inbox"); return; }
    if (d.clientId) { window.CHANLY.nav(window.CHANLY.R.client(d.clientId)); return; }
    window.appAsk && window.appAsk();
  };
  return (
    <div className={`pp-card ${d.approval ? "is-approval" : ""} ${d.decided ? "is-decided" : ""} ${d.snoozed ? "is-snoozed" : ""}`} role="button" tabIndex={0} onClick={openTarget} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTarget(); } }}>
      <div className="pp-card-top">
        <span className="pp-card-avatar">{d.initials.slice(0, 2)}</span>
        <span className="pp-card-who">{d.who}</span>
        <span className="pp-card-value tabular">{ppMoney(d.value)}</span>
      </div>
      <div className="pp-card-label">{d.label}</div>
      <div className={`pp-card-agent ${d.approval ? "approval" : d.live ? "live" : ""} ${d.decided ? "decided" : ""}`}>
        {d.snoozed
          ? <Icon name="clock" size={11} style={{ color: "var(--warn)", flexShrink: 0 }} />
          : d.decided
          ? <Icon name={d.decided.declined ? "x" : "check"} size={11} style={{ color: d.decided.declined ? "var(--ink-muted)" : "var(--ok)", flexShrink: 0 }} />
          : <span className="agent-avatar" style={{ width: 16, height: 16, fontSize: 9 }}>{d.agent.glyph}</span>}
        {(d.approval || d.live) && <span className="live-dot" style={{ width: 5, height: 5 }} />}
        <span className="pp-card-next">{d.next}</span>
      </div>
      <div className="pp-card-foot">
        <span>{d.source}</span>
        {d.leadId && (
          <button className="pp-card-lead chip" data-tip="Also in Leads — one person, tracked in both places · click to open the lead" onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(window.CHANLY.R.lead(d.leadId)); }}>
            <Icon name="bolt" size={9} /> in Leads
          </button>
        )}
        <span className="tabular">{d.inStage} in stage</span>
      </div>
    </div>
  );
};

// ---------- Board ----------
const PipelineBoard = ({ stages, deals, query, onClear }) => (
  <>
    {query && deals.length === 0 && (
      <div className="cv-empty">
        No deals match “{query}”.{" "}
        <button className="cl-bucket-link" onClick={onClear}>Clear search <Icon name="arrow-right" size={10} /></button>
      </div>
    )}
    <div className="pp-board">
    {stages.map(s => {
      const list = deals.filter(d => d.stage === s.id);
      const sum = list.reduce((a, d) => a + d.value, 0);
      return (
        <div key={s.id} className="pp-col">
          <div className="pp-col-head">
            <span className="pp-col-label">{s.label}</span>
            <span className="pp-col-count tabular">{list.length}</span>
            <span className="pp-col-sum tabular">{ppMoney(sum)}</span>
          </div>
          <div className="pp-col-cards">
            {list.map(d => <DealCard key={d.id} d={d} />)}
            {list.length === 0 && <div className="pp-col-empty">Nothing here</div>}
          </div>
        </div>
      );
    })}
    </div>
  </>
);

// ---------- List ----------
const PipelineList = ({ stages, deals, query, onClear }) => {
  const stageLabel = Object.fromEntries(stages.map(s => [s.id, s.label]));
  return (
    <div className="pp-list-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Deal</th><th>Client</th><th>Stage</th><th className="num">Value</th><th>Agent</th><th>Next</th>
          </tr>
        </thead>
        <tbody>
          {deals.length === 0 && (
            <tr><td colSpan={6}>
              <div className="cl-table-empty">
                <Icon name="search" size={15} />
                <span>No deals match{query ? ` “${query}”` : " this view"}.</span>
                {query && <button className="cl-bucket-link" onClick={onClear}>Clear search <Icon name="arrow-right" size={10} /></button>}
              </div>
            </td></tr>
          )}
          {deals.map(d => (
            <tr key={d.id} style={{ cursor: "pointer" }}
                onClick={() => d.live ? window.CHANLY.nav("live") : d.threadId ? window.CHANLY.nav(window.CHANLY.R.thread(d.threadId)) : d.clientId ? window.CHANLY.nav(window.CHANLY.R.client(d.clientId)) : (d.approval ? window.CHANLY.nav("inbox") : null)}>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  {d.label}
                  {d.leadId && (
                    <button className="chip" data-tip="Also in Leads — one person, tracked in both places · click to open the lead" onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(window.CHANLY.R.lead(d.leadId)); }}>
                      <Icon name="bolt" size={9} /> in Leads
                    </button>
                  )}
                </span>
                <span className="pp-list-src">{d.source}</span>
              </td>
              <td className="muted">{d.who}</td>
              <td>
                <span className={`pill ${
                  d.stage === "won" || (d.decided && !d.decided.declined) ? "pill-ok"
                  : d.approval ? "pill-accent"
                  : d.snoozed ? "pill-warn"
                  : d.live ? "pill-info"
                  : ""}`}>
                  {d.approval ? "Needs you" : d.snoozed ? "Snoozed" : d.decided ? (d.decided.declined ? "Declined" : "Decided ✓") : d.live ? "Live" : stageLabel[d.stage]}
                </span>
              </td>
              <td className="num">{ppMoney(d.value)}</td>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span className="agent-avatar" style={{ width: 18, height: 18, fontSize: 9 }}>{d.agent.glyph}</span>
                  {(d.approval || d.live) && <span className="live-dot" style={{ width: 5, height: 5 }} />}
                  <span className="muted">{d.agent.name}</span>
                </span>
              </td>
              <td className="dim">{d.next}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------- Page ----------
const PipelinePage = () => {
  const { PIPELINE_STAGES, PIPELINE_DEALS, PIPE_BASELINE } = window.PIPELINE_DATA;
  const [view, setView] = usePipeState("board");
  const [query, setQuery] = usePipeState("");
  const [, setTick] = usePipeState(0);
  const searchRef = React.useRef(null);

  usePipeEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target.isContentEditable;
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === "/") { e.preventDefault(); searchRef.current && searchRef.current.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Re-render when a decision lands anywhere (Inbox, Today, Tasks)
  usePipeEffect(() => {
    const bump = () => setTick(n => n + 1);
    window.addEventListener("inbox:decisions", bump);
    return () => window.removeEventListener("inbox:decisions", bump);
  }, []);

  const deals = usePipeMemo(() => {
    let list = PIPELINE_DEALS.map(ppOverlay);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(d =>
        d.who.toLowerCase().includes(q) ||
        d.label.toLowerCase().includes(q) ||
        d.agent.name.toLowerCase().includes(q) ||
        (d.source || "").toLowerCase().includes(q) ||
        (d.next || "").toLowerCase().includes(q)
      );
    }
    return list;
  });

  const open = deals.filter(d => d.stage !== "won");
  const openValue = open.reduce((a, d) => a + d.value, 0);
  const wonToday = deals.filter(d => d.stage === "won").reduce((a, d) => a + d.value, 0);
  const approvals = deals.filter(d => d.approval).length;
  const decidedToday = deals.filter(d => d.decided && !d.decided.declined).length;

  return (
    <div className="pipeline">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Pipeline</div>
          <div className="cl-page-sub">
            Every deal shows which agent is working it and what happens next. You step in on the coral ones.
          </div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label="Open pipeline" value={ppMoney(openValue)} meta={`${open.length} deals`} />
          <StatCell label="Won this week" value={ppMoney(wonToday + ((PIPE_BASELINE || {}).wonPrior || 0))} meta={(PIPE_BASELINE || {}).deltaLabel || "—"} metaTone="pos" />
          <StatCell
            label="Need your call"
            value={approvals}
            meta={approvals > 0 ? "in your Inbox" : decidedToday > 0 ? `all decided · ${decidedToday} today` : "all clear"}
            metaTone={approvals > 0 ? "neg" : "pos"}
          />
        </StatStrip>
      </div>

      <div className="cl-controls">
        <div className="cl-search-wrap">
          <Icon name="search" size={13} />
          <input ref={searchRef} placeholder="Search deals, clients, agents…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="cl-controls-right">
          <div className="cl-tabs">
            <button className={`cl-tab ${view === "board" ? "active" : ""}`} onClick={() => setView("board")}>Board</button>
            <button className={`cl-tab ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>List</button>
          </div>
        </div>
      </div>

      <div className="pp-body">
        {view === "board"
          ? <PipelineBoard stages={PIPELINE_STAGES} deals={deals} query={query.trim()} onClear={() => setQuery("")} />
          : <PipelineList stages={PIPELINE_STAGES} deals={deals} query={query.trim()} onClear={() => setQuery("")} />}
      </div>
    </div>
  );
};

window.PipelinePage = PipelinePage;
